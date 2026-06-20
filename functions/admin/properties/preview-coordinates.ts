import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";
import {
  inferPinPrecision,
  resolveListingCoordinates,
} from "../../_lib/geo/resolve-listing-coordinates";

const PreviewSchema = z.object({
  address: z.unknown().optional().default({}),
  show_specific_location: z.boolean().optional(),
  property_uuid: z.string().uuid().optional(),
  enableGeocode: z.boolean().optional(),
});

/** POST /v1/admin/properties/preview-coordinates — resolve lat/lng without saving. */
export default async function previewCoordinates(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const body = validateBody(req, res, PreviewSchema);
    if (!body) return;

    const resolved = await resolveListingCoordinates({
      address: body.address,
      show_specific_location: body.show_specific_location,
      property_uuid: body.property_uuid,
      enableGeocode: body.enableGeocode ?? true,
    });

    if (!resolved) {
      fail(res, "Could not resolve coordinates from address", 422);
      return;
    }

    ok(res, {
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      tier: resolved.tier,
      pinPrecision: inferPinPrecision(body.show_specific_location, body.address),
    });
  } catch (error) {
    console.error("[admin/properties/preview-coordinates]", error);
    fail(res, "Internal server error", 500);
  }
}
