import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const Q = `query {
  accepted: real_estate_offer_aggregate(where: { offer_status: { _eq: "accepted" } }) {
    aggregate { count }
  }
}`;

export default async function analyticsTransactions(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const result = await hasuraQuery<{
      accepted?: { aggregate?: { count?: number } };
    }>(Q);
    ok(res, { acceptedOffers: result.data?.accepted?.aggregate?.count ?? 0 });
  } catch (e) {
    console.error("[admin/analytics/transactions]", e);
    fail(res, "Internal server error", 500);
  }
}
