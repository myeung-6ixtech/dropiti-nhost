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

export type AirwallexEnvName = "demo" | "prod";

export function getAirwallexApiKey(): string | undefined {
  const k = process.env.AIRWALLEX_API_KEY;
  return k && k.length > 0 ? k : undefined;
}

export function getAirwallexClientId(): string | undefined {
  const id = process.env.AIRWALLEX_CLIENT_ID;
  return id && id.length > 0 ? id : undefined;
}

export function getAirwallexEnv(): AirwallexEnvName {
  const e = (process.env.AIRWALLEX_ENV ?? "demo").trim().toLowerCase();
  return e === "prod" ? "prod" : "demo";
}

export function isAirwallexConfigured(): boolean {
  return Boolean(getAirwallexApiKey() && getAirwallexClientId());
}

export function getUpstashRedisUrl(): string | undefined {
  const u = process.env.UPSTASH_REDIS_REST_URL;
  return u && u.length > 0 ? u : undefined;
}

export function getUpstashRedisToken(): string | undefined {
  const t = process.env.UPSTASH_REDIS_REST_TOKEN;
  return t && t.length > 0 ? t : undefined;
}

export function isUpstashConfigured(): boolean {
  return Boolean(getUpstashRedisUrl() && getUpstashRedisToken());
}

/** Nhost Storage base URL for admin presigned uploads. */
export function getStorageBaseUrl(): string | undefined {
  const direct = process.env.NHOST_STORAGE_URL;
  if (direct) return direct.replace(/\/$/, "");

  const sub = process.env.NHOST_SUBDOMAIN;
  const region = process.env.NHOST_REGION;
  if (sub && region) {
    return `https://${sub}.storage.${region}.nhost.run/v1`;
  }
  return undefined;
}

export function getDefaultAdminMediaBucket(): string {
  return process.env.MEDIA_STORAGE_BUCKET?.trim() || "dropiti-bucket";
}

export function isNhostStorageConfigured(): boolean {
  return Boolean(getStorageBaseUrl() && getHasuraAdminSecret());
}

/** Bucket id stored in Hasura `s3_bucket` (Nhost Storage bucket or S3 bucket name). */
export function getMediaStorageBucketName(): string {
  if (getUploadBackend() === "nhost") {
    return getDefaultAdminMediaBucket();
  }
  if (isS3Configured()) {
    return getS3BucketName();
  }
  return getDefaultAdminMediaBucket();
}

export type UploadBackend = "nhost" | "s3";

/** Prefer Nhost Storage when available; fall back to S3/Lightsail. */
export function getUploadBackend(): UploadBackend {
  const forced = process.env.MEDIA_STORAGE_BACKEND?.trim().toLowerCase();
  if (forced === "nhost" || forced === "s3") return forced;
  if (isNhostStorageConfigured()) return "nhost";
  if (isS3Configured()) return "s3";
  return "s3";
}

export function isMediaUploadConfigured(): boolean {
  return getUploadBackend() === "nhost" ? isNhostStorageConfigured() : isS3Configured();
}

export function getS3AccessKey(): string {
  const k = process.env.S3_BUCKET_ACCESS_KEY;
  if (!k?.trim()) throw new Error("Missing S3_BUCKET_ACCESS_KEY");
  return k.trim();
}

export function getS3SecretKey(): string {
  const k = process.env.S3_BUCKET_SECRET_KEY;
  if (!k?.trim()) throw new Error("Missing S3_BUCKET_SECRET_KEY");
  return k.trim();
}

export function getS3BucketName(): string {
  const n = process.env.S3_BUCKET_NAME;
  if (!n?.trim()) throw new Error("Missing S3_BUCKET_NAME");
  return n.trim();
}

export function getS3Region(): string {
  return (process.env.S3_BUCKET_AWS_REGION ?? "ap-northeast-2").trim();
}

/** Optional CDN or virtual-host base URL (no trailing slash). */
export function getS3BucketDomainUrl(): string {
  const u = process.env.S3_BUCKET_DOMAIN_URL?.trim();
  if (u) return u.replace(/\/$/, "");
  return "";
}

export function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_BUCKET_ACCESS_KEY?.trim() &&
      process.env.S3_BUCKET_SECRET_KEY?.trim() &&
      process.env.S3_BUCKET_NAME?.trim()
  );
}

/** Platform landlord UUIDs for admin incoming-offers (comma-separated). */
export function getDropitiPlatformLandlordUserIds(): string[] {
  const raw = process.env.DROPITI_PLATFORM_LANDLORD_USER_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
