import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryString, UUID_RE } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

const DELETE_DRAFT = `
  mutation DeleteDraft($property_uuid: uuid!, $landlord_user_id: uuid!) {
    delete_real_estate_property_listing(
      where: {
        property_uuid: { _eq: $property_uuid }
        status: { _eq: "draft" }
        landlord_user_id: { _eq: $landlord_user_id }
      }
    ) {
      affected_rows
    }
  }
`;

export default async function deleteDraft(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "DELETE") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const propertyUuid = queryString(req, "property_uuid");
    if (!propertyUuid || !UUID_RE.test(propertyUuid)) {
      fail(res, "property_uuid is required", 400);
      return;
    }

    const result = await hasuraQuery<{
      delete_real_estate_property_listing?: { affected_rows: number };
    }>(DELETE_DRAFT, { property_uuid: propertyUuid, landlord_user_id: userId });

    if (result.errors?.length) {
      fail(res, "Failed to delete draft", 500);
      return;
    }

    if ((result.data?.delete_real_estate_property_listing?.affected_rows ?? 0) === 0) {
      fail(res, "Draft not found", 404);
      return;
    }

    ok(res, { deleted: true });
  } catch (error) {
    console.error("[client/properties/delete-draft]", error);
    fail(res, "Internal server error", 500);
  }
}
