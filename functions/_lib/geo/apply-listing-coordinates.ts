import {
  coordinatesToHasuraFields,
  resolveListingCoordinates,
  type ResolveListingCoordinatesInput,
} from "./resolve-listing-coordinates";

export type ApplyCoordinatesOptions = ResolveListingCoordinatesInput & {
  /** Admin manual override — skips resolver when both provided. */
  manualLatitude?: number | null;
  manualLongitude?: number | null;
  /** Force recompute even when manual coords exist. */
  recalculate?: boolean;
};

/**
 * Returns Hasura `_set` fields for latitude/longitude on create/update.
 */
export async function applyListingCoordinates(
  opts: ApplyCoordinatesOptions,
): Promise<{ latitude: number | null; longitude: number | null }> {
  const hasManual =
    !opts.recalculate &&
    typeof opts.manualLatitude === "number" &&
    typeof opts.manualLongitude === "number" &&
    !Number.isNaN(opts.manualLatitude) &&
    !Number.isNaN(opts.manualLongitude);

  if (hasManual) {
    return {
      latitude: opts.manualLatitude!,
      longitude: opts.manualLongitude!,
    };
  }

  const resolved = await resolveListingCoordinates({
    address: opts.address,
    show_specific_location: opts.show_specific_location,
    property_uuid: opts.property_uuid,
    enableGeocode: opts.enableGeocode,
  });

  return coordinatesToHasuraFields(resolved);
}
