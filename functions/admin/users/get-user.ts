import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryParam } from "../../_lib/admin-pagination";
import { UUID_RE } from "../../_lib/admin-offers-incoming";
import { ok, fail } from "../../_lib/respond";

const GET_USER = `
  query AdminGetUser($userId: uuid!) {
    real_estate_user(
      where: { _or: [{ nhost_user_id: { _eq: $userId } }, { uuid: { _eq: $userId } }] }
      limit: 1
    ) {
      nhost_user_id uuid email display_name first_name last_name phone_number photo_url location
      created_at updated_at user_profile { defaultRole }
    }
    properties: real_estate_property_listing_aggregate(
      where: { landlord_user_id: { _eq: $userId } }
    ) { aggregate { count } }
    offers_sent: real_estate_offer_aggregate(
      where: { initiator_user_id: { _eq: $userId } }
    ) { aggregate { count } }
  }
`;

export default async function adminGetUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const userId = queryParam(req, "userId");
    if (!userId || !UUID_RE.test(userId)) { fail(res, "userId must be a valid UUID", 400); return; }
    const result = await hasuraQuery<{
      real_estate_user?: unknown[];
      properties?: { aggregate?: { count?: number } };
      offers_sent?: { aggregate?: { count?: number } };
    }>(GET_USER, { userId });
    if (result.errors?.length) { fail(res, "Failed to load user", 500); return; }
    const user = result.data?.real_estate_user?.[0];
    if (!user) { fail(res, "User not found", 404); return; }
    ok(res, {
      user,
      statistics: {
        propertyCount: result.data?.properties?.aggregate?.count ?? 0,
        offersSentCount: result.data?.offers_sent?.aggregate?.count ?? 0,
      },
    });
  } catch (e) {
    console.error("[admin/users/get-user]", e);
    fail(res, "Internal server error", 500);
  }
}
