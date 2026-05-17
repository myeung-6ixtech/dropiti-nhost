import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole, getUserId } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { airwallex, AirwallexError, isAirwallexStubMode } from "../../_lib/airwallex";
import { isAllowed } from "../../_lib/ratelimit";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  beneficiaryId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  reference: z.string().optional(),
});

export default async function createAirwallexTransfer(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const adminId = getUserId(payload) ?? "unknown";
    if (!(await isAllowed(`airwallex:transfers:${adminId}`, 15, 60))) {
      fail(res, "Rate limit exceeded", 429);
      return;
    }

    const body = validateBody(req, res, Schema);
    if (!body) return;

    const result = await airwallex.transfers.create(body);
    const id = typeof result.id === "string" ? result.id : "unknown";
    await logAdminAction(payload, "transfers.create", "transfer", id, body, req);
    ok(res, { ...result, stub: isAirwallexStubMode() });
  } catch (err) {
    if (err instanceof AirwallexError) {
      fail(res, err.message, err.statusCode);
      return;
    }
    console.error("[admin/transfers/create]", err);
    fail(res, "Internal server error", 500);
  }
}
