import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole, getUserId } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { airwallex, AirwallexError, isAirwallexStubMode } from "../../_lib/airwallex";
import { isAllowed } from "../../_lib/ratelimit";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  id: z.string().min(1),
  cancellationReason: z.string().optional(),
});

export default async function cancelPayment(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const adminId = getUserId(payload) ?? "unknown";
    if (!(await isAllowed(`airwallex:payments:${adminId}`, 30, 60))) {
      fail(res, "Rate limit exceeded", 429);
      return;
    }

    const body = validateBody(req, res, Schema);
    if (!body) return;

    const result = await airwallex.payments.cancel(body.id, body.cancellationReason);
    await logAdminAction(payload, "payments.cancel", "payment", body.id, body, req);
    ok(res, { ...result, stub: isAirwallexStubMode() });
  } catch (err) {
    if (err instanceof AirwallexError) {
      fail(res, err.message, err.statusCode);
      return;
    }
    console.error("[admin/payments/cancel]", err);
    fail(res, "Internal server error", 500);
  }
}
