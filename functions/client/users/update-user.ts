import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const UpdateUserSchema = z
  .object({
    display_name: z.string().min(1).optional(),
    first_name: z.string().optional(),
    middle_name: z.string().optional(),
    last_name: z.string().optional(),
    photo_url: z.string().optional(),
    phone_number: z.string().optional(),
    whatsapp_number: z.string().nullable().optional(),
    location: z.string().optional(),
    about: z.string().optional(),
    education: z.string().optional(),
    occupation: z.string().optional(),
    marital_status: z.string().optional(),
    languages: z.union([z.array(z.string()), z.string()]).optional(),
    onboarding_complete: z.boolean().optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
    notification_settings: z.record(z.string(), z.unknown()).optional(),
    privacy_settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

const UPDATE_USER = `
  mutation UpdateUser($nhost_user_id: uuid!, $updates: real_estate_user_set_input!) {
    update_real_estate_user(
      where: { nhost_user_id: { _eq: $nhost_user_id } }
      _set: $updates
    ) {
      affected_rows
      returning {
        nhost_user_id
        display_name
        first_name
        last_name
        email
        photo_url
        phone_number
        location
        about
        updated_at
      }
    }
  }
`;

export default async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "PATCH" && req.method !== "PUT") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const body = validateBody(req, res, UpdateUserSchema);
    if (!body) return;

    const updates = { ...body, updated_at: new Date().toISOString() };

    const result = await hasuraQuery<{
      update_real_estate_user?: { returning?: unknown[]; affected_rows: number };
    }>(UPDATE_USER, { nhost_user_id: userId, updates });

    if (result.errors?.length) {
      fail(res, "Failed to update user", 500);
      return;
    }

    const row = result.data?.update_real_estate_user?.returning?.[0];
    if (!row) {
      fail(res, "User not found", 404);
      return;
    }

    ok(res, row);
  } catch (error) {
    console.error("[client/users/update-user]", error);
    fail(res, "Internal server error", 500);
  }
}
