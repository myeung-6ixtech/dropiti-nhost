import type { Request, Response } from "express";
import { requireAdminRole, getUserId } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { airwallex, AirwallexError, isAirwallexStubMode } from "../../_lib/airwallex";
import { isAllowed } from "../../_lib/ratelimit";
import { ok, fail } from "../../_lib/respond";
import { airwallexResourceId } from "../../_lib/admin-airwallex-handler";

export default async function cancelTransfer(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const id = airwallexResourceId(req, {
      queryKey: "id",
      pathPrefix: ["admin", "transfers"],
    });
    if (!id) {
      fail(res, "id is required", 400);
      return;
    }

    const adminId = getUserId(payload) ?? "unknown";
    if (!(await isAllowed(`airwallex:transfers:${adminId}`, 20, 60))) {
      fail(res, "Rate limit exceeded", 429);
      return;
    }

    const result = await airwallex.transfers.cancel(id);
    await logAdminAction(payload, "transfers.cancel", "transfer", id, {}, req);
    ok(res, { ...result, stub: isAirwallexStubMode() });
  } catch (err) {
    if (err instanceof AirwallexError) {
      fail(res, err.message, err.statusCode);
      return;
    }
    console.error("[admin/transfers/cancel]", err);
    fail(res, "Internal server error", 500);
  }
}
