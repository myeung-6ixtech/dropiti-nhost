import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  userId: z.string().uuid(),
  confirmDeletion: z.literal(true),
  reason: z.string().min(1),
});

export default async function deleteUserData(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "DELETE") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    await logAdminAction(payload, "user.delete_data", "user", body.userId, body, req);
    ok(res, { scheduled: true, userId: body.userId, message: "GDPR deletion logged; run manual purge workflow" });
  } catch (e) {
    console.error("[admin/users/delete-user-data]", e);
    fail(res, "Internal server error", 500);
  }
}
