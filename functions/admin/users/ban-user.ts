import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  userId: z.string().uuid(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export default async function banUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    await logAdminAction(payload, "user.ban", "user", body.userId, body, req);
    ok(res, { userId: body.userId, action: "user.ban" });
  } catch (e) {
    console.error("[admin/users/ban-user]", e);
    fail(res, "Internal server error", 500);
  }
}
