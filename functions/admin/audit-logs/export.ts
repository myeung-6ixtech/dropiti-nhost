import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const EXPORT = `
  query ExportAuditLogs($limit: Int!) {
    real_estate_admin_audit_logs(limit: $limit, order_by: { timestamp: desc }) {
      id timestamp admin_id action resource_type resource_id success
    }
  }
`;

export default async function auditExport(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const limit = Math.min(parseInt(String(req.query.limit ?? "1000"), 10) || 1000, 5000);
    const result = await hasuraQuery<{
      real_estate_admin_audit_logs?: unknown[];
    }>(EXPORT, { limit });
    ok(res, { items: result.data?.real_estate_admin_audit_logs ?? [], format: "json" });
  } catch (e) {
    console.error("[admin/audit-logs/export]", e);
    fail(res, "Internal server error", 500);
  }
}
