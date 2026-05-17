import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryParam } from "../../_lib/admin-pagination";
import { UUID_RE } from "../../_lib/admin-offers-incoming";
import { ok, fail } from "../../_lib/respond";

const REPORTS = `
  query PropertyReports($propertyUuid: String!) {
    real_estate_reports(
      where: { content_id: { _eq: $propertyUuid }, content_type: { _eq: "property" } }
      order_by: { created_at: desc }
    ) {
      id report_type content_type content_id status severity created_at
    }
  }
`;

export default async function propertyReports(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const propertyUuid = queryParam(req, "propertyUuid");
    if (!propertyUuid || !UUID_RE.test(propertyUuid)) {
      fail(res, "propertyUuid required", 400);
      return;
    }
    const result = await hasuraQuery<{ real_estate_reports?: unknown[] }>(REPORTS, {
      propertyUuid,
    });
    ok(res, { items: result.data?.real_estate_reports ?? [] });
  } catch (e) {
    console.error("[admin/properties/reports]", e);
    fail(res, "Internal server error", 500);
  }
}
