import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const DASHBOARD = `
  query AdminDashboard {
    users: real_estate_user_aggregate { aggregate { count } }
    properties: real_estate_property_listing_aggregate { aggregate { count } }
    offers: real_estate_offer_aggregate(where: { is_active: { _eq: true } }) {
      aggregate { count }
    }
    pendingOffers: real_estate_offer_aggregate(
      where: { is_active: { _eq: true }, offer_status: { _eq: "pending" } }
    ) { aggregate { count } }
    draftProperties: real_estate_property_listing_aggregate(
      where: { status: { _eq: "draft" } }
    ) { aggregate { count } }
  }
`;

export default async function analyticsDashboard(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const result = await hasuraQuery<{
      users?: { aggregate?: { count?: number } };
      properties?: { aggregate?: { count?: number } };
      offers?: { aggregate?: { count?: number } };
      pendingOffers?: { aggregate?: { count?: number } };
      draftProperties?: { aggregate?: { count?: number } };
    }>(DASHBOARD);
    if (result.errors?.length) { fail(res, "Failed to load dashboard", 500); return; }
    ok(res, {
      users: result.data?.users?.aggregate?.count ?? 0,
      properties: result.data?.properties?.aggregate?.count ?? 0,
      activeOffers: result.data?.offers?.aggregate?.count ?? 0,
      pendingOffers: result.data?.pendingOffers?.aggregate?.count ?? 0,
      draftProperties: result.data?.draftProperties?.aggregate?.count ?? 0,
    });
  } catch (e) {
    console.error("[admin/analytics/dashboard]", e);
    fail(res, "Internal server error", 500);
  }
}
