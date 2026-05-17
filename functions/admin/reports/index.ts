import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parseListQuery, listEnvelope } from "../../_lib/admin-pagination";
import { ok, fail } from "../../_lib/respond";

const LIST = `
  query ReportsIndex($limit: Int!, $offset: Int!) {
    real_estate_reports(
      limit: $limit offset: $offset order_by: { created_at: desc }
    ) {
      id report_type content_type content_id status severity created_at updated_at
    }
    real_estate_reports_aggregate { aggregate { count } }
  }
`;

export default async function reportsIndex(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const { limit, offset } = parseListQuery(req);
    const result = await hasuraQuery<{
      real_estate_reports?: unknown[];
      real_estate_reports_aggregate?: { aggregate?: { count?: number } };
    }>(LIST, { limit, offset });
    if (result.errors?.length) {
      ok(res, listEnvelope([], 0, limit, offset));
      return;
    }
    const items = result.data?.real_estate_reports ?? [];
    const total = result.data?.real_estate_reports_aggregate?.aggregate?.count ?? items.length;
    ok(res, listEnvelope(items, total, limit, offset));
  } catch (e) {
    console.error("[admin/reports/index]", e);
    fail(res, "Internal server error", 500);
  }
}
