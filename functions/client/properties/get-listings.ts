import type { Request, Response } from "express";
import { optionalAuth } from "../../_lib/optional-auth";
import { parsePagination, queryString } from "../../_lib/parse-query";
import { listPublishedProperties } from "../../_lib/properties-listings";
import { ok, fail } from "../../_lib/respond";

export default async function getListings(req: Request, res: Response): Promise<void> {
  try {
    await optionalAuth(req, res);

    const { limit, offset } = parsePagination(req, 10, 100);
    const minPrice = queryString(req, "minPrice");
    const maxPrice = queryString(req, "maxPrice");
    const bedrooms = queryString(req, "bedrooms");
    const type = queryString(req, "type");
    const landlordUserId = queryString(req, "landlord_user_id");
    const location = queryString(req, "location");
    const keyword = queryString(req, "keyword");

    const { items, total } = await listPublishedProperties(limit, offset, {
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      bedrooms: bedrooms ? parseInt(bedrooms, 10) : undefined,
      type: type ?? undefined,
      landlordUserId: landlordUserId ?? undefined,
      location: location ?? undefined,
      keyword: keyword ?? undefined,
    });

    ok(res, {
      items,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("[client/properties/get-listings]", error);
    fail(res, "Internal server error", 500);
  }
}
