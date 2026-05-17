import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parseListQuery, listEnvelope } from "../../_lib/admin-pagination";
import { ok, fail } from "../../_lib/respond";

const QUEUE = `
  query PropertyModerationQueue($limit: Int!, $offset: Int!) {
    real_estate_property_listing(
      where: {
        _or: [
          { status: { _eq: "draft" } }
          { completion_percentage: { _lt: 80 } }
        ]
      }
      limit: $limit offset: $offset order_by: { updated_at: asc }
    ) {
      property_uuid title status completion_percentage landlord_user_id updated_at external_contact
    }
    real_estate_property_listing_aggregate(
      where: {
        _or: [
          { status: { _eq: "draft" } }
          { completion_percentage: { _lt: 80 } }
        ]
      }
    ) { aggregate { count } }
  }
`;

export default async function moderationQueue(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const { limit, offset } = parseListQuery(req);
    const result = await hasuraQuery<{
      real_estate_property_listing?: unknown[];
      real_estate_property_listing_aggregate?: { aggregate?: { count?: number } };
    }>(QUEUE, { limit, offset });
    if (result.errors?.length) { fail(res, "Failed to load moderation queue", 500); return; }
    const items = result.data?.real_estate_property_listing ?? [];
    const total = result.data?.real_estate_property_listing_aggregate?.aggregate?.count ?? items.length;
    ok(res, listEnvelope(items, total, limit, offset));
  } catch (e) {
    console.error("[admin/properties/moderation-queue]", e);
    fail(res, "Internal server error", 500);
  }
}
