import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const GET_PROFILE = `
  query TenantProfileByUser($user_id: uuid!) {
    real_estate_tenant_profile(where: { user_id: { _eq: $user_id } }, limit: 1) {
      id
      tenant_uuid
      user_id
      tenant_listing_title
      tenant_listing_description
      budget_min
      budget_max
      tenant_listing_status
      created_at
      updated_at
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
        id
        tenant_uuid
        tenant_listing_title
        updated_at
      }
    }
  }
`;

const PatchProfileSchema = z
  .object({
    tenant_listing_title: z.string().optional(),
    tenant_listing_description: z.string().optional(),
    budget_min: z.number().optional(),
    budget_max: z.number().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export default async function tenantProfile(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    if (req.method === "GET") {
      const result = await hasuraQuery<{ real_estate_tenant_profile?: unknown[] }>(
        GET_PROFILE,
        { user_id: userId }
      );
      if (result.errors?.length) {
        fail(res, "Failed to fetch profile", 500);
        return;
      }
      const profile = result.data?.real_estate_tenant_profile?.[0];
      if (!profile) {
        fail(res, "Profile not found", 404);
        return;
      }
      ok(res, profile);
      return;
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      const body = validateBody(req, res, PatchProfileSchema);
      if (!body) return;

      const result = await hasuraQuery<{
        update_real_estate_tenant_profile?: { returning?: unknown[] };
      }>(UPDATE_PROFILE, {
        user_id: userId,
        updates: { ...body, updated_at: new Date().toISOString() },
      });

      const row = result.data?.update_real_estate_tenant_profile?.returning?.[0];
      if (!row) {
        fail(res, "Profile not found", 404);
        return;
      }
      ok(res, row);
      return;
    }

    fail(res, "Method not allowed", 405);
  } catch (error) {
    console.error("[client/tenants/profile]", error);
    fail(res, "Internal server error", 500);
  }
}
