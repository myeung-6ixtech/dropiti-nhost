import raw from "./centroids.json";

export type GeoPoint = { lat: number; lng: number };

export type DistrictCentroid = GeoPoint & {
  code: string;
  name: string;
  region: string;
  country: string;
};

export type RegionCentroid = GeoPoint & {
  code: string;
  name: string;
  country: string;
};

export type CountryCentroid = GeoPoint & {
  code: string;
  name: string;
};

type CentroidsFile = {
  countries: CountryCentroid[];
  regions: RegionCentroid[];
  districts: DistrictCentroid[];
  districtAliases: Record<string, string>;
};

const data = raw as CentroidsFile;

const districtByCode = new Map<string, DistrictCentroid>();
const districtByName = new Map<string, DistrictCentroid>();
const regionByName = new Map<string, RegionCentroid>();
const countryByCode = new Map<string, CountryCentroid>();
const countryByName = new Map<string, CountryCentroid>();

function normKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

for (const d of data.districts) {
  districtByCode.set(normKey(d.code), d);
  districtByName.set(normKey(d.name), d);
}

for (const r of data.regions) {
  regionByName.set(normKey(r.name), r);
}

for (const c of data.countries) {
  countryByCode.set(normKey(c.code), c);
  countryByName.set(normKey(c.name), c);
}

export function getDistrictCentroid(input: string | undefined | null): DistrictCentroid | null {
  if (!input?.trim()) return null;
  const key = normKey(input);
  const alias = data.districtAliases[key];
  if (alias) {
    const byAlias = districtByCode.get(normKey(alias)) ?? countryByCode.get(normKey(alias));
    if (byAlias && "region" in byAlias) return byAlias as DistrictCentroid;
  }
  return districtByCode.get(key) ?? districtByName.get(key) ?? null;
}

export function getRegionCentroid(input: string | undefined | null, countryCode?: string): RegionCentroid | null {
  if (!input?.trim()) return null;
  const region = regionByName.get(normKey(input));
  if (!region) return null;
  if (countryCode && normKey(region.country) !== normKey(countryCode)) return null;
  return region;
}

export function getCountryCentroid(input: string | undefined | null): CountryCentroid | null {
  if (!input?.trim()) return null;
  const key = normKey(input);
  return countryByCode.get(key) ?? countryByName.get(key) ?? null;
}

export function listDistrictCentroids(): DistrictCentroid[] {
  const seen = new Set<string>();
  return data.districts.filter((d) => {
    if (seen.has(d.code)) return false;
    seen.add(d.code);
    return true;
  });
}

export { data as centroidsData };
