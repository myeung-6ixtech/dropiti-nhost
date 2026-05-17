import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  action: z.string(),
  propertyUuids: z.array(z.string().uuid()).min(1).max(50),
});

export default async function bulkProperties(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    await logAdminAction(payload, "property.bulk", "property", body.propertyUuids[0], body, req);
    ok(res, { processed: body.propertyUuids.length, action: body.action });
  } catch (e) {
    console.error("[admin/properties/bulk]", e);
    fail(res, "Internal server error", 500);
  }
}
