import type { Request, Response } from "express";
import { optionalAuth } from "../../_lib/optional-auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parsePagination, queryString } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";
import { enrichTenantProfilesWithUsers } from "../../_lib/enrich-tenant-profile-users";

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

const TENANT_PROFILE_USER_FIELDS = `
  user {
    id
    email
    avatarUrl
  }
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
      ${TENANT_PROFILE_USER_FIELDS}
    }
    real_estate_tenant_profile_aggregate(where: $filters) {
      aggregate {
        count
      }
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

    const rawItems = result.data?.real_estate_tenant_profile ?? [];
    const items = await enrichTenantProfilesWithUsers(rawItems);
    const total =
      result.data?.real_estate_tenant_profile_aggregate?.aggregate?.count ??
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
    console.error("[client/tenants/index]", error);
    fail(res, "Internal server error", 500);
  }
}
