import type { Request, Response } from "express";
import { requireAdminRole, getUserId } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { airwallex, AirwallexError, isAirwallexStubMode } from "../../_lib/airwallex";
import { isAllowed } from "../../_lib/ratelimit";
import { ok, fail } from "../../_lib/respond";
import { queryString } from "../../_lib/admin-airwallex-handler";

export default async function deleteBeneficiary(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "DELETE") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const id = queryString(req, "id");
    if (!id) {
      fail(res, "id is required", 400);
      return;
    }

    const adminId = getUserId(payload) ?? "unknown";
    if (!(await isAllowed(`airwallex:beneficiaries:${adminId}`, 20, 60))) {
      fail(res, "Rate limit exceeded", 429);
      return;
    }

    const result = await airwallex.beneficiaries.remove(id);
    await logAdminAction(payload, "beneficiaries.delete", "beneficiary", id, {}, req);
    ok(res, { ...result, stub: isAirwallexStubMode() });
  } catch (err) {
    if (err instanceof AirwallexError) {
      fail(res, err.message, err.statusCode);
      return;
    }
    console.error("[admin/beneficiaries/delete]", err);
    fail(res, "Internal server error", 500);
  }
}
