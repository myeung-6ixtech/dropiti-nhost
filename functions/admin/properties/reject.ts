import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  propertyUuid: z.string().uuid(),
  reason: z.string().min(1),
});

const REJECT = `
  mutation RejectProperty($propertyUuid: uuid!) {
    update_real_estate_property_listing(
      where: { property_uuid: { _eq: $propertyUuid } }
      _set: { status: "rejected", updated_at: "now()" }
    ) {
      affected_rows
      returning { property_uuid status }
    }
  }
`;

export default async function rejectProperty(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    const result = await hasuraQuery<{ update_real_estate_property_listing?: { returning?: unknown[] } }>(
      REJECT,
      { propertyUuid: body.propertyUuid }
    );
    if (result.errors?.length) { fail(res, "Reject failed", 500); return; }
    await logAdminAction(payload, "property.reject", "property", body.propertyUuid, { reason: body.reason }, req);
    ok(res, { property: result.data?.update_real_estate_property_listing?.returning?.[0] ?? null });
  } catch (e) {
    console.error("[admin/properties/reject]", e);
    fail(res, "Internal server error", 500);
  }
}
