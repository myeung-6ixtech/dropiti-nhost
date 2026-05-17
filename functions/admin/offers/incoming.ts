import type { Request, Response } from "express";
import { requireAdminRole, getUserId } from "../../_lib/auth";
import { getAdminIncomingRecipientIds } from "../../_lib/admin-incoming-offers";
import { UUID_RE, fetchIncomingOffersList } from "../../_lib/admin-offers-incoming";
import { ok, fail } from "../../_lib/respond";

/**
 * GET /v1/admin/offers/incoming
 */
export default async function incoming(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const adminUserId = getUserId(payload);
    if (!adminUserId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 100);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const statusFilter =
      typeof req.query.status === "string" ? req.query.status.trim() || null : null;
    const propertyUuidParam =
      typeof req.query.propertyUuid === "string"
        ? req.query.propertyUuid.trim() || null
        : null;

    if (propertyUuidParam && !UUID_RE.test(propertyUuidParam)) {
      fail(res, "propertyUuid must be a valid UUID", 400);
      return;
    }

    const recipientIds = getAdminIncomingRecipientIds(adminUserId);
    const { items, total } = await fetchIncomingOffersList({
      recipientIds,
      limit,
      offset,
      statusFilter,
      propertyUuidParam,
    });

    ok(res, {
      items,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("[admin/offers/incoming]", error);
    fail(res, "Failed to load admin incoming offers", 500);
  }
}
