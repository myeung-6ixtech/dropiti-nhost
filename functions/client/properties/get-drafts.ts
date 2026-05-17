import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const GET_DRAFTS = `
  query GetDrafts($landlord_user_id: uuid!) {
    real_estate_property_listing(
      where: {
        landlord_user_id: { _eq: $landlord_user_id }
        status: { _eq: "draft" }
      }
      order_by: { last_saved_at: desc }
    ) {
      id
      property_uuid
      title
      description
      status
      completion_percentage
      last_saved_at
      created_at
      updated_at
    }
  }
`;

export default async function getDrafts(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const result = await hasuraQuery<{ real_estate_property_listing?: unknown[] }>(
      GET_DRAFTS,
      { landlord_user_id: userId }
    );

    if (result.errors?.length) {
      fail(res, "Failed to fetch drafts", 500);
      return;
    }

    ok(res, { items: result.data?.real_estate_property_listing ?? [] });
  } catch (error) {
    console.error("[client/properties/get-drafts]", error);
    fail(res, "Internal server error", 500);
  }
}
