import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  propertyUuid: z.string().uuid(),
  updates: z.record(z.string(), z.unknown()),
  reason: z.string().optional(),
});

const UPDATE = `
  mutation AdminUpdateProperty($propertyUuid: uuid!, $updates: real_estate_property_listing_set_input!) {
    update_real_estate_property_listing(
      where: { property_uuid: { _eq: $propertyUuid } }
      _set: $updates
    ) {
      affected_rows
      returning { property_uuid title status external_contact }
    }
  }
`;

export default async function adminUpdateProperty(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "PUT") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    const result = await hasuraQuery<{
      update_real_estate_property_listing?: { returning?: unknown[] };
    }>(UPDATE, {
      propertyUuid: body.propertyUuid,
      updates: body.updates,
    });
    if (result.errors?.length) { fail(res, "Update failed", 500); return; }
    await logAdminAction(payload, "property.update", "property", body.propertyUuid, body, req);
    ok(res, { property: result.data?.update_real_estate_property_listing?.returning?.[0] });
  } catch (e) {
    console.error("[admin/properties/update-property]", e);
    fail(res, "Internal server error", 500);
  }
}
