import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole, getUserId } from "../../../_lib/auth";
import { logAdminAction } from "../../../_lib/audit";
import { airwallex, AirwallexError, isAirwallexStubMode } from "../../../_lib/airwallex";
import { isAllowed } from "../../../_lib/ratelimit";
import { ok, fail } from "../../../_lib/respond";
import { airwallexResourceId } from "../../../_lib/admin-airwallex-handler";

const BodySchema = z.object({
  cancellationReason: z.string().optional(),
});

/** POST /v1/admin/payments/:id/cancel */
export default async function cancelPaymentById(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const id = airwallexResourceId(req, {
      paramName: "id",
      queryKey: "id",
      pathPrefix: ["admin", "payments"],
    });
    if (!id) {
      fail(res, "id is required", 400);
      return;
    }

    const adminId = getUserId(payload) ?? "unknown";
    if (!(await isAllowed(`airwallex:payments:${adminId}`, 30, 60))) {
      fail(res, "Rate limit exceeded", 429);
      return;
    }

    const body = BodySchema.safeParse(req.body ?? {});
    const reason = body.success ? body.data.cancellationReason : undefined;

    const result = await airwallex.payments.cancel(id, reason);
    await logAdminAction(payload, "payments.cancel", "payment", id, { id, cancellationReason: reason }, req);
    ok(res, { ...result, stub: isAirwallexStubMode() });
  } catch (err) {
    if (err instanceof AirwallexError) {
      fail(res, err.message, err.statusCode);
      return;
    }
    console.error("[admin/payments/[id]/cancel]", err);
    fail(res, "Internal server error", 500);
  }
}
