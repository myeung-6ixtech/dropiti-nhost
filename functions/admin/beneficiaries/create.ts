import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole, getUserId } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { airwallex, AirwallexError, isAirwallexStubMode } from "../../_lib/airwallex";
import { isAllowed } from "../../_lib/ratelimit";
import { ok, fail } from "../../_lib/respond";

const Schema = z.record(z.string(), z.unknown());

export default async function createBeneficiary(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const adminId = getUserId(payload) ?? "unknown";
    if (!(await isAllowed(`airwallex:beneficiaries:${adminId}`, 20, 60))) {
      fail(res, "Rate limit exceeded", 429);
      return;
    }

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, "Invalid request body", 422, parsed.error.flatten());
      return;
    }

    const result = await airwallex.beneficiaries.create(parsed.data);
    const id = typeof result.id === "string" ? result.id : "unknown";
    await logAdminAction(payload, "beneficiaries.create", "beneficiary", id, {}, req);
    ok(res, { ...result, stub: isAirwallexStubMode() });
  } catch (err) {
    if (err instanceof AirwallexError) {
      fail(res, err.message, err.statusCode);
      return;
    }
    console.error("[admin/beneficiaries/create]", err);
    fail(res, "Internal server error", 500);
  }
}
