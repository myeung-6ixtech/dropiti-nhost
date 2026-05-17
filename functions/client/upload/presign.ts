import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../_lib/auth";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const PresignSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  bucketId: z.string().optional(),
});

/**
 * Validates upload intent. Prefer `nhost.storage.upload()` in the client;
 * this endpoint enforces MIME allowlist before the client uploads.
 */
export default async function presign(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const body = validateBody(req, res, PresignSchema);
    if (!body) return;

    if (!ALLOWED_MIME.has(body.mimeType)) {
      fail(res, "MIME type not allowed", 400);
      return;
    }

    const bucketId = body.bucketId ?? "default";

    ok(res, {
      allowed: true,
      bucketId,
      filename: body.filename,
      mimeType: body.mimeType,
      message:
        "Upload via Nhost Storage from the client (@nhost/nhost-js storage.upload). Server-side presign URLs are not generated in this build.",
    });
  } catch (error) {
    console.error("[client/upload/presign]", error);
    fail(res, "Internal server error", 500);
  }
}
