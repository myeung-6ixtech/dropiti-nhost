import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { validateBody } from "../../_lib/validate";
import {
  loadOfferById,
  isOfferParticipant,
  updateOffer,
} from "../../_lib/offers-core";
import { ok, fail } from "../../_lib/respond";

const RejectSchema = z.object({
  offerId: z.number().int().positive(),
  reason: z.string().optional(),
});

export default async function rejectOffer(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const body = validateBody(req, res, RejectSchema);
    if (!body) return;

    const offer = await loadOfferById(body.offerId);
    if (!offer || !isOfferParticipant(offer, userId)) {
      fail(res, "Offer not found", 404);
      return;
    }

    const updated = await updateOffer(body.offerId, {
      offer_status: "rejected",
      is_active: false,
      last_action_by: offer.initiator_user_id === userId ? "initiator" : "recipient",
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (!updated) {
      fail(res, "Failed to reject offer", 500);
      return;
    }

    ok(res, updated);
  } catch (error) {
    console.error("[client/offers/reject-offer]", error);
    fail(res, "Internal server error", 500);
  }
}
