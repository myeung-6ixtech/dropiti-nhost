/**
 * Central env resolution for Nhost Functions.
 * Route handlers must import from here — not read Hasura/Nhost secret env vars directly.
 */

function readAdminSecret(): string | undefined {
  return process.env.NHOST_ADMIN_SECRET ?? process.env.HASURA_GRAPHQL_ADMIN_SECRET;
}

function readGraphqlUrl(): string | undefined {
  const direct = process.env.NHOST_GRAPHQL_URL;
  if (direct) return direct;

  const sub = process.env.NHOST_SUBDOMAIN;
  const region = process.env.NHOST_REGION;
  if (sub && region) {
    return `https://${sub}.graphql.${region}.nhost.run/v1/graphql`;
  }
  return undefined;
}

/**
 * Symmetric signing key for HS256 (Nhost may inject JSON: `{ "type": "HS256", "key": "..." }`).
 */
export function getJwtSecretKey(): string | undefined {
  const raw = process.env.NHOST_JWT_SECRET ?? process.env.HASURA_GRAPHQL_JWT_SECRET;
  if (!raw) return undefined;

  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { key?: unknown };
      if (typeof parsed.key === "string" && parsed.key.length > 0) {
        return parsed.key;
      }
    } catch {
      /* not JSON */
    }
  }
  return trimmed;
}

export function getHasuraAdminSecret(): string {
  const s = readAdminSecret();
  if (!s) {
    throw new Error("Missing NHOST_ADMIN_SECRET or HASURA_GRAPHQL_ADMIN_SECRET");
  }
  return s;
}

export function getGraphqlUrl(): string {
  const u = readGraphqlUrl();
  if (!u) {
    throw new Error(
      "Missing NHOST_GRAPHQL_URL (or both NHOST_SUBDOMAIN and NHOST_REGION for fallback)"
    );
  }
  return u;
}

/** Optional: admin-only function routes via `x-admin-secret`. */
export function getAdminSecret(): string | undefined {
  const s = process.env.ADMIN_SECRET;
  return s && s.length > 0 ? s : undefined;
}

export type WhatsAppProviderName = "stub" | "meta" | "twilio";

export function getWhatsAppProvider(): WhatsAppProviderName {
  const p = (process.env.WHATSAPP_PROVIDER ?? "stub").trim().toLowerCase();
  if (p === "meta" || p === "twilio") return p;
  return "stub";
}

export function getWhatsAppApiToken(): string | undefined {
  const t = process.env.WHATSAPP_API_TOKEN;
  return t && t.length > 0 ? t : undefined;
}

export function getWhatsAppPhoneNumberId(): string | undefined {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return id && id.length > 0 ? id : undefined;
}

export function getInvitationExpiryDays(): number {
  const n = Number(process.env.INVITATION_EXPIRY_DAYS ?? "7");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 7;
}

/** Client app origin for transfer-ownership invitation links. */
export function getClientAppOrigin(): string {
  const url =
    process.env.DROPITI_CLIENT_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://dropiti.com";
  return url.replace(/\/$/, "");
}
