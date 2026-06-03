/** Minimal address formatter for property API responses. */

type AddressObject = {
  unit?: string;
  floor?: string;
  block?: string;
  buildingName?: string;
  addressLine1?: string;
  addressLine2?: string;
  district?: string;
  state?: string;
  country?: string;
};

function capitalizeWords(str: string): string {
  if (!str) return str;
  return str.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function parsePropertyAddress(location: unknown): AddressObject | null {
  if (!location) return null;
  if (typeof location === "string") {
    const trimmed = location.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as AddressObject;
        }
      } catch {
        return { addressLine1: trimmed };
      }
    }
    return { addressLine1: trimmed };
  }
  if (typeof location === "object" && location !== null) {
    return location as AddressObject;
  }
  return null;
}

export function formatPropertyLocation(location: unknown): string {
  const parsed = parsePropertyAddress(location);
  if (!parsed) return "Address not specified";
  if (typeof location === "string") {
    const trimmed = location.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return trimmed;
    }
  }
  const addressObj = parsed;
  if (addressObj) {
    const parts: string[] = [];
    if (addressObj.unit) parts.push(`Unit ${addressObj.unit}`);
    if (addressObj.floor) parts.push(`Floor ${addressObj.floor}`);
    if (addressObj.block) parts.push(addressObj.block);
    if (addressObj.buildingName) parts.push(addressObj.buildingName);
    if (addressObj.addressLine1) parts.push(addressObj.addressLine1);
    if (addressObj.addressLine2) parts.push(addressObj.addressLine2);
    if (addressObj.district) parts.push(capitalizeWords(addressObj.district));
    if (addressObj.state) parts.push(capitalizeWords(addressObj.state));
    if (addressObj.country) parts.push(capitalizeWords(addressObj.country));
    return parts.length > 0 ? parts.join(", ") : "Address not specified";
  }
  return "Address not specified";
}
