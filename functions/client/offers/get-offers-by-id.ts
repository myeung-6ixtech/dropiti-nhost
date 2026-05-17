import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { queryInt } from "../../_lib/parse-query";
import { loadOfferById, isOfferParticipant } from "../../_lib/offers-core";
import { ok, fail } from "../../_lib/respond";

export default async function getOffersById(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const offerId = queryInt(req, "offerId") ?? queryInt(req, "id");
    if (offerId === null) {
      fail(res, "offerId is required", 400);
      return;
    }

    const offer = await loadOfferById(offerId);
    if (!offer || !isOfferParticipant(offer, userId)) {
      fail(res, "Offer not found", 404);
      return;
    }

    ok(res, offer);
  } catch (error) {
    console.error("[client/offers/get-offers-by-id]", error);
    fail(res, "Internal server error", 500);
  }
}
