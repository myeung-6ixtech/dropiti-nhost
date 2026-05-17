import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryParam } from "../../_lib/admin-pagination";
import { UUID_RE } from "../../_lib/admin-offers-incoming";
import { ok, fail } from "../../_lib/respond";

const GET_PROPERTY = `
  query AdminGetProperty($propertyUuid: uuid!) {
    real_estate_property_listing(
      where: { property_uuid: { _eq: $propertyUuid } }
      limit: 1
    ) {
      id property_uuid title description status rental_price rental_price_currency
      landlord_user_id external_contact completion_percentage created_at updated_at
    }
  }
`;

export default async function adminGetProperty(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const propertyUuid = queryParam(req, "propertyUuid");
    if (!propertyUuid || !UUID_RE.test(propertyUuid)) {
      fail(res, "propertyUuid must be a valid UUID", 400);
      return;
    }
    const result = await hasuraQuery<{ real_estate_property_listing?: unknown[] }>(
      GET_PROPERTY,
      { propertyUuid }
    );
    if (result.errors?.length) { fail(res, "Failed to load property", 500); return; }
    const property = result.data?.real_estate_property_listing?.[0];
    if (!property) { fail(res, "Property not found", 404); return; }
    ok(res, { property });
  } catch (e) {
    console.error("[admin/properties/get-property]", e);
    fail(res, "Internal server error", 500);
  }
}
