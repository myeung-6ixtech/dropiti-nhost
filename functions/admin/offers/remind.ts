import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  offerId: z.coerce.number().int().positive(),
  recipientType: z.enum(["initiator", "recipient"]).optional(),
  message: z.string().optional(),
});

export default async function remindOffer(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    await logAdminAction(payload, "offer.remind", "offer", String(body.offerId), body, req);
    ok(res, { reminded: true, offerId: body.offerId });
  } catch (e) {
    console.error("[admin/offers/remind]", e);
    fail(res, "Internal server error", 500);
  }
}
