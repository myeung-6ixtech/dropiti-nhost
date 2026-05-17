import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../auth";
import { logAdminAction } from "../audit";
import { hasuraQuery } from "../hasura";
import { UUID_RE } from "../admin-offers-incoming";
import { validateBody } from "../validate";
import { ok, fail } from "../respond";

const GET_PROPERTY = `
  query AdminGetProperty($propertyUuid: uuid!) {
    real_estate_property_listing(
      where: { property_uuid: { _eq: $propertyUuid } }
      limit: 1
    ) {
      id property_uuid title description status rental_price rental_price_currency
      landlord_user_id external_contact completion_percentage created_at updated_at
    }
  }
`;

const UpdateSchema = z.object({
  propertyUuid: z.string().uuid().optional(),
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

export async function handleAdminGetProperty(
  req: Request,
  res: Response,
  propertyUuid: string
): Promise<void> {
  if (req.method !== "GET") {
    fail(res, "Method not allowed", 405);
    return;
  }
  const payload = await requireAdminRole(req, res);
  if (!payload) return;
  if (!propertyUuid || !UUID_RE.test(propertyUuid)) {
    fail(res, "propertyUuid must be a valid UUID", 400);
    return;
  }
  const result = await hasuraQuery<{ real_estate_property_listing?: unknown[] }>(
    GET_PROPERTY,
    { propertyUuid }
  );
  if (result.errors?.length) {
    fail(res, "Failed to load property", 500);
    return;
  }
  const property = result.data?.real_estate_property_listing?.[0];
  if (!property) {
    fail(res, "Property not found", 404);
    return;
  }
  ok(res, { property });
}

export async function handleAdminUpdateProperty(
  req: Request,
  res: Response,
  propertyUuid: string
): Promise<void> {
  if (req.method !== "PUT" && req.method !== "PATCH") {
    fail(res, "Method not allowed", 405);
    return;
  }
  const payload = await requireAdminRole(req, res);
  if (!payload) return;
  if (!propertyUuid || !UUID_RE.test(propertyUuid)) {
    fail(res, "propertyUuid must be a valid UUID", 400);
    return;
  }

  const raw = req.body as Record<string, unknown>;
  const updates =
    raw.updates && typeof raw.updates === "object"
      ? (raw.updates as Record<string, unknown>)
      : raw;

  const body = UpdateSchema.safeParse({ propertyUuid, updates: updates ?? {}, reason: raw.reason });
  if (!body.success) {
    fail(res, "Validation failed", 422, body.error.flatten());
    return;
  }

  const result = await hasuraQuery<{
    update_real_estate_property_listing?: { returning?: unknown[] };
  }>(UPDATE, {
    propertyUuid,
    updates: body.data.updates,
  });
  if (result.errors?.length) {
    fail(res, "Update failed", 500);
    return;
  }
  await logAdminAction(payload, "property.update", "property", propertyUuid, body.data, req);
  ok(res, { property: result.data?.update_real_estate_property_listing?.returning?.[0] });
}
