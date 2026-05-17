import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const CreatePropertySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  address: z.unknown().optional(),
  location: z.string().optional(),
  price: z.union([z.number(), z.string()]).optional(),
  bedrooms: z.union([z.number(), z.string()]).optional(),
  bathrooms: z.union([z.number(), z.string()]).optional(),
  photos: z.array(z.string()).optional(),
  imageUrl: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  isDraft: z.boolean().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

const CREATE_PROPERTY = `
  mutation CreateProperty($property: real_estate_property_listing_insert_input!) {
    insert_real_estate_property_listing_one(object: $property) {
      id
      property_uuid
      title
      status
      landlord_user_id
      created_at
    }
  }
`;

export default async function createProperty(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
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

    const body = validateBody(req, res, CreatePropertySchema);
    if (!body) return;

    const isDraft = body.isDraft ?? false;
    const price =
      body.price !== undefined ? parseFloat(String(body.price)) : isDraft ? 0 : undefined;

    if (!isDraft && (price === undefined || Number.isNaN(price))) {
      fail(res, "price is required for published properties", 400);
      return;
    }

    const property = {
      property_uuid: randomUUID(),
      title: body.title,
      description: body.description ?? "",
      address: body.address ?? body.location ?? "",
      rental_price: price ?? 0,
      rental_price_currency: "HKD",
      num_bedroom: body.bedrooms ? parseInt(String(body.bedrooms), 10) : 0,
      num_bathroom: body.bathrooms ? parseInt(String(body.bathrooms), 10) : 0,
      display_image: body.photos?.[0] ?? body.imageUrl ?? "",
      uploaded_images: body.photos ?? (body.imageUrl ? [body.imageUrl] : []),
      property_type: (body.details?.propertyType as string) ?? "residential",
      rental_space: (body.details?.rentalSpace as string) ?? "entire",
      furnished: (body.details?.furnished as string) ?? "non-furnished",
      pets_allowed: Boolean(body.details?.petsAllowed),
      amenities: body.amenities ?? [],
      status: isDraft ? "draft" : "published",
      landlord_user_id: userId,
      last_saved_at: new Date().toISOString(),
      completion_percentage: isDraft ? 0 : 100,
    };

    const result = await hasuraQuery<{
      insert_real_estate_property_listing_one?: Record<string, unknown>;
    }>(CREATE_PROPERTY, { property });

    if (result.errors?.length || !result.data?.insert_real_estate_property_listing_one) {
      fail(res, "Failed to create property", 500);
      return;
    }

    ok(res, result.data.insert_real_estate_property_listing_one, 201);
  } catch (error) {
    console.error("[client/properties/create-property]", error);
    fail(res, "Internal server error", 500);
  }
}
