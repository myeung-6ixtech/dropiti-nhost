/** Server-side Google Geocoding (Phase 4). Requires GOOGLE_MAPS_GEOCODING_API_KEY. */

export type GeocodeResult = { lat: number; lng: number };

const geocodeCache = new Map<string, GeocodeResult | null>();

function readGeocodeApiKey(): string | null {
  const key =
    process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
}

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  if (geocodeCache.has(trimmed)) {
    return geocodeCache.get(trimmed) ?? null;
  }

  const apiKey = readGeocodeApiKey();
  if (!apiKey) {
    geocodeCache.set(trimmed, null);
    return null;
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", trimmed);
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      geocodeCache.set(trimmed, null);
      return null;
    }

    const json = (await res.json()) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };

    if (json.status !== "OK" || !json.results?.length) {
      geocodeCache.set(trimmed, null);
      return null;
    }

    const loc = json.results[0]?.geometry?.location;
    if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") {
      geocodeCache.set(trimmed, null);
      return null;
    }

    const result: GeocodeResult = { lat: loc.lat, lng: loc.lng };
    geocodeCache.set(trimmed, result);
    return result;
  } catch {
    geocodeCache.set(trimmed, null);
    return null;
  }
}

export function clearGeocodeCacheForTests(): void {
  geocodeCache.clear();
}
