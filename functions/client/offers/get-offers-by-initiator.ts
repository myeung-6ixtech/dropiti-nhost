import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { OFFER_FIELDS } from "../../_lib/offers-core";
import { enrichOffersWithDetails } from "../../_lib/enrich-offers";
import { ok, fail } from "../../_lib/respond";

const GET_ACCEPTED_GROUP_IDS = `
  query AcceptedGroupIdsForUser($userId: String!) {
    real_estate_tenancy_group_members(
      where: { user_id: { _eq: $userId }, status: { _eq: "accepted" } }
    ) {
      group_id
    }
  }
`;

const GET_BY_INITIATOR_OR_GROUPS = `
  query OffersByInitiatorOrGroups($initiatorUserId: String!, $groupIds: [uuid!]!) {
    real_estate_offer(
      where: {
        _or: [
          { initiator_user_id: { _eq: $initiatorUserId } }
          { group_id: { _in: $groupIds } }
        ]
      }
      order_by: { created_at: desc }
    ) {
      ${OFFER_FIELDS}
    }
  }
`;

const GET_BY_INITIATOR = `
  query OffersByInitiator($initiatorUserId: String!) {
    real_estate_offer(
      where: { initiator_user_id: { _eq: $initiatorUserId } }
      order_by: { created_at: desc }
    ) {
      ${OFFER_FIELDS}
    }
  }
`;

export default async function getOffersByInitiator(
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

    const membershipResult = await hasuraQuery<{
      real_estate_tenancy_group_members?: Array<{ group_id: string }>;
    }>(GET_ACCEPTED_GROUP_IDS, { userId });

    if (membershipResult.errors?.length) {
      fail(res, "Failed to fetch group memberships", 500);
      return;
    }

    const groupIds = [
      ...new Set(
        (membershipResult.data?.real_estate_tenancy_group_members ?? []).map((m) => m.group_id)
      ),
    ];

    const result =
      groupIds.length > 0
        ? await hasuraQuery<{ real_estate_offer?: unknown[] }>(GET_BY_INITIATOR_OR_GROUPS, {
            initiatorUserId: userId,
            groupIds,
          })
        : await hasuraQuery<{ real_estate_offer?: unknown[] }>(GET_BY_INITIATOR, {
            initiatorUserId: userId,
          });

    if (result.errors?.length) {
      fail(res, "Failed to fetch offers", 500);
      return;
    }

    const rawItems = result.data?.real_estate_offer ?? [];
    const items = await enrichOffersWithDetails(
      rawItems as Parameters<typeof enrichOffersWithDetails>[0]
    );

    ok(res, { items });
  } catch (error) {
    console.error("[client/offers/get-offers-by-initiator]", error);
    fail(res, "Internal server error", 500);
  }
}
