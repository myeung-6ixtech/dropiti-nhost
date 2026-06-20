import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";
import { parseAddressInput, hasStreetAddress } from "../../_lib/geo/normalize-address";

const QUALITY_QUERY = `
  query CoordinateQuality {
    total: real_estate_property_listing_aggregate {
      aggregate { count }
    }
    published: real_estate_property_listing_aggregate(where: { status: { _eq: "published" } }) {
      aggregate { count }
    }
    missing_coords: real_estate_property_listing_aggregate(
      where: { _or: [{ latitude: { _is_null: true } }, { longitude: { _is_null: true } }] }
    ) {
      aggregate { count }
    }
    published_missing_coords: real_estate_property_listing_aggregate(
      where: {
        status: { _eq: "published" }
        _or: [{ latitude: { _is_null: true } }, { longitude: { _is_null: true } }]
      }
    ) {
      aggregate { count }
    }
    geocode_candidates: real_estate_property_listing(
      where: {
        show_specific_location: { _eq: true }
        _or: [{ latitude: { _is_null: true } }, { longitude: { _is_null: true } }]
      }
      limit: 500
    ) {
      id
      property_uuid
      address
      show_specific_location
    }
  }
`;

/** GET /v1/admin/properties/coordinate-quality — data quality counts for admin dashboard. */
export default async function coordinateQuality(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const result = await hasuraQuery<{
      total?: { aggregate?: { count?: number } };
      published?: { aggregate?: { count?: number } };
      missing_coords?: { aggregate?: { count?: number } };
      published_missing_coords?: { aggregate?: { count?: number } };
      geocode_candidates?: Array<{ address: unknown; show_specific_location?: boolean }>;
    }>(QUALITY_QUERY, {});

    if (result.errors?.length) {
      fail(res, "Failed to load coordinate quality", 500);
      return;
    }

    const candidates = result.data?.geocode_candidates ?? [];
    let missingDistrict = 0;
    let geocodeEligible = 0;

    for (const row of candidates) {
      const addr = parseAddressInput(row.address);
      if (!addr?.district) missingDistrict += 1;
      if (row.show_specific_location && hasStreetAddress(addr)) geocodeEligible += 1;
    }

    ok(res, {
      total: result.data?.total?.aggregate?.count ?? 0,
      published: result.data?.published?.aggregate?.count ?? 0,
      missingCoordinates: result.data?.missing_coords?.aggregate?.count ?? 0,
      publishedMissingCoordinates:
        result.data?.published_missing_coords?.aggregate?.count ?? 0,
      geocodeEligibleSample: geocodeEligible,
      missingDistrictSample: missingDistrict,
    });
  } catch (error) {
    console.error("[admin/properties/coordinate-quality]", error);
    fail(res, "Internal server error", 500);
  }
}
