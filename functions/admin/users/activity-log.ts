import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryParam } from "../../_lib/admin-pagination";
import { UUID_RE } from "../../_lib/admin-offers-incoming";
import { ok, fail } from "../../_lib/respond";

const LOGS = `
  query UserActivityLogs($userId: String!, $limit: Int!) {
    real_estate_admin_audit_logs(
      where: {
        _or: [
          { resource_id: { _eq: $userId } }
          { admin_id: { _eq: $userId } }
        ]
      }
      limit: $limit
      order_by: { timestamp: desc }
    ) {
      id timestamp admin_id action resource_type resource_id details
    }
  }
`;

export default async function userActivityLog(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const userId = queryParam(req, "userId");
    if (!userId || !UUID_RE.test(userId)) { fail(res, "userId required", 400); return; }
    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 100);
    const result = await hasuraQuery<{
      real_estate_admin_audit_logs?: unknown[];
    }>(LOGS, { userId, limit });
    ok(res, { items: result.data?.real_estate_admin_audit_logs ?? [] });
  } catch (e) {
    console.error("[admin/users/activity-log]", e);
    fail(res, "Internal server error", 500);
  }
}
