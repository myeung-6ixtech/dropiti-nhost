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
} from "../../_lib/upload-policy";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const PresignSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  bucketId: z.string().optional(),
});

export default async function adminUploadPresign(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const adminId = getUserId(payload) ?? "unknown";
    if (!(await isAllowed(`upload:presign:${adminId}`, 60, 60))) {
      fail(res, "Rate limit exceeded", 429);
      return;
    }

    const body = validateBody(req, res, PresignSchema);
    if (!body) return;

    if (!isAllowedMime(body.mimeType)) {
      fail(res, "MIME type not allowed", 400);
      return;
    }

    const presigned = await createPresignedUpload(body);

    ok(res, {
      uploadUrl: presigned.uploadUrl,
      fileId: presigned.fileId,
      imageHints: {
        maxWidth: IMAGE_MAX_WIDTH,
        maxHeight: IMAGE_MAX_HEIGHT,
        webpQuality: IMAGE_WEBP_QUALITY,
      },
    });
  } catch (error) {
    console.error("[admin/upload/presign]", error);
    fail(res, "Internal server error", 500);
  }
}
