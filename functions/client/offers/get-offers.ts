import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parsePagination } from "../../_lib/parse-query";
import { OFFER_FIELDS } from "../../_lib/offers-core";
import { ok, fail } from "../../_lib/respond";

const GET_OFFERS = `
  query GetOffersForUser($userId: String!, $limit: Int!, $offset: Int!) {
    real_estate_offer(
      where: {
        _or: [
          { initiator_user_id: { _eq: $userId } }
          { recipient_user_id: { _eq: $userId } }
        ]
        is_active: { _eq: true }
      }
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
    ) {
      ${OFFER_FIELDS}
    }
    real_estate_offer_aggregate(
      where: {
        _or: [
          { initiator_user_id: { _eq: $userId } }
          { recipient_user_id: { _eq: $userId } }
        ]
        is_active: { _eq: true }
      }
    ) {
      aggregate { count }
    }
  }
`;

export default async function getOffers(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const { limit, offset } = parsePagination(req);

    const result = await hasuraQuery<{
      real_estate_offer?: unknown[];
      real_estate_offer_aggregate?: { aggregate?: { count?: number } };
    }>(GET_OFFERS, { userId, limit, offset });

    if (result.errors?.length) {
      fail(res, "Failed to fetch offers", 500);
      return;
    }

    const items = result.data?.real_estate_offer ?? [];
    const total = result.data?.real_estate_offer_aggregate?.aggregate?.count ?? items.length;

    ok(res, { items, pagination: { total, limit, offset, hasMore: offset + limit < total } });
  } catch (error) {
    console.error("[client/offers/get-offers]", error);
    fail(res, "Internal server error", 500);
  }
}
