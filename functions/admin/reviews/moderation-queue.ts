import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parseListQuery, listEnvelope } from "../../_lib/admin-pagination";
import { ok, fail } from "../../_lib/respond";

const QUEUE = `
  query ReviewModerationQueue($limit: Int!, $offset: Int!) {
    real_estate_review(
      limit: $limit offset: $offset order_by: { created_at: desc }
    ) {
      id review_uuid rating comment reviewer_user_id reviewee_user_id property_uuid created_at is_public
    }
    real_estate_review_aggregate { aggregate { count } }
  }
`;

export default async function reviewModerationQueue(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const { limit, offset } = parseListQuery(req);
    const result = await hasuraQuery<{
      real_estate_review?: unknown[];
      real_estate_review_aggregate?: { aggregate?: { count?: number } };
    }>(QUEUE, { limit, offset });
    if (result.errors?.length) { fail(res, "Failed to load reviews", 500); return; }
    const items = result.data?.real_estate_review ?? [];
    const total = result.data?.real_estate_review_aggregate?.aggregate?.count ?? items.length;
    ok(res, listEnvelope(items, total, limit, offset));
  } catch (e) {
    console.error("[admin/reviews/moderation-queue]", e);
    fail(res, "Internal server error", 500);
  }
}
