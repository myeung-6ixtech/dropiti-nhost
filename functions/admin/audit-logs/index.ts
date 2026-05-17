import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parseListQuery, listEnvelope, queryParam } from "../../_lib/admin-pagination";
import { ok, fail } from "../../_lib/respond";

const LIST = `
  query AdminAuditLogs($limit: Int!, $offset: Int!, $adminId: String) {
    real_estate_admin_audit_logs(
      limit: $limit offset: $offset order_by: { timestamp: desc }
      where: { admin_id: { _eq: $adminId } }
    ) {
      id timestamp admin_id action resource_type resource_id details success
    }
    real_estate_admin_audit_logs_aggregate(
      where: { admin_id: { _eq: $adminId } }
    ) { aggregate { count } }
  }
`;

const LIST_ALL = `
  query AdminAuditLogsAll($limit: Int!, $offset: Int!) {
    real_estate_admin_audit_logs(
      limit: $limit offset: $offset order_by: { timestamp: desc }
    ) {
      id timestamp admin_id action resource_type resource_id details success
    }
    real_estate_admin_audit_logs_aggregate { aggregate { count } }
  }
`;

export default async function auditLogsIndex(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const { limit, offset } = parseListQuery(req);
    const adminId = queryParam(req, "adminId");
    const variables: Record<string, unknown> = { limit, offset };
    const query = adminId ? LIST : LIST_ALL;
    if (adminId) variables.adminId = adminId;
    const result = await hasuraQuery<{
      real_estate_admin_audit_logs?: unknown[];
      real_estate_admin_audit_logs_aggregate?: { aggregate?: { count?: number } };
    }>(query, variables);
    if (result.errors?.length) {
      ok(res, listEnvelope([], 0, limit, offset));
      return;
    }
    const items = result.data?.real_estate_admin_audit_logs ?? [];
    const total = result.data?.real_estate_admin_audit_logs_aggregate?.aggregate?.count ?? items.length;
    ok(res, listEnvelope(items, total, limit, offset));
  } catch (e) {
    console.error("[admin/audit-logs/index]", e);
    fail(res, "Internal server error", 500);
  }
}
