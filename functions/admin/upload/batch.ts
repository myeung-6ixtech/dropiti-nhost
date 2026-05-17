import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole, getUserId } from "../../_lib/auth";
import { isAllowed } from "../../_lib/ratelimit";
import { createPresignedUpload } from "../../_lib/nhost-storage";
import {
  IMAGE_MAX_HEIGHT,
  IMAGE_MAX_WIDTH,
  IMAGE_WEBP_QUALITY,
  isAllowedMime,
  MAX_BATCH_UPLOAD_FILES,
} from "../../_lib/upload-policy";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const FileSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  bucketId: z.string().optional(),
});

const BatchSchema = z.array(FileSchema).min(1).max(MAX_BATCH_UPLOAD_FILES);

export default async function adminUploadBatch(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const adminId = getUserId(payload) ?? "unknown";
    if (!(await isAllowed(`upload:batch:${adminId}`, 10, 60))) {
      fail(res, "Rate limit exceeded", 429);
      return;
    }

    const parsed = BatchSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, "Validation failed", 422, parsed.error.flatten());
      return;
    }

    for (const file of parsed.data) {
      if (!isAllowedMime(file.mimeType)) {
        fail(res, `MIME type not allowed: ${file.mimeType}`, 400);
        return;
      }
    }

    const items = await Promise.all(
      parsed.data.map(async (file) => {
        const presigned = await createPresignedUpload(file);
        return {
          filename: file.filename,
          uploadUrl: presigned.uploadUrl,
          fileId: presigned.fileId,
        };
      })
    );

    ok(res, {
      items,
      imageHints: {
        maxWidth: IMAGE_MAX_WIDTH,
        maxHeight: IMAGE_MAX_HEIGHT,
        webpQuality: IMAGE_WEBP_QUALITY,
      },
    });
  } catch (error) {
    console.error("[admin/upload/batch]", error);
    fail(res, "Internal server error", 500);
  }
}
