import type { Request } from "express";

/** Static route action segments — not resource ids. */
const RESERVED_SEGMENTS = new Set([
  "index",
  "cancel",
  "attach-method",
  "client-secret",
  "create",
  "get",
  "update",
  "delete",
  "incoming",
  "incoming-detail",
  "get-user",
  "get-property",
  "get-customer",
  "get-beneficiary",
  "get-intent",
  "get-payment",
  "create-property",
  "update-property",
]);

/** Path segments from the request URL (no query string). */
export function pathSegments(req: Request): string[] {
  const raw = req.path ?? req.url?.split("?")[0] ?? "";
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  return normalized.split("/").filter(Boolean);
}

/**
 * ID segment immediately after a fixed prefix path.
 * e.g. prefix `["admin","users"]` on `/v1/admin/users/{id}` → `{id}`.
 */
export function pathIdAfter(req: Request, prefix: string[]): string | null {
  const segs = pathSegments(req);
  if (segs.length < prefix.length) return null;

  let start = -1;
  for (let i = 0; i <= segs.length - prefix.length; i++) {
    if (prefix.every((p, j) => segs[i + j] === p)) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  const idIndex = start + prefix.length;
  const id = segs[idIndex];
  if (!id || id === "index" || RESERVED_SEGMENTS.has(id)) return null;
  if (id.startsWith("[") && id.endsWith("]")) return null;
  return decodeURIComponent(id);
}

/** Last path segment (e.g. action name `cancel` under `.../payments/:id/cancel`). */
export function pathTail(req: Request): string | null {
  const segs = pathSegments(req);
  const last = segs[segs.length - 1];
  return last ? decodeURIComponent(last) : null;
}

/**
 * Resolve resource id from query string or path (REST).
 * Query wins when present (legacy compatibility).
 */
export function resolveId(
  req: Request,
  queryKey: string,
  pathPrefix: string[]
): string | null {
  const q = req.query[queryKey];
  if (typeof q === "string" && q.trim()) return q.trim();
  return pathIdAfter(req, pathPrefix);
}
