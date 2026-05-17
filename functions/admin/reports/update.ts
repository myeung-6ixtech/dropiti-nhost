import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  reportId: z.string().uuid(),
  status: z.string().optional(),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
});

const UPDATE = `
  mutation UpdateReport($reportId: uuid!, $updates: real_estate_reports_set_input!) {
    update_real_estate_reports_by_pk(pk_columns: { id: $reportId }, _set: $updates) {
      id status assigned_to
    }
  }
`;

export default async function updateReport(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "PUT") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    const { reportId, ...updates } = body;
    const result = await hasuraQuery<{
      update_real_estate_reports_by_pk?: unknown;
    }>(UPDATE, { reportId, updates });
    if (result.errors?.length) { fail(res, "Update failed", 500); return; }
    await logAdminAction(payload, "report.update", "report", reportId, body, req);
    ok(res, { report: result.data?.update_real_estate_reports_by_pk });
  } catch (e) {
    console.error("[admin/reports/update]", e);
    fail(res, "Internal server error", 500);
  }
}
