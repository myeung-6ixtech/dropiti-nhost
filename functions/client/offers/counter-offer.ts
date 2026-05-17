import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { toDatabasePaymentFrequency } from "../../_lib/payment-frequency";
import { validateBody } from "../../_lib/validate";
import {
  loadOfferById,
  isOfferParticipant,
  updateOffer,
} from "../../_lib/offers-core";
import { ok, fail } from "../../_lib/respond";

const CounterSchema = z.object({
  offerId: z.number().int().positive(),
  proposingRentPrice: z.number().positive(),
  numLeasingMonths: z.number().int().positive().optional(),
  paymentFrequency: z.string().optional(),
  moveInDate: z.string().optional(),
});

export default async function counterOffer(req: Request, res: Response): Promise<void> {
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

    const body = validateBody(req, res, CounterSchema);
    if (!body) return;

    const offer = await loadOfferById(body.offerId);
    if (!offer || !isOfferParticipant(offer, userId)) {
      fail(res, "Offer not found", 404);
      return;
    }

    const round = (offer.negotiation_round ?? 0) + 1;

    const updated = await updateOffer(body.offerId, {
      offer_status: "countered",
      current_rent_price: body.proposingRentPrice,
      current_num_leasing_months: body.numLeasingMonths ?? offer.num_leasing_months,
      current_payment_frequency: body.paymentFrequency
        ? toDatabasePaymentFrequency(body.paymentFrequency)
        : offer.payment_frequency,
      current_move_in_date: body.moveInDate ?? offer.move_in_date,
      negotiation_round: round,
      last_action_by: offer.initiator_user_id === userId ? "initiator" : "recipient",
      last_action_at: new Date().toISOString(),
    });

    if (!updated) {
      fail(res, "Failed to counter offer", 500);
      return;
    }

    ok(res, updated);
  } catch (error) {
    console.error("[client/offers/counter-offer]", error);
    fail(res, "Internal server error", 500);
  }
}
