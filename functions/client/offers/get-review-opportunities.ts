import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { OFFER_FIELDS } from "../../_lib/offers-core";
import { ok, fail } from "../../_lib/respond";

const REVIEW_OPPORTUNITIES = `
  query ReviewOpportunities($userId: String!) {
    real_estate_offer(
      where: {
        _or: [
          { initiator_user_id: { _eq: $userId } }
          { recipient_user_id: { _eq: $userId } }
        ]
        offer_status: { _eq: "accepted" }
        is_active: { _eq: true }
      }
      order_by: { updated_at: desc }
    ) {
      ${OFFER_FIELDS}
    }
  }
`;

export default async function getReviewOpportunities(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const result = await hasuraQuery<{ real_estate_offer?: unknown[] }>(
      REVIEW_OPPORTUNITIES,
      { userId }
    );

    if (result.errors?.length) {
      fail(res, "Failed to fetch review opportunities", 500);
      return;
    }

    ok(res, { items: result.data?.real_estate_offer ?? [] });
  } catch (error) {
    console.error("[client/offers/get-review-opportunities]", error);
    fail(res, "Internal server error", 500);
  }
}
