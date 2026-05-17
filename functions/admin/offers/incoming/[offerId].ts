import type { Request, Response } from "express";
import { handleIncomingOfferDetail } from "../../../_lib/admin-handlers/offers-incoming";
import { requireRestId } from "../../../_lib/rest-route";
import { fail } from "../../../_lib/respond";

/**
 * GET /v1/admin/offers/incoming/:offerId
 */
export default async function incomingOfferById(req: Request, res: Response): Promise<void> {
  try {
    const raw = requireRestId(req, res, {
      paramName: "offerId",
      queryKey: "id",
      pathPrefix: ["admin", "offers", "incoming"],
    });
    if (!raw) return;

    const offerId = parseInt(raw, 10);
    await handleIncomingOfferDetail(req, res, offerId);
  } catch (e) {
    console.error("[admin/offers/incoming/[offerId]]", e);
    fail(res, "Failed to load offer", 500);
  }
}
