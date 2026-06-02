import type { Request, Response } from "express";
import { requireAdminRole, getUserId } from "../../_lib/auth";
import { isAllowed } from "../../_lib/ratelimit";
import { uploadMediaFile, getProxyUploadMaxBytes, isMediaUploadConfigured } from "../../_lib/media-storage";
import { insertMediaAsset } from "../../_lib/media-assets";
import {
  IMAGE_MAX_HEIGHT,
  IMAGE_MAX_WIDTH,
  IMAGE_WEBP_QUALITY,
  isAllowedMime,
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

function guessMimeTypeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return null;
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

    if (!isMediaUploadConfigured()) {
      fail(res, "Media upload is not configured", 503);
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

    const maxBytes = getProxyUploadMaxBytes();
    if (body.length > maxBytes) {
      fail(
        res,
        `File too large for proxy upload (max ${maxBytes} bytes).`,
        413
      );
      return;
    }

    const filenameHeader = req.headers["x-filename"];
    const filename = filenameHeader
      ? decodeURIComponent(String(filenameHeader))
      : "upload";

    let mimeType = String(req.headers["content-type"] ?? "application/octet-stream")
      .split(";")[0]
      .trim();
    if (!mimeType || mimeType === "application/octet-stream") {
      mimeType = guessMimeTypeFromFilename(filename) ?? "application/octet-stream";
    }
    if (!isAllowedMime(mimeType)) {
      fail(res, `MIME type not allowed: ${mimeType}`, 400);
      return;
    }

    const width = parseOptionalInt(req.headers["x-width"]);
    const height = parseOptionalInt(req.headers["x-height"]);
    const clientSha256 =
      typeof req.headers["x-sha256"] === "string" ? req.headers["x-sha256"].trim() : undefined;

    const uploaded = await uploadMediaFile({
      body,
      filename,
      mimeType,
      sha256: clientSha256,
    });

    const mediaRow = uploaded.deduped && uploaded.mediaId
      ? { id: uploaded.mediaId, publicUrl: uploaded.publicUrl, s3Key: uploaded.storageKey }
      : await insertMediaAsset({
          s3Key: uploaded.storageKey,
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
      s3Key: uploaded.storageKey,
      fileId: uploaded.fileId,
      storageFileId: uploaded.storageFileId ?? null,
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
    const isStorage = message.includes("Storage") || message.includes("S3 PutObject");
    fail(res, isStorage ? message : "Internal server error", isStorage ? 502 : 500);
  }
}
