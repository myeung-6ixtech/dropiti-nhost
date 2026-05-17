import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const INSERT_PROPERTY = `
  mutation InsertRealEstateProperty($object: real_estate_property_listing_insert_input!) {
    insert_real_estate_property_listing_one(object: $object) {
      id property_uuid landlord_user_id status title description created_at
    }
  }
`;

export default async function adminCreateProperty(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const body = req.body as Record<string, unknown>;
    const title = body.title as string | undefined;
    const ownerId = body.ownerId as string | undefined;
    if (!title?.trim() || !ownerId) {
      fail(res, "title and ownerId are required", 400);
      return;
    }

    const currencyParam = body.rental_price_currency as string | undefined;
    const rental_price_currency = currencyParam === "MOP" ? "MOP" : "HKD";
    const status = body.status === "published" ? "published" : "draft";
    const amenities = body.amenities as unknown;
    const details = body.details as Record<string, unknown> | undefined;
    const photos = body.photos as string[] | undefined;

    let amenitiesArray: string[] = [];
    if (Array.isArray(amenities)) {
      amenitiesArray = amenities.filter(Boolean) as string[];
    } else if (
      amenities &&
      typeof amenities === "object" &&
      Array.isArray((amenities as { additionals?: unknown }).additionals)
    ) {
      amenitiesArray = (
        (amenities as { additionals: unknown[] }).additionals.filter(Boolean) as string[]
      );
    }

    const object: Record<string, unknown> = {
      landlord_user_id: ownerId,
      status,
      title,
      description: (body.description as string) ?? "",
      property_type: details?.propertyType ?? "apartment",
      rental_space: details?.rentalSpace ?? "entire",
      address: body.address ?? {},
      show_specific_location:
        typeof body.show_specific_location === "boolean" ? body.show_specific_location : true,
      external_url: body.external_url ?? null,
      external_contact: body.external_contact ?? null,
      completion_percentage: body.completion_percentage ?? null,
      gross_area_size: details?.grossArea ?? null,
      gross_area_size_unit: "sqft",
      num_bedroom: body.bedrooms ?? null,
      num_bathroom: body.bathrooms ?? null,
      furnished: details?.furnished ?? "none",
      pets_allowed: details?.petsAllowed ?? false,
      amenities: amenitiesArray,
      display_image: photos?.length ? photos[0] : null,
      uploaded_images: photos ?? [],
      rental_price: body.price ?? null,
      rental_price_currency,
      availability_date: body.availableDate ?? null,
    };

    const result = await hasuraQuery<{
      insert_real_estate_property_listing_one?: Record<string, unknown>;
    }>(INSERT_PROPERTY, { object });

    if (result.errors?.length) {
      fail(res, result.errors[0]?.message ?? "Failed to create property", 500);
      return;
    }

    const property = result.data?.insert_real_estate_property_listing_one;
    if (!property) {
      fail(res, "Insert did not return a property", 500);
      return;
    }

    ok(res, property, 201);
  } catch (e) {
    console.error("[admin/properties/create-property]", e);
    fail(res, "Internal server error", 500);
  }
}
