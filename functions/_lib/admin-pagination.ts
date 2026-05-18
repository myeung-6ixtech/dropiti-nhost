import type { Request } from "express";

export function parseListQuery(req: Request): {
  limit: number;
  offset: number;
  search: string;
} {
  const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 100);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
  const search =
    typeof req.query.search === "string" ? req.query.search.trim() : "";
  return { limit, offset, search };
}

export function listEnvelope(
  items: unknown[],
  total: number,
  limit: number,
  offset: number
) {
  return {
    items,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  };
}

export function queryParam(req: Request, key: string): string | null {
  const v = req.query[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
