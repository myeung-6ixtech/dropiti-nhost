import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { UUID_RE } from "../../_lib/admin-offers-incoming";
import { ok, fail } from "../../_lib/respond";

const LIST_PROPERTIES = `
  query AdminListProperties(
    $limit: Int!
    $offset: Int!
    $where: real_estate_property_listing_bool_exp!
    $order_by: [real_estate_property_listing_order_by!]!
  ) {
    real_estate_property_listing(
      limit: $limit
      offset: $offset
      where: $where
      order_by: $order_by
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
      status
      address
      num_bedroom
      num_bathroom
      rental_space
      furnished
      pets_allowed
      amenities
      display_image
      uploaded_images
      availability_date
      external_url
      show_specific_location
      gross_area_size
      gross_area_size_unit
    }
    real_estate_property_listing_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

/** Escape `%` and `_` for Postgres ILIKE via Hasura. */
function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseSortOrder(req: Request): Record<string, string>[] {
  const raw =
    typeof req.query.sortBy === "string" ? req.query.sortBy.trim() : "";
  const allowed = new Set([
    "created_at",
    "updated_at",
    "rental_price",
    "completion_percentage",
  ]);
  const col = allowed.has(raw) ? raw : "created_at";
  return [{ [col]: "desc" }];
}

/**
 * Build Hasura `where` from v6-style query params (§8a).
 * @returns `{ where }` or `{ error: string }` for validation failures.
 */
function buildListWhere(req: Request): { where: Record<string, unknown> } | { error: string } {
  const and: Record<string, unknown>[] = [];

  const status =
    typeof req.query.status === "string" ? req.query.status.trim() : "";
  if (status) {
    and.push({ status: { _eq: status } });
  }

  const landlordId =
    typeof req.query.landlordId === "string" ? req.query.landlordId.trim() : "";
  if (landlordId) {
    if (!UUID_RE.test(landlordId)) {
      return { error: "landlordId must be a valid UUID" };
    }
    and.push({ landlord_user_id: { _eq: landlordId } });
  }

  const search =
    typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search) {
    and.push({ title: { _ilike: `%${escapeIlikePattern(search)}%` } });
  }

  if (and.length === 0) {
    return { where: {} };
  }
  if (and.length === 1) {
    return { where: and[0] as Record<string, unknown> };
  }
  return { where: { _and: and } };
}

/** v6 §8a aliases: `currency`, `primary_image`, `images` alongside Hasura columns. */
function enrichAdminPropertyListItem(row: Record<string, unknown>): Record<string, unknown> {
  const uploaded = row.uploaded_images;
  return {
    ...row,
    currency: row.rental_price_currency ?? null,
    primary_image: row.display_image ?? null,
    images: Array.isArray(uploaded) ? uploaded : [],
  };
}

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

    const listFilter = buildListWhere(req);
    if ("error" in listFilter) {
      fail(res, listFilter.error, 400);
      return;
    }

    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 100);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const orderBy = parseSortOrder(req);

    const result = await hasuraQuery<{
      real_estate_property_listing?: Record<string, unknown>[];
      real_estate_property_listing_aggregate?: { aggregate?: { count?: number } };
    }>(LIST_PROPERTIES, {
      limit,
      offset,
      where: listFilter.where,
      order_by: orderBy,
    });

    if (result.errors?.length) {
      console.error(
        "[admin/properties/index] Hasura:",
        result.errors[0]?.message ?? result.errors
      );
      fail(res, "Failed to list properties", 500);
      return;
    }

    const rawItems = result.data?.real_estate_property_listing ?? [];
    const items = rawItems.map((r) => enrichAdminPropertyListItem(r));
    const total =
      result.data?.real_estate_property_listing_aggregate?.aggregate?.count ??
      items.length;

    ok(res, {
      items,
      total,
      limit,
      offset,
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
