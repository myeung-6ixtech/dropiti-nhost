import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  propertyUuid: z.string().uuid(),
  flagType: z.string(),
  reason: z.string(),
  autoUnpublish: z.boolean().optional(),
});

export default async function flagProperty(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    await logAdminAction(payload, "property.flag", "property", body.propertyUuid, body, req);
    ok(res, { flagged: true });
  } catch (e) {
    console.error("[admin/properties/flag]", e);
    fail(res, "Internal server error", 500);
  }
}
