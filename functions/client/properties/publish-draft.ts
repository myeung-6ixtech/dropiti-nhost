import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";
import { applyListingCoordinates } from "../../_lib/geo/apply-listing-coordinates";

const PublishSchema = z.object({
  property_uuid: z.string().uuid(),
});

const FETCH_FOR_PUBLISH = `
  query FetchForPublish($property_uuid: uuid!, $landlord_user_id: uuid!) {
    real_estate_property_listing(
      where: {
        property_uuid: { _eq: $property_uuid }
        landlord_user_id: { _eq: $landlord_user_id }
      }
      limit: 1
    ) {
      property_uuid
      address
      show_specific_location
      latitude
      longitude
    }
  }
`;

const PUBLISH_DRAFT = `
  mutation PublishDraft(
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
        latitude
        longitude
        updated_at
      }
    }
  }
`;

export default async function publishDraft(req: Request, res: Response): Promise<void> {
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

    const body = validateBody(req, res, PublishSchema);
    if (!body) return;

    const fetchResult = await hasuraQuery<{
      real_estate_property_listing?: Array<{
        property_uuid: string;
        address: unknown;
        show_specific_location?: boolean;
        latitude?: number | null;
        longitude?: number | null;
      }>;
    }>(FETCH_FOR_PUBLISH, {
      property_uuid: body.property_uuid,
      landlord_user_id: userId,
    });

    const existing = fetchResult.data?.real_estate_property_listing?.[0];
    if (!existing) {
      fail(res, "Property not found", 404);
      return;
    }

    const publishUpdates: Record<string, unknown> = {
      status: "published",
      completion_percentage: 100,
      last_saved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existing.latitude == null || existing.longitude == null) {
      const coords = await applyListingCoordinates({
        address: existing.address,
        show_specific_location: existing.show_specific_location,
        property_uuid: existing.property_uuid,
        enableGeocode: true,
      });
      publishUpdates.latitude = coords.latitude;
      publishUpdates.longitude = coords.longitude;
    }

    const result = await hasuraQuery<{
      update_real_estate_property_listing?: { returning?: unknown[]; affected_rows: number };
    }>(PUBLISH_DRAFT, {
      property_uuid: body.property_uuid,
      landlord_user_id: userId,
      updates: publishUpdates,
    });

    if (result.errors?.length) {
      fail(res, "Failed to publish draft", 500);
      return;
    }

    const row = result.data?.update_real_estate_property_listing?.returning?.[0];
    if (!row) {
      fail(res, "Property not found", 404);
      return;
    }

    ok(res, row);
  } catch (error) {
    console.error("[client/properties/publish-draft]", error);
    fail(res, "Internal server error", 500);
  }
}
