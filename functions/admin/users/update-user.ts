import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  userId: z.string().uuid(),
  updates: z.record(z.string(), z.unknown()),
});

const UPDATE = `
  mutation AdminUpdateUser($userId: uuid!, $updates: real_estate_user_set_input!) {
    update_real_estate_user(
      where: { _or: [{ nhost_user_id: { _eq: $userId } }, { uuid: { _eq: $userId } }] }
      _set: $updates
    ) {
      affected_rows
      returning { nhost_user_id uuid email display_name }
    }
  }
`;

export default async function adminUpdateUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "PUT" && req.method !== "PATCH") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    const allowed = ["display_name", "first_name", "last_name", "phone_number", "location", "photo_url"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body.updates) updates[key] = body.updates[key];
    }
    const result = await hasuraQuery(UPDATE, { userId: body.userId, updates });
    if (result.errors?.length) { fail(res, "Update failed", 500); return; }
    await logAdminAction(payload, "user.update", "user", body.userId, { updates }, req);
    ok(res, { user: result.data });
  } catch (e) {
    console.error("[admin/users/update-user]", e);
    fail(res, "Internal server error", 500);
  }
}
