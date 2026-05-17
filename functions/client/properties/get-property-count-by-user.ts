import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const COUNT_BY_USER = `
  query PropertyCountByUser($landlord_user_id: uuid!) {
    real_estate_property_listing_aggregate(
      where: { landlord_user_id: { _eq: $landlord_user_id } }
    ) {
      aggregate {
        count
      }
    }
  }
`;

export default async function getPropertyCountByUser(
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

    const result = await hasuraQuery<{
      real_estate_property_listing_aggregate?: { aggregate?: { count?: number } };
    }>(COUNT_BY_USER, { landlord_user_id: userId });

    if (result.errors?.length) {
      fail(res, "Failed to count properties", 500);
      return;
    }

    ok(res, {
      count: result.data?.real_estate_property_listing_aggregate?.aggregate?.count ?? 0,
    });
  } catch (error) {
    console.error("[client/properties/get-property-count-by-user]", error);
    fail(res, "Internal server error", 500);
  }
}
