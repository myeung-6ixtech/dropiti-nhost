import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryString } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";
import {
  resolveListingCoordinates,
  coordinatesToHasuraFields,
  type CoordinateTier,
} from "../../_lib/geo/resolve-listing-coordinates";

const BATCH_SIZE = 50;

const FETCH_NULL_COORDS = `
  query BackfillNullCoords($limit: Int!, $offset: Int!) {
    real_estate_property_listing(
      where: { latitude: { _is_null: true } }
      limit: $limit
      offset: $offset
      order_by: { id: asc }
    ) {
      id
      property_uuid
      address
      show_specific_location
      latitude
      longitude
    }
    real_estate_property_listing_aggregate(where: { latitude: { _is_null: true } }) {
      aggregate { count }
    }
  }
`;

const UPDATE_COORDS = `
  mutation BackfillUpdateCoords($id: Int!, $latitude: numeric, $longitude: numeric) {
    update_real_estate_property_listing_by_pk(
      pk_columns: { id: $id }
      _set: { latitude: $latitude, longitude: $longitude }
    ) {
      id
      property_uuid
    }
  }
`;

type BackfillSummary = {
  total: number;
  updated: number;
  skipped: number;
  byTier: Record<CoordinateTier | "failed", number>;
  mode: "centroid" | "geocode";
};

export default async function backfillCoordinates(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const modeParam = queryString(req, "mode") ?? "centroid";
    const enableGeocode = modeParam === "geocode";
    const maxBatches = parseInt(queryString(req, "maxBatches") ?? "20", 10);

    const summary: BackfillSummary = {
      total: 0,
      updated: 0,
      skipped: 0,
      byTier: { geocoded: 0, district: 0, region: 0, country: 0, failed: 0 },
      mode: enableGeocode ? "geocode" : "centroid",
    };

    for (let batch = 0; batch < maxBatches; batch++) {
      const fetchResult = await hasuraQuery<{
        real_estate_property_listing?: Array<{
          id: number;
          property_uuid: string;
          address: unknown;
          show_specific_location?: boolean;
        }>;
        real_estate_property_listing_aggregate?: { aggregate?: { count?: number } };
      }>(FETCH_NULL_COORDS, { limit: BATCH_SIZE, offset: 0 });

      if (fetchResult.errors?.length) {
        fail(res, fetchResult.errors[0]?.message ?? "Failed to fetch listings", 500);
        return;
      }

      const rows = fetchResult.data?.real_estate_property_listing ?? [];
      if (batch === 0) {
        summary.total =
          fetchResult.data?.real_estate_property_listing_aggregate?.aggregate?.count ?? rows.length;
      }

      if (rows.length === 0) break;

      for (const row of rows) {
        const resolved = await resolveListingCoordinates({
          address: row.address,
          show_specific_location: row.show_specific_location,
          property_uuid: row.property_uuid,
          enableGeocode,
        });

        if (!resolved) {
          summary.skipped += 1;
          summary.byTier.failed += 1;
          continue;
        }

        const fields = coordinatesToHasuraFields(resolved);
        const updateResult = await hasuraQuery(UPDATE_COORDS, {
          id: row.id,
          latitude: fields.latitude,
          longitude: fields.longitude,
        });

        if (updateResult.errors?.length) {
          summary.skipped += 1;
          summary.byTier.failed += 1;
          continue;
        }

        summary.updated += 1;
        summary.byTier[resolved.tier] = (summary.byTier[resolved.tier] ?? 0) + 1;
      }

      if (rows.length < BATCH_SIZE) break;
    }

    ok(res, summary);
  } catch (error) {
    console.error("[admin/properties/backfill-coordinates]", error);
    fail(res, "Internal server error", 500);
  }
}
