import type { Request, Response } from "express";
import { optionalAuth } from "../../_lib/optional-auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryString } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

/** Fetch by property `id` (numeric pk) or `property_uuid` when slug not used in schema. */
const GET_BY_ID = `
  query GetPropertyById($id: Int!) {
    real_estate_property_listing_by_pk(id: $id) {
      id
      property_uuid
      title
      description
      address
      rental_price
      status
      landlord_user_id
    }
  }
`;

export default async function getProperty(req: Request, res: Response): Promise<void> {
  try {
    await optionalAuth(req, res);

    const slug = queryString(req, "slug");
    const idParam = queryString(req, "id");

    if (idParam) {
      const id = parseInt(idParam, 10);
      if (!Number.isFinite(id)) {
        fail(res, "Invalid id", 400);
        return;
      }
      const result = await hasuraQuery<{ real_estate_property_listing_by_pk?: unknown }>(
        GET_BY_ID,
        { id }
      );
      if (result.errors?.length) {
        fail(res, "Failed to fetch property", 500);
        return;
      }
      if (!result.data?.real_estate_property_listing_by_pk) {
        fail(res, "Property not found", 404);
        return;
      }
      ok(res, result.data.real_estate_property_listing_by_pk);
      return;
    }

    if (slug) {
      fail(res, "Use get-property-by-uuid with property uuid", 400);
      return;
    }

    fail(res, "id or slug is required", 400);
  } catch (error) {
    console.error("[client/properties/get-property]", error);
    fail(res, "Internal server error", 500);
  }
}
