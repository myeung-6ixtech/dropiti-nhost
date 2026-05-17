import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const STALLED = `
  query StalledOffers($since: timestamptz!) {
    real_estate_offer(
      where: {
        is_active: { _eq: true }
        updated_at: { _lt: $since }
        offer_status: { _nin: ["accepted", "rejected", "withdrawn"] }
      }
      order_by: { updated_at: asc }
      limit: 100
    ) {
      id offer_key property_uuid initiator_user_id recipient_user_id offer_status updated_at
    }
  }
`;

export default async function stalledOffers(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const days = parseInt(String(req.query.daysSinceLastActivity ?? "3"), 10) || 3;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = await hasuraQuery<{ real_estate_offer?: unknown[] }>(STALLED, { since });
    if (result.errors?.length) { fail(res, "Failed to load stalled offers", 500); return; }
    ok(res, { items: result.data?.real_estate_offer ?? [], daysSinceLastActivity: days });
  } catch (e) {
    console.error("[admin/offers/stalled]", e);
    fail(res, "Internal server error", 500);
  }
}
