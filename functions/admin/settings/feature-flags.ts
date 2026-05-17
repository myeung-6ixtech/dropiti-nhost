import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { hasuraQuery } from "../../_lib/hasura";
import { parseListQuery, listEnvelope, queryParam } from "../../_lib/admin-pagination";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

/** GET /v1/admin/settings/feature-flags */
export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") {
      fail(res, "Method not allowed", 405);
      return;
    }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    ok(res, { stub: true, message: "Not yet fully implemented" });
  } catch (error) {
    console.error("[admin/settings/feature-flags]", error);
    fail(res, "Internal server error", 500);
  }
}
