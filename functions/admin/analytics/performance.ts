import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { ok, fail } from "../../_lib/respond";

export default async function analyticsPerformance(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    ok(res, { uptime: "ok", note: "Wire APM metrics in a follow-up" });
  } catch (e) {
    console.error("[admin/analytics/performance]", e);
    fail(res, "Internal server error", 500);
  }
}
