import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { optionalAuth } from "../../_lib/optional-auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryString, UUID_RE } from "../../_lib/parse-query";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";
import { enrichTenantProfileWithUser } from "../../_lib/enrich-tenant-profile-users";

const FULL_TENANT_PROFILE_FIELDS = `
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

/** Hasura object relationship on `real_estate_tenant_profile` → `auth.users`. */
const TENANT_PROFILE_USER_FIELDS = `
  user {
    id
    email
    avatarUrl
  }
`;

const GET_PROFILE_BY_USER = `
  query TenantProfileByUser($user_id: uuid!) {
    real_estate_tenant_profile(where: { user_id: { _eq: $user_id } }, limit: 1) {
      ${FULL_TENANT_PROFILE_FIELDS}
      ${TENANT_PROFILE_USER_FIELDS}
    }
  }
`;

const INSERT_PROFILE = `
  mutation InsertTenantProfile($object: real_estate_tenant_profile_insert_input!) {
    insert_real_estate_tenant_profile_one(object: $object) {
      ${FULL_TENANT_PROFILE_FIELDS}
      ${TENANT_PROFILE_USER_FIELDS}
    }
  }
`;

const UPDATE_PROFILE = `
  mutation UpdateTenantProfile($user_id: uuid!, $updates: real_estate_tenant_profile_set_input!) {
    update_real_estate_tenant_profile(
      where: { user_id: { _eq: $user_id } }
      _set: $updates
    ) {
      returning {
        ${FULL_TENANT_PROFILE_FIELDS}
        ${TENANT_PROFILE_USER_FIELDS}
      }
    }
  }
`;

const TenantProfileFieldsSchema = z.object({
  tenant_listing_title: z.string().optional(),
  tenant_listing_description: z.string().optional(),
  budget_min: z.number().optional(),
  budget_max: z.number().optional(),
  budget_currency: z.string().optional(),
  payment_preferences: z.array(z.string()).optional(),
  deposit_capability: z.boolean().optional(),
  preferred_property_types: z.array(z.string()).optional(),
  rental_space_preference: z.string().optional(),
  furnishing_preference: z.string().optional(),
  pets_allowed: z.boolean().optional(),
  preferred_locations: z.array(z.string()).optional(),
  transportation_proximity: z.array(z.string()).optional(),
  neighborhood_preferences: z.array(z.string()).optional(),
  location_flexibility: z.string().optional(),
  preferred_move_in_date: z.string().nullable().optional(),
  preferred_lease_duration: z.number().optional(),
  notice_period: z.string().optional(),
  urgency_level: z.string().optional(),
  work_location: z.string().optional(),
  lifestyle_preferences: z.array(z.string()).optional(),
  special_requirements: z.array(z.string()).optional(),
  contact_preferences: z.array(z.string()).optional(),
  best_contact_times: z.array(z.string()).optional(),
  response_time_expectation: z.string().optional(),
  privacy_settings: z.record(z.unknown()).optional(),
  tenant_listing_status: z
    .enum(["draft", "active", "inactive", "paused"])
    .optional(),
});

const PatchProfileSchema = TenantProfileFieldsSchema.refine(
  (o) => Object.keys(o).length > 0,
  { message: "At least one field required" }
);

const UpsertProfileSchema = TenantProfileFieldsSchema.extend({
  user_nhost_user_id: z.string().uuid().optional(),
});

type TenantProfileRow = Record<string, unknown> & {
  tenant_listing_status?: string;
  user_id?: string;
};

function stripUpsertMeta(
  body: z.infer<typeof UpsertProfileSchema>
): Record<string, unknown> {
  const { user_nhost_user_id: _uid, ...rest } = body;
  return rest;
}

async function fetchProfileByUserId(
  userId: string
): Promise<TenantProfileRow | null> {
  const result = await hasuraQuery<{
    real_estate_tenant_profile?: TenantProfileRow[];
  }>(GET_PROFILE_BY_USER, { user_id: userId });

  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to fetch profile");
  }

  return result.data?.real_estate_tenant_profile?.[0] ?? null;
}

function canReadProfile(
  profile: TenantProfileRow,
  viewerUserId: string | undefined,
  targetUserId: string
): boolean {
  if (profile.tenant_listing_status === "active") return true;
  return Boolean(viewerUserId && viewerUserId === targetUserId);
}

export default async function tenantProfile(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.method === "GET") {
      const paramUserId = queryString(req, "nhost_user_id");
      let targetUserId: string;
      let viewerUserId: string | undefined;

      if (paramUserId) {
        if (!UUID_RE.test(paramUserId)) {
          fail(res, "nhost_user_id must be a valid UUID", 400);
          return;
        }
        const payload = await optionalAuth(req, res);
        viewerUserId = payload ? getUserId(payload) : undefined;
        targetUserId = paramUserId;
      } else {
        const payload = await requireAuth(req, res);
        if (!payload) return;
        viewerUserId = getUserId(payload);
        if (!viewerUserId) {
          fail(res, "Invalid session", 401);
          return;
        }
        targetUserId = viewerUserId;
      }

      const profile = await fetchProfileByUserId(targetUserId);
      if (!profile) {
        fail(res, "Profile not found", 404);
        return;
      }

      if (!canReadProfile(profile, viewerUserId, targetUserId)) {
        fail(res, "Profile not found", 404);
        return;
      }

      ok(res, await enrichTenantProfileWithUser(profile));
      return;
    }

    if (req.method === "POST") {
      const payload = await requireAuth(req, res);
      if (!payload) return;

      const jwtUserId = getUserId(payload);
      if (!jwtUserId) {
        fail(res, "Invalid session", 401);
        return;
      }

      const body = validateBody(req, res, UpsertProfileSchema);
      if (!body) return;

      if (body.user_nhost_user_id && body.user_nhost_user_id !== jwtUserId) {
        fail(res, "Forbidden", 403);
        return;
      }

      const updates = stripUpsertMeta(body);
      const existing = await fetchProfileByUserId(jwtUserId);
      const now = new Date().toISOString();

      if (existing) {
        const result = await hasuraQuery<{
          update_real_estate_tenant_profile?: { returning?: TenantProfileRow[] };
        }>(UPDATE_PROFILE, {
          user_id: jwtUserId,
          updates: { ...updates, updated_at: now },
        });

        const row = result.data?.update_real_estate_tenant_profile?.returning?.[0];
        if (!row) {
          fail(res, "Profile not found", 404);
          return;
        }
        ok(res, await enrichTenantProfileWithUser(row));
        return;
      }

      const object = {
        user_id: jwtUserId,
        ...updates,
        created_at: now,
        updated_at: now,
      };

      const result = await hasuraQuery<{
        insert_real_estate_tenant_profile_one?: TenantProfileRow;
      }>(INSERT_PROFILE, { object });

      if (result.errors?.length || !result.data?.insert_real_estate_tenant_profile_one) {
        fail(res, "Failed to create profile", 500);
        return;
      }

      ok(
        res,
        await enrichTenantProfileWithUser(
          result.data.insert_real_estate_tenant_profile_one as Record<string, unknown>
        )
      );
      return;
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      const payload = await requireAuth(req, res);
      if (!payload) return;

      const jwtUserId = getUserId(payload);
      if (!jwtUserId) {
        fail(res, "Invalid session", 401);
        return;
      }

      const body = validateBody(req, res, PatchProfileSchema);
      if (!body) return;

      const result = await hasuraQuery<{
        update_real_estate_tenant_profile?: { returning?: TenantProfileRow[] };
      }>(UPDATE_PROFILE, {
        user_id: jwtUserId,
        updates: { ...body, updated_at: new Date().toISOString() },
      });

      const row = result.data?.update_real_estate_tenant_profile?.returning?.[0];
      if (!row) {
        fail(res, "Profile not found", 404);
        return;
      }
      ok(res, await enrichTenantProfileWithUser(row));
      return;
    }

    fail(res, "Method not allowed", 405);
  } catch (error) {
    console.error("[client/tenants/profile]", error);
    fail(res, "Internal server error", 500);
  }
}
