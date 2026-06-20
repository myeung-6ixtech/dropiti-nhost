import { createHash } from "crypto";
import {
  getCountryCentroid,
  getDistrictCentroid,
  getRegionCentroid,
  type GeoPoint,
} from "./centroids";
import {
  extractDistrictFromText,
  hasStreetAddress,
  normalizeCountryCode,
  parseAddressInput,
  type NormalizedAddress,
} from "./normalize-address";
import { geocodeAddress, type GeocodeResult } from "./geocode";

export type CoordinateTier =
  | "geocoded"
  | "district"
  | "region"
  | "country"
  | "failed";

export type ResolvedCoordinates = {
  latitude: number;
  longitude: number;
  tier: CoordinateTier;
};

export type ResolveListingCoordinatesInput = {
  address: unknown;
  show_specific_location?: boolean;
  property_uuid?: string;
  /** When true, attempt Google Geocoding for street addresses (Phase 4). */
  enableGeocode?: boolean;
};

function jitterPoint(point: GeoPoint, seed: string | undefined, tier: CoordinateTier): GeoPoint {
  if (tier === "geocoded" || !seed) {
    return { lat: point.lat, lng: point.lng };
  }
  const hash = createHash("sha256").update(seed).digest();
  const latOffset = ((hash[0] / 255) * 2 - 1) * 0.0012;
  const lngOffset = ((hash[1] / 255) * 2 - 1) * 0.0012;
  return { lat: point.lat + latOffset, lng: point.lng + lngOffset };
}

function resolveDistrictTier(
  addr: NormalizedAddress | null,
  propertyUuid?: string,
): ResolvedCoordinates | null {
  const countryCode = normalizeCountryCode(addr?.country);
  let district = getDistrictCentroid(addr?.district);
  if (!district && addr?.street) {
    district = getDistrictCentroid(extractDistrictFromText(addr.street));
  }
  if (district) {
    const p = jitterPoint(district, propertyUuid, "district");
    return { latitude: p.lat, longitude: p.lng, tier: "district" };
  }
  if (addr?.district) {
    const region = getRegionCentroid(addr.district, countryCode);
    if (region) {
      const p = jitterPoint(region, propertyUuid, "region");
      return { latitude: p.lat, longitude: p.lng, tier: "region" };
    }
  }
  return null;
}

function resolveRegionOrCountry(
  addr: NormalizedAddress | null,
  propertyUuid?: string,
): ResolvedCoordinates | null {
  const countryCode = normalizeCountryCode(addr?.country);
  if (addr?.state) {
    const region = getRegionCentroid(addr.state, countryCode);
    if (region) {
      const p = jitterPoint(region, propertyUuid, "region");
      return { latitude: p.lat, longitude: p.lng, tier: "region" };
    }
  }
  const country = getCountryCentroid(countryCode ?? addr?.country);
  if (country) {
    const p = jitterPoint(country, propertyUuid, "country");
    return { latitude: p.lat, longitude: p.lng, tier: "country" };
  }
  return null;
}

function buildGeocodeQuery(addr: NormalizedAddress): string {
  const parts: string[] = [];
  if (addr.street) parts.push(addr.street);
  if (addr.district) parts.push(addr.district);
  const countryCode = normalizeCountryCode(addr.country);
  if (countryCode === "HK") parts.push("Hong Kong");
  else if (countryCode === "MO") parts.push("Macau");
  else if (addr.country) parts.push(addr.country);
  return parts.filter(Boolean).join(", ");
}

export async function resolveListingCoordinates(
  input: ResolveListingCoordinatesInput,
): Promise<ResolvedCoordinates | null> {
  const addr = parseAddressInput(input.address);
  const showSpecific = Boolean(input.show_specific_location);
  const propertyUuid = input.property_uuid;

  if (showSpecific && hasStreetAddress(addr) && input.enableGeocode) {
    const query = buildGeocodeQuery(addr!);
    const geocoded: GeocodeResult | null = await geocodeAddress(query);
    if (geocoded) {
      return {
        latitude: geocoded.lat,
        longitude: geocoded.lng,
        tier: "geocoded",
      };
    }
  }

  const districtResult = resolveDistrictTier(addr, propertyUuid);
  if (districtResult) return districtResult;

  return resolveRegionOrCountry(addr, propertyUuid);
}

/** Infer map pin precision at read time (no DB metadata columns). */
export function inferPinPrecision(
  showSpecificLocation: boolean | undefined,
  address: unknown,
): "exact" | "approximate" {
  const addr = parseAddressInput(address);
  if (showSpecificLocation && hasStreetAddress(addr)) return "exact";
  return "approximate";
}

export function coordinatesToHasuraFields(
  resolved: ResolvedCoordinates | null,
): { latitude: number | null; longitude: number | null } {
  if (!resolved) return { latitude: null, longitude: null };
  return { latitude: resolved.latitude, longitude: resolved.longitude };
}
