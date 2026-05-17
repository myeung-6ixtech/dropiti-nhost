import type { Request, Response } from "express";
import { optionalAuth } from "../../_lib/optional-auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryString, UUID_RE } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

const GET_PROPERTY = `
  query GetPropertyByUuid($property_uuid: uuid!) {
    real_estate_property_listing(
      where: { property_uuid: { _eq: $property_uuid } }
      limit: 1
    ) {
      id
      property_uuid
      title
      description
      address
      rental_price
      rental_price_currency
      num_bedroom
      num_bathroom
      property_type
      display_image
      uploaded_images
      status
      landlord_user_id
      created_at
    }
  }
`;

export default async function getPropertyByUuid(
  req: Request,
  res: Response
): Promise<void> {
  try {
    await optionalAuth(req, res);

    const uuid = queryString(req, "uuid");
    if (!uuid || !UUID_RE.test(uuid)) {
      fail(res, "uuid is required", 400);
      return;
    }

    const result = await hasuraQuery<{ real_estate_property_listing?: unknown[] }>(
      GET_PROPERTY,
      { property_uuid: uuid }
    );

    if (result.errors?.length) {
      fail(res, "Failed to fetch property", 500);
      return;
    }

    const property = result.data?.real_estate_property_listing?.[0];
    if (!property) {
      fail(res, "Property not found", 404);
      return;
    }

    ok(res, property);
  } catch (error) {
    console.error("[client/properties/get-property-by-uuid]", error);
    fail(res, "Internal server error", 500);
  }
}
