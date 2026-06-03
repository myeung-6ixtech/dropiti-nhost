import type { Request, Response } from "express";
import { optionalAuth } from "../../_lib/optional-auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parsePagination, queryString } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

const FULL_TENANT_LIST_FIELDS = `
  id
  tenant_uuid
  user_id
  tenant_listing_title
  tenant_listing_description
  budget_min
  budget_max
  budget_currency
  payment_preferences
  deposit_capability
  preferred_property_types
  rental_space_preference
  furnishing_preference
  pets_allowed
  preferred_locations
  transportation_proximity
  neighborhood_preferences
  location_flexibility
  preferred_move_in_date
  preferred_lease_duration
  notice_period
  urgency_level
  work_location
  lifestyle_preferences
  special_requirements
  contact_preferences
  best_contact_times
  response_time_expectation
  privacy_settings
  tenant_listing_status
  created_at
  updated_at
`;

const LIST_TENANTS = `
  query ListTenantProfiles(
    $limit: Int!
    $offset: Int!
    $filters: real_estate_tenant_profile_bool_exp!
  ) {
    real_estate_tenant_profile(
      where: $filters
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
    ) {
      ${FULL_TENANT_LIST_FIELDS}
    }
    real_estate_tenant_profile_aggregate(where: $filters) {
      aggregate {
        count
      }
    }
  }
`;

const USERS_FOR_TENANTS = `
  query UsersForTenantProfiles($ids: [uuid!]!) {
    real_estate_user(where: { nhost_user_id: { _in: $ids } }) {
      uuid
      nhost_user_id
      display_name
      photo_url
      email
      rating
      review_count
    }
  }
`;

function buildFilters(req: Request): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];

  const status = queryString(req, "status") ?? "active";
  and.push({ tenant_listing_status: { _eq: status } });

  const budgetMin = queryString(req, "budget_min");
  if (budgetMin) {
    const n = parseFloat(budgetMin);
    if (Number.isFinite(n)) {
      and.push({ budget_max: { _gte: n } });
    }
  }

  const budgetMax = queryString(req, "budget_max");
  if (budgetMax) {
    const n = parseFloat(budgetMax);
    if (Number.isFinite(n)) {
      and.push({ budget_min: { _lte: n } });
    }
  }

  const location = queryString(req, "location");
  if (location) {
    const pattern = `%${location}%`;
    and.push({
      _or: [
        { work_location: { _ilike: pattern } },
        { tenant_listing_title: { _ilike: pattern } },
        { tenant_listing_description: { _ilike: pattern } },
      ],
    });
  }

  const propertyType = queryString(req, "property_type");
  if (propertyType) {
    and.push({ preferred_property_types: { _contains: [propertyType] } });
  }

  const moveInDate = queryString(req, "move_in_date");
  if (moveInDate) {
    and.push({ preferred_move_in_date: { _lte: moveInDate } });
  }

  return and.length === 1 ? and[0]! : { _and: and };
}

export default async function tenantsIndex(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.method !== "GET") {
      fail(res, "Method not allowed", 405);
      return;
    }

    await optionalAuth(req, res);

    const { limit, offset } = parsePagination(req, 20, 100);
    const filters = buildFilters(req);

    const result = await hasuraQuery<{
      real_estate_tenant_profile?: Array<Record<string, unknown>>;
      real_estate_tenant_profile_aggregate?: { aggregate?: { count?: number } };
    }>(LIST_TENANTS, { limit, offset, filters });

    if (result.errors?.length) {
      fail(res, "Failed to list tenants", 500);
      return;
    }

    const items = result.data?.real_estate_tenant_profile ?? [];
    const total =
      result.data?.real_estate_tenant_profile_aggregate?.aggregate?.count ??
      items.length;

    const userIds = items
      .map((row) => row.user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    let userById: Record<string, Record<string, unknown>> = {};
    if (userIds.length > 0) {
      const userResult = await hasuraQuery<{
        real_estate_user?: Array<Record<string, unknown>>;
      }>(USERS_FOR_TENANTS, { ids: userIds });

      if (!userResult.errors?.length) {
        for (const user of userResult.data?.real_estate_user ?? []) {
          const nhostId = user.nhost_user_id as string | undefined;
          if (nhostId) userById[nhostId] = user;
        }
      }
    }

    const enriched = items.map((row) => {
      const uid = row.user_id as string | undefined;
      return {
        ...row,
        user: uid ? userById[uid] ?? null : null,
      };
    });

    ok(res, {
      items: enriched,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("[client/tenants/index]", error);
    fail(res, "Internal server error", 500);
  }
}
