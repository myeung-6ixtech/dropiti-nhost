import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({ payload: z.record(z.string(), z.unknown()).optional() });

export default async function analyticsCustomReport(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") { fail(res, "Method not allowed", 405); return; }
    const auth = await requireAdminRole(req, res);
    if (!auth) return;
    const body = validateBody(req, res, Schema) ?? { payload: {} };
    await logAdminAction(auth, "analytics.custom_report", "system", "export", body, req);
    ok(res, { accepted: true, exportId: `stub-${Date.now()}` });
  } catch (e) {
    console.error("[admin/analytics/custom-report]", e);
    fail(res, "Internal server error", 500);
  }
}
