import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const LIST_PROPERTIES = `
  query AdminListProperties($limit: Int!, $offset: Int!) {
    real_estate_property_listing(
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
    ) {
      id
      property_uuid
      title
      description
      created_at
      updated_at
      property_type
      rental_price
      rental_price_currency
      landlord_user_id
      external_contact
      completion_percentage
    }
    real_estate_property_listing_aggregate {
      aggregate {
        count
      }
    }
  }
`;

/**
 * GET /v1/admin/properties/index
 */
export default async function adminPropertiesIndex(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.method === "POST") {
      const create = (await import("./create-property")).default;
      await create(req, res);
      return;
    }

    if (req.method !== "GET") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 100);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

    const result = await hasuraQuery<{
      real_estate_property_listing?: unknown[];
      real_estate_property_listing_aggregate?: { aggregate?: { count?: number } };
    }>(LIST_PROPERTIES, { limit, offset });

    if (result.errors?.length) {
      fail(res, "Failed to list properties", 500);
      return;
    }

    const items = result.data?.real_estate_property_listing ?? [];
    const total =
      result.data?.real_estate_property_listing_aggregate?.aggregate?.count ??
      items.length;

    ok(res, {
      items,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("[admin/properties/index]", error);
    fail(res, "Failed to list properties", 500);
  }
}
