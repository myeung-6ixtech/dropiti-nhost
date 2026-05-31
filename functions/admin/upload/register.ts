import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole, getUserId } from "../../_lib/auth";
import { isAllowed } from "../../_lib/ratelimit";
import { isS3Configured } from "../../_lib/env";
import { insertMediaAsset } from "../../_lib/media-assets";
import { isAllowedMime } from "../../_lib/upload-policy";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const RegisterSchema = z.object({
  s3Key: z.string().min(1),
  publicUrl: z.string().url(),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().min(1).optional(),
  etag: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

/**
 * POST /v1/admin/upload/register — persist media row after presigned PUT to S3.
 */
export default async function adminUploadRegister(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    if (!isS3Configured()) {
      fail(res, "S3 upload is not configured", 503);
      return;
    }

    const adminId = getUserId(payload) ?? "unknown";
    if (!(await isAllowed(`upload:register:${adminId}`, 60, 60))) {
      fail(res, "Rate limit exceeded", 429);
      return;
    }

    const body = validateBody(req, res, RegisterSchema);
    if (!body) return;

    if (!isAllowedMime(body.mimeType)) {
      fail(res, "MIME type not allowed", 400);
      return;
    }

    const mediaRow = await insertMediaAsset({
      s3Key: body.s3Key,
      publicUrl: body.publicUrl,
      sha256: body.sha256 ?? body.s3Key,
      contentType: body.mimeType,
      sizeBytes: body.sizeBytes,
      etag: body.etag,
      width: body.width,
      height: body.height,
      originalFilename: body.filename,
    });

    if (!mediaRow) {
      fail(res, "Failed to register media asset", 500);
      return;
    }

    ok(res, {
      filename: body.filename,
      publicUrl: mediaRow.publicUrl,
      s3Key: mediaRow.s3Key,
      fileId: mediaRow.s3Key,
      mediaId: mediaRow.id,
    });
  } catch (error) {
    console.error("[admin/upload/register]", error);
    fail(res, "Internal server error", 500);
  }
}
