import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const Q = `query { real_estate_user_aggregate { aggregate { count } } }`;

export default async function analyticsUsers(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const result = await hasuraQuery<{
      real_estate_user_aggregate?: { aggregate?: { count?: number } };
    }>(Q);
    ok(res, { totalUsers: result.data?.real_estate_user_aggregate?.aggregate?.count ?? 0 });
  } catch (e) {
    console.error("[admin/analytics/users]", e);
    fail(res, "Internal server error", 500);
  }
}
