import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parseListQuery, listEnvelope } from "../../_lib/admin-pagination";
import { normalizeMediaRow } from "../../_lib/media-normalize";
import { ok, fail } from "../../_lib/respond";

/** Escape `%` and `_` for Postgres ILIKE via Hasura. */
function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

const MEDIA_FIELDS = `
  id
  s3_bucket
  s3_key
  public_url
  sha256
  etag
  content_type
  size_bytes
  width
  height
  original_filename
  created_at
  updated_at
`;

const LIST_MEDIA = `
  query AdminListMedia($limit: Int!, $offset: Int!, $search: String!) {
    real_estate_media_assets(
      where: {
        deleted_at: { _is_null: true }
        _or: [
          { original_filename: { _ilike: $search } }
          { s3_key: { _ilike: $search } }
          { public_url: { _ilike: $search } }
          { content_type: { _ilike: $search } }
          { sha256: { _ilike: $search } }
        ]
      }
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
    ) {
      ${MEDIA_FIELDS}
    }
    real_estate_media_assets_aggregate(
      where: {
        deleted_at: { _is_null: true }
        _or: [
          { original_filename: { _ilike: $search } }
          { s3_key: { _ilike: $search } }
          { public_url: { _ilike: $search } }
          { content_type: { _ilike: $search } }
          { sha256: { _ilike: $search } }
        ]
      }
    ) {
      aggregate { count }
    }
  }
`;

const LIST_MEDIA_NO_SEARCH = `
  query AdminListMedia($limit: Int!, $offset: Int!) {
    real_estate_media_assets(
      where: { deleted_at: { _is_null: true } }
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
    ) {
      ${MEDIA_FIELDS}
    }
    real_estate_media_assets_aggregate(where: { deleted_at: { _is_null: true } }) {
      aggregate { count }
    }
  }
`;

/**
 * GET /v1/admin/media — list media assets (file: admin/media/index.ts).
 * Admin console BFF: `GET admin/media` → this path (no `/index` suffix on Nhost).
 */
export default async function adminMediaIndex(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") {
      fail(res, "Method not allowed", 405);
      return;
    }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const { limit, offset, search } = parseListQuery(req);
    const variables: Record<string, unknown> = { limit, offset };
    let query = LIST_MEDIA_NO_SEARCH;
    if (search) {
      query = LIST_MEDIA;
      variables.search = `%${escapeIlikePattern(search)}%`;
    }

    const result = await hasuraQuery<{
      real_estate_media_assets?: unknown[];
      real_estate_media_assets_aggregate?: { aggregate?: { count?: number } };
    }>(query, variables);

    if (result.errors?.length) {
      const first = result.errors[0]?.message ?? "unknown";
      console.error("[admin/media/index] Hasura:", first, result.errors);
      const exposeHasura =
        process.env.NODE_ENV !== "production" ||
        process.env.DROPITI_EXPOSE_HASURA_ERRORS === "1";
      fail(
        res,
        "Failed to list media",
        500,
        exposeHasura
          ? { hasuraMessages: result.errors.map((e) => e.message) }
          : undefined
      );
      return;
    }

    const items = (result.data?.real_estate_media_assets ?? []).map((row) =>
      normalizeMediaRow(row as { public_url?: string; s3_key?: string })
    );
    const total =
      result.data?.real_estate_media_assets_aggregate?.aggregate?.count ?? items.length;
    ok(res, listEnvelope(items, total, limit, offset));
  } catch (e) {
    console.error("[admin/media/index]", e);
    fail(res, "Internal server error", 500);
  }
}
