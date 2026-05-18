import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  offerId: z.coerce.number().int().positive(),
  reason: z.string().min(1),
});

const MUTATION = `
  mutation CancelOffer($offerId: Int!) {
    update_real_estate_offer_by_pk(
      pk_columns: { id: $offerId }
      _set: { offer_status: "cancelled", is_active: false, updated_at: "now()" }
    ) { id offer_status }
  }
`;

export default async function cancelAdminOffer(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    const result = await hasuraQuery(MUTATION, body);
    if (result.errors?.length) { fail(res, "Operation failed", 500); return; }
    await logAdminAction(payload, "offer.cancel", "offer", String(body.offerId), body, req);
    ok(res, { success: true, data: result.data });
  } catch (e) {
    console.error("[admin/offers/cancel]", e);
    fail(res, "Internal server error", 500);
  }
}
