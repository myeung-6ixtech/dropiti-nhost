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
