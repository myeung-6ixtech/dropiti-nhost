import type { Request, Response } from "express";
import { requireAdminRole, getUserId } from "../auth";
import { getAdminIncomingRecipientIds } from "../admin-incoming-offers";
import { fetchIncomingOfferById } from "../admin-offers-incoming";
import { ok, fail } from "../respond";

export async function handleIncomingOfferDetail(
  req: Request,
  res: Response,
  offerId: number
): Promise<void> {
  if (req.method !== "GET") {
    fail(res, "Method not allowed", 405);
    return;
  }
  const payload = await requireAdminRole(req, res);
  if (!payload) return;

  const adminUserId = getUserId(payload);
  if (!adminUserId) {
    fail(res, "Invalid session", 401);
    return;
  }

  if (!Number.isFinite(offerId) || offerId < 1) {
    fail(res, "Invalid offer id", 400);
    return;
  }

  const allowedRecipients = getAdminIncomingRecipientIds(adminUserId);
  const data = await fetchIncomingOfferById(offerId, allowedRecipients);
  if (!data) {
    fail(res, "Offer not found", 404);
    return;
  }

  ok(res, data);
}
