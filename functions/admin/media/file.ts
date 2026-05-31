import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { getHasuraAdminSecret, getStorageBaseUrl } from "../../_lib/env";
import { fail } from "../../_lib/respond";

const TRANSFORM_PARAMS = new Set(["w", "h", "f", "q", "blur"]);

function resolveFileId(req: Request): string | null {
  const raw = req.query.id ?? req.query.fileId;
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return id;
}

/**
 * GET /v1/admin/media/file?id={nhostFileUuid}
 * Streams a Nhost Storage file using server-side admin credentials.
 * Admin console proxies this for `<img>` tags (no Authorization header in browser).
 */
export default async function adminMediaFile(req: Request, res: Response): Promise<void> {
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

    const storageBase = getStorageBaseUrl();
    if (!storageBase) {
      fail(res, "Nhost Storage is not configured", 503);
      return;
    }

    const transform = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (!TRANSFORM_PARAMS.has(key) || typeof value !== "string" || !value.trim()) continue;
      transform.set(key, value.trim());
    }
    const qs = transform.toString();
    const upstreamUrl = `${storageBase}/files/${fileId}${qs ? `?${qs}` : ""}`;

    const upstream = await fetch(upstreamUrl, {
      headers: { "x-hasura-admin-secret": getHasuraAdminSecret() },
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      fail(
        res,
        `Storage download failed (HTTP ${upstream.status})`,
        upstream.status === 404 ? 404 : 502,
        process.env.NODE_ENV !== "production" ? text.slice(0, 200) : undefined
      );
      return;
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    const etag = upstream.headers.get("etag");
    if (etag) res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", upstream.headers.get("cache-control") ?? "private, max-age=3600");
    res.status(200).send(body);
  } catch (error) {
    console.error("[admin/media/file]", error);
    fail(res, "Internal server error", 500);
  }
}
