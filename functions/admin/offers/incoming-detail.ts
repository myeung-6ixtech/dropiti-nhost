import type { Request, Response } from "express";
import { handleIncomingOfferDetail } from "../../_lib/admin-handlers/offers-incoming";
import { requireRestId } from "../../_lib/rest-route";
import { fail } from "../../_lib/respond";

/** Legacy: GET /v1/admin/offers/incoming-detail?id= */
export default async function incomingDetail(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const raw = requireRestId(req, res, {
      queryKey: "id",
      pathPrefix: ["admin", "offers", "incoming"],
    });
    if (!raw) return;
    const id = parseInt(raw, 10);
    await handleIncomingOfferDetail(req, res, id);
  } catch (error) {
    console.error("[admin/offers/incoming-detail]", error);
    fail(res, "Failed to load offer", 500);
  }
}
