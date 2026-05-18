import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  action: z.string().min(1),
  userIds: z.array(z.string().uuid()).min(1).max(20),
  params: z.record(z.string(), z.unknown()).optional(),
});

export default async function bulkUsers(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    await logAdminAction(payload, "user.bulk", "user", body.userIds.join(","), body, req);
    ok(res, { processed: body.userIds.length, action: body.action });
  } catch (e) {
    console.error("[admin/users/bulk]", e);
    fail(res, "Internal server error", 500);
  }
}
