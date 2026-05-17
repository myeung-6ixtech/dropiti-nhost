import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  flagKey: z.string(),
  enabled: z.boolean(),
});

export default async function toggleFlag(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    await logAdminAction(payload, "settings.toggle_flag", "feature_flag", body.flagKey, body, req);
    ok(res, body);
  } catch (e) {
    console.error("[admin/settings/toggle-flag]", e);
    fail(res, "Internal server error", 500);
  }
}
