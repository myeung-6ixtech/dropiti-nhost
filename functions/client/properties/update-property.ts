import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const UpdatePropertySchema = z
  .object({
    property_uuid: z.string().uuid(),
    title: z.string().optional(),
    description: z.string().optional(),
    rental_price: z.number().optional(),
    address: z.unknown().optional(),
    amenities: z.array(z.string()).optional(),
    display_image: z.string().optional(),
    uploaded_images: z.array(z.string()).optional(),
    external_contact: z.string().nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 1, { message: "At least one field to update" });

const UPDATE_PROPERTY = `
  mutation UpdateProperty(
    $property_uuid: uuid!
    $landlord_user_id: uuid!
    $updates: real_estate_property_listing_set_input!
  ) {
    update_real_estate_property_listing(
      where: {
        property_uuid: { _eq: $property_uuid }
        landlord_user_id: { _eq: $landlord_user_id }
      }
      _set: $updates
    ) {
      affected_rows
      returning {
        id
        property_uuid
        title
        status
        updated_at
      }
    }
  }
`;

export default async function updateProperty(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "PATCH" && req.method !== "PUT") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const body = validateBody(req, res, UpdatePropertySchema);
    if (!body) return;

    const { property_uuid, ...rest } = body;
    const updates = { ...rest, updated_at: new Date().toISOString(), last_saved_at: new Date().toISOString() };

    const result = await hasuraQuery<{
      update_real_estate_property_listing?: { returning?: unknown[] };
    }>(UPDATE_PROPERTY, {
      property_uuid,
      landlord_user_id: userId,
      updates,
    });

    if (result.errors?.length) {
      fail(res, "Failed to update property", 500);
      return;
    }

    const row = result.data?.update_real_estate_property_listing?.returning?.[0];
    if (!row) {
      fail(res, "Property not found", 404);
      return;
    }

    ok(res, row);
  } catch (error) {
    console.error("[client/properties/update-property]", error);
    fail(res, "Internal server error", 500);
  }
}
