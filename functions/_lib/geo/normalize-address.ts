/** Canonical address shape for coordinate resolution. */

export type NormalizedAddress = {
  unit?: string;
  floor?: string;
  block?: string;
  buildingName?: string;
  street?: string;
  addressLine2?: string;
  district?: string;
  state?: string;
  country?: string;
  city?: string;
};

type RawAddress = Record<string, unknown>;

function pickString(obj: RawAddress, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export function parseAddressInput(address: unknown): NormalizedAddress | null {
  if (!address) return null;

  if (typeof address === "string") {
    const trimmed = address.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return parseAddressInput(JSON.parse(trimmed) as unknown);
      } catch {
        return { street: trimmed };
      }
    }
    return { street: trimmed };
  }

  if (typeof address !== "object" || address === null || Array.isArray(address)) {
    return null;
  }

  const obj = address as RawAddress;
  return {
    unit: pickString(obj, ["unit"]),
    floor: pickString(obj, ["floor"]),
    block: pickString(obj, ["block"]),
    buildingName: pickString(obj, ["buildingName", "building", "apartmentEstate"]),
    street: pickString(obj, ["addressLine1", "street"]),
    addressLine2: pickString(obj, ["addressLine2"]),
    district: pickString(obj, ["district"]),
    state: pickString(obj, ["state"]),
    country: pickString(obj, ["country"]),
    city: pickString(obj, ["city"]),
  };
}

export function hasStreetAddress(addr: NormalizedAddress | null): boolean {
  if (!addr) return false;
  return Boolean(addr.street?.trim());
}

export function normalizeCountryCode(country: string | undefined): string | undefined {
  if (!country?.trim()) return undefined;
  const c = country.trim().toLowerCase();
  if (c === "hk" || c === "hong kong") return "HK";
  if (c === "mo" || c === "macau" || c === "macao") return "MO";
  return country.trim();
}

/** Try to extract district token from a free-text location string. */
export function extractDistrictFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  const hkMarkers = [
    "wan chai",
    "kwun tong",
    "sham shui po",
    "yau tsim mong",
    "tsim sha tsui",
    "central and western",
    "central",
    "sha tin",
    "tuen mun",
    "yuen long",
    "sai kung",
    "tai po",
    "tsuen wan",
  ];
  for (const marker of hkMarkers) {
    if (lower.includes(marker)) return marker;
  }
  if (lower.includes("macau") || lower.includes("macao")) return "Macau";
  return undefined;
}

export function addressFingerprint(addr: NormalizedAddress | null, showSpecificLocation: boolean): string {
  const parts = [
    showSpecificLocation ? "1" : "0",
    addr?.street ?? "",
    addr?.district ?? "",
    addr?.country ?? "",
    addr?.buildingName ?? "",
  ];
  return parts.join("|").toLowerCase();
}
