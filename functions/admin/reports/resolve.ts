import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  reportId: z.string().uuid(),
  resolution: z.string().min(1),
  actionTaken: z.string().optional(),
});

const RESOLVE = `
  mutation ResolveReport($reportId: uuid!, $resolution: String!) {
    update_real_estate_reports_by_pk(
      pk_columns: { id: $reportId }
      _set: { status: "resolved", resolution: $resolution, resolved_at: "now()", updated_at: "now()" }
    ) { id status resolved_at }
  }
`;

export default async function resolveReport(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    const result = await hasuraQuery<{
      update_real_estate_reports_by_pk?: unknown;
    }>(RESOLVE, body);
    if (result.errors?.length) { fail(res, "Resolve failed", 500); return; }
    await logAdminAction(payload, "report.resolve", "report", body.reportId, body, req);
    ok(res, { report: result.data?.update_real_estate_reports_by_pk });
  } catch (e) {
    console.error("[admin/reports/resolve]", e);
    fail(res, "Internal server error", 500);
  }
}
