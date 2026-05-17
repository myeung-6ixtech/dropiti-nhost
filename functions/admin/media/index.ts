import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parseListQuery, listEnvelope } from "../../_lib/admin-pagination";
import { ok, fail } from "../../_lib/respond";

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

export default async function adminMediaIndex(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") {
      fail(res, "Method not allowed", 405);
      return;
    }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const { limit, offset, search } = parseListQuery(req);
    const searchPattern = search ? `%${search}%` : "%";

    const result = await hasuraQuery<{
      real_estate_media_assets?: unknown[];
      real_estate_media_assets_aggregate?: { aggregate?: { count?: number } };
    }>(LIST_MEDIA, { limit, offset, search: searchPattern });

    if (result.errors?.length) {
      fail(res, "Failed to list media", 500);
      return;
    }

    const items = result.data?.real_estate_media_assets ?? [];
    const total =
      result.data?.real_estate_media_assets_aggregate?.aggregate?.count ?? items.length;
    ok(res, listEnvelope(items, total, limit, offset));
  } catch (e) {
    console.error("[admin/media/index]", e);
    fail(res, "Internal server error", 500);
  }
}
