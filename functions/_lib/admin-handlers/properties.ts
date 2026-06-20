import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../auth";
import { logAdminAction } from "../audit";
import { hasuraQuery } from "../hasura";
import { UUID_RE } from "../admin-offers-incoming";
import { validateBody } from "../validate";
import { ok, fail } from "../respond";
import { applyListingCoordinates } from "../geo/apply-listing-coordinates";

const GET_PROPERTY = `
  query AdminGetProperty($propertyUuid: uuid!) {
    real_estate_property_listing(
      where: { property_uuid: { _eq: $propertyUuid } }
      limit: 1
    ) {
      id
      property_uuid
      title
      description
      address
      rental_price
      rental_price_currency
      num_bedroom
      num_bathroom
      property_type
      rental_space
      show_specific_location
      gross_area_size
      gross_area_size_unit
      furnished
      pets_allowed
      amenities
      display_image
      uploaded_images
      status
      landlord_user_id
      external_contact
      external_url
      completion_percentage
      availability_date
      latitude
      longitude
      created_at
      updated_at
    }
  }
`;

const GET_LANDLORD_BRIEF = `
  query AdminGetLandlordBrief($userId: uuid!) {
    real_estate_user(
      where: { _or: [{ nhost_user_id: { _eq: $userId } }, { uuid: { _eq: $userId } }] }
      limit: 1
    ) {
      nhost_user_id
      uuid
      email
      display_name
      first_name
      last_name
      photo_url
    }
  }
`;

const PROPERTY_OFFER_COUNTS = `
  query AdminPropertyOfferCounts($propertyUuid: uuid!) {
    all_offers: real_estate_offer_aggregate(
      where: { property_uuid: { _eq: $propertyUuid } }
    ) {
      aggregate {
        count
      }
    }
    active_offers: real_estate_offer_aggregate(
      where: { property_uuid: { _eq: $propertyUuid }, is_active: { _eq: true } }
    ) {
      aggregate {
        count
      }
    }
  }
`;

function mapLandlordBrief(row: Record<string, unknown>): {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
} {
  const name =
    (typeof row.display_name === "string" && row.display_name.trim()) ||
    [row.first_name, row.last_name].filter(Boolean).join(" ") ||
    null;
  return {
    id: String(row.nhost_user_id ?? row.uuid ?? ""),
    email: (row.email as string | null) ?? null,
    name,
    avatar: (row.photo_url as string | null) ?? null,
  };
}

function enrichAdminPropertyDetail(row: Record<string, unknown>): Record<string, unknown> {
  const uploaded = row.uploaded_images;
  return {
    ...row,
    currency: row.rental_price_currency ?? null,
    primary_image: row.display_image ?? null,
    images: Array.isArray(uploaded) ? uploaded : [],
  };
}

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
    console.error(
      "[AdminGetProperty] Hasura:",
      result.errors[0]?.message ?? result.errors
    );
    fail(res, "Failed to load property", 500);
    return;
  }
  const property = result.data?.real_estate_property_listing?.[0];
  if (!property) {
    fail(res, "Property not found", 404);
    return;
  }

  const row = property as Record<string, unknown>;
  let offerCount = 0;
  let activeOfferCount = 0;
  const counts = await hasuraQuery<{
    all_offers?: { aggregate?: { count?: number } };
    active_offers?: { aggregate?: { count?: number } };
  }>(PROPERTY_OFFER_COUNTS, { propertyUuid });
  if (counts.errors?.length) {
    console.error(
      "[AdminGetProperty] offer counts:",
      counts.errors[0]?.message ?? counts.errors
    );
  } else {
    offerCount = counts.data?.all_offers?.aggregate?.count ?? 0;
    activeOfferCount = counts.data?.active_offers?.aggregate?.count ?? 0;
  }

  const landlordUserId = row.landlord_user_id;
  let landlord: ReturnType<typeof mapLandlordBrief> | null = null;
  if (typeof landlordUserId === "string" && UUID_RE.test(landlordUserId)) {
    const lr = await hasuraQuery<{ real_estate_user?: Record<string, unknown>[] }>(
      GET_LANDLORD_BRIEF,
      { userId: landlordUserId }
    );
    if (!lr.errors?.length) {
      const u = lr.data?.real_estate_user?.[0];
      if (u) landlord = mapLandlordBrief(u);
    }
  }

  const enriched = enrichAdminPropertyDetail({
    ...row,
    offer_count: offerCount,
    active_offer_count: activeOfferCount,
  });

  ok(res, { property: enriched, landlord });
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

  const finalUpdates = { ...body.data.updates };
  const shouldRecompute = finalUpdates.recalculatePin === true;

  if (shouldRecompute) {
    let existingAddress: unknown = finalUpdates.address;
    let existingShow = finalUpdates.show_specific_location as boolean | undefined;

    if (existingAddress === undefined || existingShow === undefined) {
      const existing = await hasuraQuery<{
        real_estate_property_listing?: Array<{
          address: unknown;
          show_specific_location?: boolean;
        }>;
      }>(GET_PROPERTY, { propertyUuid });
      const row = existing.data?.real_estate_property_listing?.[0] as
        | Record<string, unknown>
        | undefined;
      if (row) {
        if (existingAddress === undefined) existingAddress = row.address;
        if (existingShow === undefined) existingShow = Boolean(row.show_specific_location);
      }
    }

    const coords = await applyListingCoordinates({
      address: existingAddress,
      show_specific_location: existingShow,
      property_uuid: propertyUuid,
      enableGeocode: true,
      recalculate: true,
    });
    finalUpdates.latitude = coords.latitude;
    finalUpdates.longitude = coords.longitude;
  }

  delete finalUpdates.recalculatePin;

  const result = await hasuraQuery<{
    update_real_estate_property_listing?: { returning?: unknown[] };
  }>(UPDATE, {
    propertyUuid,
    updates: finalUpdates,
  });
  if (result.errors?.length) {
    fail(res, "Update failed", 500);
    return;
  }
  await logAdminAction(payload, "property.update", "property", propertyUuid, body.data, req);
  ok(res, { property: result.data?.update_real_estate_property_listing?.returning?.[0] });
}
