import type { Request } from "express";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePagination(
  req: Request,
  defaultLimit = 50,
  maxLimit = 100
): { limit: number; offset: number } {
  const limit = Math.min(
    parseInt(String(req.query.limit ?? defaultLimit), 10) || defaultLimit,
    maxLimit
  );
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
  return { limit, offset };
}

export function queryString(req: Request, key: string): string | null {
  const v = req.query[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function queryInt(req: Request, key: string): number | null {
  const s = queryString(req, key);
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
