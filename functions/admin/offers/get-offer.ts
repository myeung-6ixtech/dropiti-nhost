import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { GET_OFFER_BY_PK } from "../../_lib/admin-offers-incoming";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

export default async function adminGetOffer(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const offerId = parseInt(String(req.query.offerId ?? req.query.id ?? ""), 10);
    if (!Number.isFinite(offerId) || offerId <= 0) {
      fail(res, "offerId is required", 400);
      return;
    }
    const result = await hasuraQuery<{ real_estate_offer_by_pk?: unknown }>(
      GET_OFFER_BY_PK,
      { id: offerId }
    );
    if (result.errors?.length) { fail(res, "Failed to load offer", 500); return; }
    const offer = result.data?.real_estate_offer_by_pk;
    if (!offer) { fail(res, "Offer not found", 404); return; }
    ok(res, { offer });
  } catch (e) {
    console.error("[admin/offers/get-offer]", e);
    fail(res, "Internal server error", 500);
  }
}
