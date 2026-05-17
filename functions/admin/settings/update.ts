import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  section: z.string(),
  updates: z.record(z.string(), z.unknown()),
  reason: z.string().optional(),
});

export default async function settingsUpdate(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "PUT") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    await logAdminAction(payload, "settings.update", "settings", body.section, body, req);
    ok(res, { updated: true });
  } catch (e) {
    console.error("[admin/settings/update]", e);
    fail(res, "Internal server error", 500);
  }
}
