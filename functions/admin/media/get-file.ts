import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { downloadNhostStorageFile } from "../../_lib/nhost-storage";
import { fail } from "../../_lib/respond";

function resolveFileId(req: Request): string | null {
  for (const key of ["id", "fileId"]) {
    const raw = req.query[key];
    if (typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw.trim())) {
      return raw.trim();
    }
  }
  return null;
}

function bearerToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return undefined;
  const token = auth.slice("Bearer ".length).trim();
  return token || undefined;
}

/**
 * GET /v1/admin/media/get-file?id={nhostFileUuid}
 * Streams a Nhost Storage file for authenticated admins.
 */
export default async function adminMediaGetFile(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const fileId = resolveFileId(req);
    if (!fileId) {
      fail(res, "Missing or invalid id query parameter", 400);
      return;
    }

    const result = await downloadNhostStorageFile({
      fileId,
      query: req.query as Record<string, unknown>,
      bearerToken: bearerToken(req),
    });

    if (!result.ok) {
      fail(res, result.message, result.status, result.details);
      return;
    }

    if (result.contentType) res.setHeader("Content-Type", result.contentType);
    if (result.etag) res.setHeader("ETag", result.etag);
    res.setHeader("Cache-Control", result.cacheControl ?? "private, max-age=3600");
    res.status(200).send(result.body);
  } catch (error) {
    console.error("[admin/media/get-file]", error);
    fail(res, "Internal server error", 500);
  }
}
