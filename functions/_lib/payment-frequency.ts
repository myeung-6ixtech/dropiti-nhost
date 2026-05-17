const DB_ALLOWED = new Set(["monthly", "quarterly", "annually"]);

export function toDatabasePaymentFrequency(value: string | undefined | null): string {
  if (value == null || value === "") return "monthly";
  const v = String(value).toLowerCase().trim();
  if (v === "yearly") return "annually";
  if (DB_ALLOWED.has(v)) return v;
  return v;
}

export function toClientPaymentFrequency(
  value: string | undefined | null
): string | undefined {
  if (value == null || value === "") return undefined;
  if (value === "annually") return "yearly";
  return value;
}
