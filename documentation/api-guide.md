# Dropiti Nhost — Functions API (local & cloud)

Base URL pattern:

- **Local (Nhost CLI):** `https://local.functions.local.nhost.run/v1/...`
- **Cloud:** `https://<subdomain>.functions.<region>.nhost.run/v1/...`

All function routes use the **`/v1/`** prefix plus the path derived from the file under `functions/` (see [AI_Rules.md](./AI_Rules.md) §3).

## Routes (baseline)

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/v1/health` | None — liveness |
| `GET` | `/v1/echo` | `Authorization: Bearer <nhost_access_token>` |

### Health

```bash
curl -sS "https://local.functions.local.nhost.run/v1/health"
```

Response envelope (see `_lib/respond.ts`):

```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "node": "v22.x.x",
    "time": "2026-..."
  }
}
```

### Echo (authenticated)

Obtain a user JWT from your Nhost app (sign-in), then:

```bash
curl -sS -H "Authorization: Bearer <ACCESS_TOKEN>" \
  "https://local.functions.local.nhost.run/v1/echo?foo=bar"
```

Errors use `{ "ok": false, "error": "...", "details?"?: ... }` with appropriate HTTP status.

## Response envelope

Use **`ok(res, data, status)`** and **`fail(res, message, status, details?)`** from `functions/_lib/respond.ts` in all handlers — do not invent ad-hoc JSON shapes for app responses.

## Hasura from Functions

Use **`hasuraQuery`** from `functions/_lib/hasura.ts` with GraphQL documents at module scope. Check `result.errors` before using `result.data`. Runtime URL and admin secret come from `_lib/env.ts` (`NHOST_GRAPHQL_URL`, `NHOST_ADMIN_SECRET`, fallbacks documented in AI_Rules).

## Secrets & env

- **Local:** repo-root **`.secrets`** file — copy from `secrets/dotsecrets.example` (`secrets/README.md`).
- **Cloud:** Nhost Dashboard → Secrets; `nhost/nhost.toml` references `{{ secrets.HASURA_GRAPHQL_* }}` for Hasura.

## Related

- [Nhost Functions — Getting started](https://docs.nhost.io/products/functions/guides/getting-started/)
- [JWT verification in Functions](https://docs.nhost.io/products/functions/guides/jwt-verification/)
