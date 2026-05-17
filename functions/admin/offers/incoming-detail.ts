import type { Request, Response } from "express";
import { requireAdminRole, getUserId } from "../../_lib/auth";
import { getAdminIncomingRecipientIds } from "../../_lib/admin-incoming-offers";
import { fetchIncomingOfferById } from "../../_lib/admin-offers-incoming";
import { ok, fail } from "../../_lib/respond";

/**
 * GET /v1/admin/offers/incoming-detail?id=
 */
export default async function incomingDetail(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const adminUserId = getUserId(payload);
    if (!adminUserId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const idParam = typeof req.query.id === "string" ? req.query.id : "";
    const id = parseInt(idParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      fail(res, "Invalid offer id", 400);
      return;
    }

    const allowedRecipients = getAdminIncomingRecipientIds(adminUserId);
    const data = await fetchIncomingOfferById(id, allowedRecipients);
    if (!data) {
      fail(res, "Offer not found", 404);
      return;
    }

    ok(res, data);
  } catch (error) {
    console.error("[admin/offers/incoming-detail]", error);
    fail(res, "Failed to load offer", 500);
  }
}
