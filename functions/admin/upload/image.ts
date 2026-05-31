import type { Request, Response } from "express";
import { requireAdminRole, getUserId } from "../../_lib/auth";
import { isAllowed } from "../../_lib/ratelimit";
import { putObjectToS3 } from "../../_lib/s3";
import { isS3Configured } from "../../_lib/env";
import { insertMediaAsset } from "../../_lib/media-assets";
import {
  IMAGE_MAX_HEIGHT,
  IMAGE_MAX_WIDTH,
  IMAGE_WEBP_QUALITY,
  isAllowedMime,
  PROXY_UPLOAD_MAX_BYTES,
} from "../../_lib/upload-policy";
import { ok, fail } from "../../_lib/respond";

function parseOptionalInt(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function readRawBody(req: Request): Promise<Buffer | null> {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (Buffer.isBuffer(raw) && raw.length > 0) {
    return Promise.resolve(raw);
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      resolve(body.length > 0 ? body : null);
    });
    req.on("error", reject);
  });
}

/**
 * POST /v1/admin/upload/image — proxy upload (same-origin BFF forwards raw bytes).
 * Body: raw file bytes. Headers: Content-Type, X-Filename, optional X-Width, X-Height, X-Sha256.
 */
export default async function adminUploadImage(req: Request, res: Response): Promise<void> {
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
    if (!(await isAllowed(`upload:image:${adminId}`, 30, 60))) {
      fail(res, "Rate limit exceeded", 429);
      return;
    }

    const body = await readRawBody(req);
    if (!body) {
      fail(res, "No file body", 400);
      return;
    }

    if (body.length > PROXY_UPLOAD_MAX_BYTES) {
      fail(
        res,
        `File too large for proxy upload (max ${PROXY_UPLOAD_MAX_BYTES} bytes). Use presigned upload.`,
        413
      );
      return;
    }

    const mimeType = String(req.headers["content-type"] ?? "application/octet-stream")
      .split(";")[0]
      .trim();
    if (!isAllowedMime(mimeType)) {
      fail(res, `MIME type not allowed: ${mimeType}`, 400);
      return;
    }

    const filenameHeader = req.headers["x-filename"];
    const filename = filenameHeader
      ? decodeURIComponent(String(filenameHeader))
      : "upload";

    const width = parseOptionalInt(req.headers["x-width"]);
    const height = parseOptionalInt(req.headers["x-height"]);
    const clientSha256 =
      typeof req.headers["x-sha256"] === "string" ? req.headers["x-sha256"].trim() : undefined;

    const uploaded = await putObjectToS3({
      body,
      filename,
      mimeType,
      sha256: clientSha256,
    });

    const mediaRow = await insertMediaAsset({
      s3Key: uploaded.s3Key,
      publicUrl: uploaded.publicUrl,
      sha256: uploaded.sha256,
      contentType: mimeType,
      sizeBytes: body.length,
      etag: uploaded.etag,
      width,
      height,
      originalFilename: filename,
    });

    ok(res, {
      filename,
      publicUrl: uploaded.publicUrl,
      s3Key: uploaded.s3Key,
      fileId: uploaded.fileId,
      sha256: uploaded.sha256,
      deduped: uploaded.deduped,
      mediaId: mediaRow?.id ?? null,
      imageHints: {
        maxWidth: IMAGE_MAX_WIDTH,
        maxHeight: IMAGE_MAX_HEIGHT,
        webpQuality: IMAGE_WEBP_QUALITY,
      },
    });
  } catch (error) {
    console.error("[admin/upload/image]", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const isS3 = message.includes("S3 PutObject failed");
    fail(res, isS3 ? message : "Internal server error", isS3 ? 502 : 500);
  }
}
