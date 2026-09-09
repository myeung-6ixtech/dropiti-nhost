export const INTENDED_LEASE_DURATIONS = ["6", "12", "18", "24", "24plus"] as const;
export const PROPERTY_USES = ["residential", "residential_wfh", "home_office"] as const;
export const LIFESTYLE_TAGS = [
  "no_smoking",
  "no_pets",
  "wfh_friendly",
  "quiet_hours",
  "minor_maintenance",
  "rental_references",
  "long_term_expats",
  "employer_allowance",
] as const;

export type IntendedLeaseDuration = (typeof INTENDED_LEASE_DURATIONS)[number];
export type PropertyUse = (typeof PROPERTY_USES)[number];
export type LifestyleTag = (typeof LIFESTYLE_TAGS)[number];

const LEASE_SET = new Set<string>(INTENDED_LEASE_DURATIONS);
const USE_SET = new Set<string>(PROPERTY_USES);
const TAG_SET = new Set<string>(LIFESTYLE_TAGS);

export function normalizeLifestyleTags(value: unknown): LifestyleTag[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<LifestyleTag>();
  for (const item of value) {
    if (typeof item === "string" && TAG_SET.has(item)) {
      unique.add(item as LifestyleTag);
    }
  }
  return [...unique].slice(0, 4);
}

export function isIntendedLeaseDuration(value: unknown): value is IntendedLeaseDuration {
  return typeof value === "string" && LEASE_SET.has(value);
}

export function isPropertyUse(value: unknown): value is PropertyUse {
  return typeof value === "string" && USE_SET.has(value);
}
