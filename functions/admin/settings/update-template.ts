import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  templateId: z.string(),
  subject: z.string().optional(),
  content: z.string().optional(),
});

export default async function updateTemplate(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "PUT") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    await logAdminAction(payload, "settings.update_template", "email_template", body.templateId, body, req);
    ok(res, { updated: true });
  } catch (e) {
    console.error("[admin/settings/update-template]", e);
    fail(res, "Internal server error", 500);
  }
}
