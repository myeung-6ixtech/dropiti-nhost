import type { Request, Response } from "express";
import { optionalAuth } from "../../_lib/optional-auth";
import { parsePagination, queryString } from "../../_lib/parse-query";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const MAP_LISTINGS = `
  query MapListings(
    $limit: Int!
    $offset: Int!
    $filters: real_estate_property_listing_bool_exp!
  ) {
    real_estate_property_listing(
      limit: $limit
      offset: $offset
      where: $filters
      order_by: { created_at: desc }
    ) {
      id
      property_uuid
      title
      rental_price
      display_image
      latitude
      longitude
      show_specific_location
      address
    }
    real_estate_property_listing_aggregate(where: $filters) {
      aggregate { count }
    }
  }
`;

function buildFilters(req: Request): Record<string, unknown> {
  const and: Record<string, unknown>[] = [{ status: { _eq: "published" } }];

  const minPrice = queryString(req, "minPrice");
  const maxPrice = queryString(req, "maxPrice");
  const bedrooms = queryString(req, "bedrooms");
  const type = queryString(req, "type");
  const location = queryString(req, "location");

  if (minPrice) and.push({ rental_price: { _gte: parseFloat(minPrice) } });
  if (maxPrice) and.push({ rental_price: { _lte: parseFloat(maxPrice) } });
  if (bedrooms) and.push({ num_bedroom: { _gte: parseInt(bedrooms, 10) } });
  if (type) and.push({ property_type: { _eq: type } });
  if (location) and.push({ address: { _ilike: `%${location}%` } });

  return and.length === 1 ? and[0]! : { _and: and };
}

/** Lightweight map payload — id, coords, price, image only. */
export default async function getListingsMap(req: Request, res: Response): Promise<void> {
  try {
    await optionalAuth(req, res);

    const { limit, offset } = parsePagination(req, 10, 100);
    const filters = buildFilters(req);

    const result = await hasuraQuery<{
      real_estate_property_listing?: unknown[];
      real_estate_property_listing_aggregate?: { aggregate?: { count?: number } };
    }>(MAP_LISTINGS, { limit, offset, filters });

    if (result.errors?.length) {
      fail(res, "Failed to load map listings", 500);
      return;
    }

    const items = result.data?.real_estate_property_listing ?? [];
    const total =
      result.data?.real_estate_property_listing_aggregate?.aggregate?.count ?? items.length;

    ok(res, {
      items,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("[client/properties/get-listings-map]", error);
    fail(res, "Internal server error", 500);
  }
}
