# Dropiti Nhost — Backend API Reference

**Version:** 2.0 — May 2026  
**Repo:** `myeung-6ixtech/dropiti-nhost` · branch `main`  
**Sourced from:** `documentation/api-guide.md`, `documentation/AI_Rules.md` (live, main branch)

**Changes in 2.0 (from 1.0):** The admin **properties list** (`AdminListProperties`) is served at **`GET /v1/admin/properties/list`** (`functions/admin/properties/list.ts`), not `GET /v1/admin/properties` or `…/properties/index`. The admin console BFF rewrites **`GET admin/properties`** → **`admin/properties/list`** when proxying to Nhost. All other `/v1/admin/properties/*` action routes are unchanged.

> This document describes how the deployed Nhost Functions work — their routing, authentication, request shape, response envelope, shared infrastructure, and constraints. It is written to be readable by both humans and AI code-generation tools. Every rule in this document reflects the actual implementation in the repository.

---

## Contents

1. [Base URLs](#1-base-urls)
2. [How Routing Works](#2-how-routing-works)
3. [Authentication](#3-authentication)
4. [Response Envelope](#4-response-envelope)
5. [Shared Library (`_lib/`)](#5-shared-library-_lib)
6. [Environment Variables](#6-environment-variables)
7. [Handler Contract](#7-handler-contract)
8. [Dos and Do-Nots](#8-dos-and-do-nots)
9. [Operational Routes](#9-operational-routes)
10. [Client Routes (`/v1/client/*`)](#10-client-routes-v1client)
11. [Admin Routes (`/v1/admin/*`)](#11-admin-routes-v1admin)
12. [Pre-Push Verification](#12-pre-push-verification)

---

## 1. Base URLs

| Environment | Base URL |
|---|---|
| **Cloud** | `https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run` |
| **Local (Nhost CLI)** | `https://local.functions.local.nhost.run` |

All routes use the `/v1/` prefix. The full URL for any route is:

```
{BASE_URL}/v1/{file-path-under-functions}
```

Frontend env var that must point to the cloud base URL (no trailing slash):

```
NEXT_PUBLIC_FUNCTIONS_URL=https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run
```

**Admin console (`dropiti-admin-console`):** the browser does not call this URL directly with `fetch`. It uses same-origin `GET|POST|… /api/v1/bff/functions/<path>`, which reads the httpOnly `nhost_access_token` cookie and proxies to `{NEXT_PUBLIC_FUNCTIONS_URL}/v1/<path>` with a Bearer header. REST-style paths (e.g. `admin/users/:id`) are rewritten to static Nhost paths before proxying. **`GET admin/properties`** (collection list) is rewritten to **`admin/properties/list`**. Implementation: `src/app/api/v1/bff/functions/[...path]/route.ts`, `src/lib/bff-route-rewrite.ts`, `src/lib/admin-api.ts`.

---

## 2. How Routing Works

Nhost maps the file path relative to `functions/` directly to the HTTP URL path under `/v1/`. **There is no router, no configuration file, and no registration step.** The file system is the router.

### Mapping rule

```
functions/{path}.ts  →  {BASE_URL}/v1/{path}
```

### Examples

| File on disk | HTTP URL |
|---|---|
| `functions/health.ts` | `GET /v1/health` |
| `functions/echo.ts` | `GET /v1/echo` |
| `functions/client/users/create-user.ts` | `POST /v1/client/users/create-user` |
| `functions/client/properties/get-listings.ts` | `GET /v1/client/properties/get-listings` |
| `functions/admin/offers/incoming.ts` | `GET /v1/admin/offers/incoming` |
| `functions/admin/properties/list.ts` | `GET /v1/admin/properties/list` |
| `functions/admin/media/index.ts` | `GET /v1/admin/media` |
| `functions/admin/upload/batch.ts` | `POST /v1/admin/upload/batch` |
| `functions/admin/support/tickets/index.ts` | `GET /v1/admin/support/tickets/index` |

### Namespace summary

| Namespace | On-disk prefix | URL prefix | Used by |
|---|---|---|---|
| Ops | `functions/` (root) | `/v1/` | Internal health checks |
| Client | `functions/client/` | `/v1/client/` | `dropiti-v3` frontend |
| Admin | `functions/admin/` | `/v1/admin/` | `dropiti-admin-console` |

### ❌ Do NOT

- Create a `functions/v1/` directory — produces `/v1/v1/...`
- Do **not** call `/v1/admin/<domain>/index` for `index.ts` handlers — `functions/admin/users/index.ts` is served at **`GET /v1/admin/users`**. The admin BFF passes `GET admin/users` through unchanged.
- Use `PascalCase` or `snake_case` in file/directory names — use `kebab-case` only
- Put more than one `export default` handler in a file
- Import one route handler from another route handler

---

## 3. Authentication

### How auth works

All protected routes verify a **Nhost JWT** sent as a Bearer token in the `Authorization` header. Nhost Auth issues this token on `signIn()`.

```
Authorization: Bearer <nhost_access_token>
```

> **Cookies are not forwarded cross-origin.** The admin console and client app run on different origins from the Functions URL. They must send the Bearer header explicitly on every request. Do not rely on cookies.

### JWT payload structure

Every valid Nhost JWT contains Hasura claims:

```json
{
  "sub": "<user-uuid>",
  "iat": 1234567890,
  "exp": 1234567890,
  "https://hasura.io/jwt/claims": {
    "x-hasura-user-id": "<user-uuid>",
    "x-hasura-allowed-roles": ["user"],
    "x-hasura-default-role": "user"
  }
}
```

Admin users additionally have `"admin"` in `x-hasura-allowed-roles`.

### Auth functions in `_lib/auth.ts`

| Function | What it does | Returns on failure |
|---|---|---|
| `requireAuth(req, res)` | Verifies Bearer JWT. | Sends `401`, returns `null` |
| `getUserId(payload)` | Extracts `x-hasura-user-id` from JWT claims. | — |
| `requireAdminRole(req, res)` | `requireAuth` + checks `"admin"` in roles. | Sends `401` or `403`, returns `null` |

### Auth levels

| Level | Used by | How enforced |
|---|---|---|
| **Public** | `transfer-ownership/validate` | No auth check |
| **Optional Bearer** | `get-listings`, `get-property`, `get-reviews-*` | If header present, must still verify |
| **Bearer** | All other client routes | `requireAuth(req, res)` |
| **Admin Bearer** | All admin routes | `requireAdminRole(req, res)` |

### ❌ Do NOT

- Manually decode `Authorization` headers inside a handler
- Trust `user_id`, `author_id`, or any user identity field from the request body
- Use `x-admin-secret` header for admin auth — Dropiti uses JWT role checking only
- Hardcode or compare raw token strings
- Skip `requireAuth()` on any mutating route

---

## 4. Response Envelope

**All responses use a fixed envelope shape.** Use `ok()` and `fail()` from `_lib/respond.ts`. Never write `res.json()` or `res.send()` directly in a handler.

### Success

```json
{ "ok": true, "data": <T> }
```

### Failure

```json
{ "ok": false, "error": "<human-readable message>", "details": <optional> }
```

### Status codes

| Code | Meaning |
|---|---|
| `200` | Success (read or action) |
| `201` | Resource created |
| `204` | Preflight OPTIONS (no body) |
| `400` | Malformed request — missing field, wrong type |
| `401` | No token, expired token, or invalid signature |
| `403` | Valid token but wrong role or ownership violation |
| `404` | Resource not found or intentionally hidden |
| `422` | Body present but Zod schema validation failed |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error |

### List endpoint envelope

Paginated list routes return:

```json
{
  "ok": true,
  "data": {
    "items": [...],
    "total": 42,
    "limit": 20,
    "offset": 0
  }
}
```

### ❌ Do NOT

- Return `{ success: true }`, `{ message: "..." }`, or any custom shape
- Leak Hasura error payloads, stack traces, secret names, or env var values in responses
- Return `null` or `undefined` as the `data` value — return `[]` for empty lists, `{}` for empty objects

---

## 5. Shared Library (`_lib/`)

All shared infrastructure lives in `functions/_lib/`. Files prefixed `_` are never exposed as routes. Handlers import from here — never inline the logic.

### `_lib/env.ts` — environment variable reader

**The only file in the repo that reads `process.env` directly.** Every handler that needs a config value imports from `env`.

Key values exposed:

| `env` field | Source secret | Notes |
|---|---|---|
| `env.adminSecret` | `NHOST_ADMIN_SECRET` or `HASURA_GRAPHQL_ADMIN_SECRET` | Used by `_lib/hasura.ts` |
| `env.jwtSecret` | `NHOST_JWT_SECRET` or `HASURA_GRAPHQL_JWT_SECRET` | Nhost wraps as JSON — `env.ts` parses `.key` |
| `env.graphqlUrl` | `NHOST_GRAPHQL_URL` | Falls back to building from `NHOST_SUBDOMAIN`+`NHOST_REGION` |
| `env.clientOrigin` | `DROPITI_CLIENT_ORIGIN` | CORS allowed origin; defaults to `*` in local dev |
| `env.whatsappProvider` | `WHATSAPP_PROVIDER` | `stub` \| `meta` \| `twilio` |
| `env.airwallexApiKey` | `AIRWALLEX_API_KEY` | Server-only — never in frontend |
| `env.s3AccessKey` | `S3_BUCKET_ACCESS_KEY` | AWS S3 credentials |
| `env.s3BucketName` | `S3_BUCKET_NAME` | AWS S3 bucket |
| `env.upstashRedisUrl` | `UPSTASH_REDIS_REST_URL` | Rate limiting |

### `_lib/hasura.ts` — GraphQL client

```ts
const result = await hasuraQuery<MyResultType>(GRAPHQL_DOCUMENT, variables)
if (result.errors?.length) return fail(res, 'Query failed', 500)
const data = result.data
```

Rules:
- The GraphQL document must be defined at **module scope** (top of the file), never inline inside `hasuraQuery()`
- Always check `result.errors` before accessing `result.data`
- Uses admin secret — server-only, never client-accessible

### `_lib/auth.ts` — JWT verification

```ts
const payload = await requireAuth(req, res)
if (!payload) return                       // 401 already sent

const userId = getUserId(payload)          // from JWT claims only

// For admin routes:
const payload = await requireAdminRole(req, res)
if (!payload) return                       // 401 or 403 already sent
```

### `_lib/respond.ts` — response helpers

```ts
ok(res, data)              // 200 success
ok(res, data, 201)         // 201 created
fail(res, 'message', 400)  // 400 bad request
fail(res, 'message', 500, errorDetails)  // 500 with optional details
```

### `_lib/validate.ts` — Zod schema validation

```ts
// Schema defined at module scope
const MySchema = z.object({ name: z.string(), count: z.number().int().positive() })

// Inside handler:
const body = validate(req, res, MySchema)
if (!body) return   // 422 already sent with Zod error details
```

### `_lib/s3.ts` — AWS S3 presigned URLs

Generates S3 presigned PUT URLs. Used by upload routes only. Never proxies file bytes through the Function.

### `_lib/airwallex.ts` — Airwallex API client

Server-side Airwallex proxy. Returns `{ stub: true, data: [] }` when `AIRWALLEX_API_KEY` is not set — safe for local development without live credentials.

### `_lib/ratelimit.ts` — Upstash rate limiter

```ts
const allowed = await isAllowed(`admin:offers:${adminId}`, 100, 60)
if (!allowed) return fail(res, 'Rate limit exceeded', 429)
```

Keys are per-user, not global. Pattern: `{category}:{action}:{userId}`.

### `_lib/whatsapp.ts` — WhatsApp service

Provider-agnostic. Set `WHATSAPP_PROVIDER=stub` for local dev (logs to console). Set to `meta` or `twilio` for production.

### Import depth by handler location

| Handler file location | Import `_lib` as |
|---|---|
| `functions/health.ts` | `./_lib/respond` |
| `functions/client/<domain>/<file>.ts` | `../../_lib/respond` |
| `functions/admin/<domain>/<file>.ts` | `../../_lib/respond` |
| `functions/admin/support/tickets/<file>.ts` | `../../../_lib/respond` |

Wrong import depth causes `Cannot find module` at build time. Count directory levels carefully.

---

## 6. Environment Variables

### Where secrets are stored

| Environment | Location |
|---|---|
| **Local development** | Repo-root `.secrets` file (copy from `secrets/dotsecrets.example`) |
| **Cloud** | Nhost Dashboard → Secrets |

The `.secrets` file must be gitignored and never committed.

Do not create a `.env` file inside `functions/`. Nhost Functions does not load `.env` files in cloud deploys.

### Secret name mapping

Nhost injects auto-managed secrets under different names than the raw Dashboard values. `_lib/env.ts` handles all fallbacks.

| What you set in Dashboard / `.secrets` | What `_lib/env.ts` reads | Notes |
|---|---|---|
| `HASURA_GRAPHQL_ADMIN_SECRET` | `NHOST_ADMIN_SECRET` → fallback | Primary name auto-injected by Nhost |
| `HASURA_GRAPHQL_JWT_SECRET` | `NHOST_JWT_SECRET` → fallback | Arrives as JSON `{"key":"...","type":"HS256"}` — parse `.key` |
| `HASURA_GRAPHQL_ENDPOINT` | `NHOST_GRAPHQL_URL` | Preferred; fallback builds from subdomain + region |
| `NHOST_SUBDOMAIN`, `NHOST_REGION` | Auto-injected | Fallback only for GraphQL URL construction |

### Full secrets list

```bash
# Core (auto-injected by Nhost in cloud; required in .secrets for local CLI)
HASURA_GRAPHQL_ADMIN_SECRET=...
HASURA_GRAPHQL_JWT_SECRET=...       # plain key string — not the JSON wrapper

# CORS
DROPITI_CLIENT_ORIGIN=https://dropiti.com

# WhatsApp (v2)
WHATSAPP_PROVIDER=stub              # stub | meta | twilio
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
INVITATION_EXPIRY_DAYS=7

# Airwallex (v3) — server-only, never in any frontend .env
AIRWALLEX_API_KEY=
AIRWALLEX_CLIENT_ID=
AIRWALLEX_ENV=demo                  # demo | prod

# AWS S3 (v3) — moved from admin console frontend
S3_BUCKET_ACCESS_KEY=
S3_BUCKET_SECRET_KEY=
S3_BUCKET_DOMAIN_URL=https://tastyplates-bucket.s3.ap-northeast-2.amazonaws.com
S3_BUCKET_AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=tastyplates-bucket

# Upstash Redis (v3)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### ❌ Do NOT

- Read `process.env.*` anywhere except `_lib/env.ts`
- Create `.env` inside `functions/`
- Commit `.secrets`
- Use `NEXT_PUBLIC_*` env vars inside Functions
- Reference `process.env.HASURA_GRAPHQL_ADMIN_SECRET` directly in handlers — use `env.adminSecret`

---

## 7. Handler Contract

Every function file must export exactly one default async handler with this signature:

```ts
import type { Request, Response } from 'express'

export default async (req: Request, res: Response): Promise<void> => {
  // handler body
}
```

### Mandatory execution order for protected mutation routes

```
1. CORS preflight check (if PUT/PATCH/DELETE or cross-origin)
2. Auth verification (requireAuth or requireAdminRole)
3. Rate limit check (admin routes that are write-heavy or export routes)
4. Input validation (Zod schema on all POST/PUT/PATCH)
5. Business logic (hasuraQuery, S3, Airwallex, etc.)
6. Respond (ok() or fail())
```

### CORS preflight

Browsers send `OPTIONS` before `PUT`, `PATCH`, `DELETE`, and any request with an `Authorization` header from a different origin. Nhost does **not** handle preflight automatically — your handler must:

```ts
if (req.method === 'OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', env.clientOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  return res.status(204).end()
}
res.setHeader('Access-Control-Allow-Origin', env.clientOrigin)
```

For public routes (no credentials), `Access-Control-Allow-Origin: *` is acceptable.

### Logging standard

```ts
// Always include domain/action prefix and invocationId for Nhost log correlation
console.error(`[client/offers/create-offer] invocation=${req.invocationId}`, err)
```

### Constraints that apply to every handler

- `export default async` — not named, not `module.exports`
- Return type `Promise<void>` — write to `res`, never return a value
- All errors caught in `try/catch` — unhandled errors return a generic 500 with no detail
- Log before responding — so errors appear in logs even if client disconnects
- Never rethrow from inside a `catch` block in a handler
- GraphQL documents at module scope — never inside `hasuraQuery()` call
- Zod schemas at module scope — never inline inside `validate()` call

### Platform limits

| Limit | Value |
|---|---|
| Execution timeout (Starter plan) | 10 seconds |
| Execution timeout (Pro plan) | 180 seconds |
| Response payload hard cap | **6 MB** (all tiers) |
| Max items in bulk/batch operations | **20** |
| Default pagination limit | **20** |
| Maximum pagination limit | **100** |

### Banned native packages

These are stripped during Nhost's bundle step and will silently fail:

| Package | Alternative |
|---|---|
| `sharp` | Resize client-side, or use Nhost Run |
| `bcrypt` | Use `bcryptjs` (pure JS) |
| `better-sqlite3` | Use Hasura/PostgreSQL via `hasuraQuery()` |
| `canvas` | Not supported in Functions |

---

## 8. Dos and Do-Nots

### Handler signature

| ✅ Do | ❌ Do Not |
|---|---|
| `export default async (req: Request, res: Response): Promise<void> => { ... }` | `export const handler = async (event, context) => { return { statusCode, body } }` |
| Write to `res.status(200).json(...)` via `ok()` / `fail()` | Return an object from the handler |
| Use `export default` | Use `export function handler` or `export const handler` |
| TypeScript strict mode — fix the type | Add `// @ts-ignore` or cast to `any` |

### Routing and files

| ✅ Do | ❌ Do Not |
|---|---|
| Name files and directories in `kebab-case` | Use `PascalCase`, `camelCase`, or `snake_case` in file names |
| One `export default` per file | Put multiple handlers in one file |
| Place route files under `functions/client/` or `functions/admin/` | Create a `functions/v1/` directory |
| Keep `_lib/` for shared infra only | Put business logic inside `_lib/` files |

### Authentication

| ✅ Do | ❌ Do Not |
|---|---|
| Call `requireAuth(req, res)` first in every protected handler | Decode the JWT manually in a handler |
| Use `getUserId(payload)` to get the acting user | Trust `user_id` from the request body |
| Use `requireAdminRole(req, res)` for all admin routes | Check `x-admin-secret` header for admin auth |
| Return immediately after `if (!payload) return` | Continue executing after a failed auth check |

### Response and errors

| ✅ Do | ❌ Do Not |
|---|---|
| Use `ok(res, data)` and `fail(res, message, status)` | Write `res.json(...)` or `res.send(...)` directly |
| Return `{ ok: true, data: { items: [] } }` for empty results | Return `null`, `undefined`, or `{ data: null }` |
| Log with `console.error('[domain/action] invocation=...', err)` | Log raw stack traces or env values |
| Wrap handler body in `try/catch` | Let errors propagate unhandled |
| Use HTTP `500` for unexpected errors | Use `500` for known validation or auth failures |

### Hasura and data

| ✅ Do | ❌ Do Not |
|---|---|
| Define GraphQL documents at module scope | Inline GraphQL strings inside `hasuraQuery()` calls |
| Check `result.errors?.length` before using `result.data` | Access `result.data` without checking errors first |
| Use `hasuraQuery()` from `_lib/hasura.ts` | Open-code `fetch(HASURA_URL, ...)` in handlers |
| Treat Hasura as server-only | Expose admin secret or Hasura URL in any response |

### Environment and secrets

| ✅ Do | ❌ Do Not |
|---|---|
| Import all config from `_lib/env.ts` | Read `process.env.*` in handler files |
| Store secrets in repo-root `.secrets` for local dev | Create `functions/.env` |
| Add `.secrets` to `.gitignore` | Commit `.secrets` |
| Use `env.adminSecret` | Use `process.env.HASURA_GRAPHQL_ADMIN_SECRET` directly |
| Commit `functions/package-lock.json` with every dependency change | Commit `dist/` or built output |

---

## 9. Operational Routes

### `GET /v1/health`

Auth: **None**. No Bearer required.

Returns the runtime status. Call this first after every deploy to confirm the Function layer is healthy.

**Response:**
```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "node": "v22.x.x",
    "time": "2026-05-18T..."
  }
}
```

**Test:**
```bash
curl -sS "https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/health"
```

---

### `GET /v1/echo`

Auth: **Bearer required**.

Returns request metadata. Used to verify that JWT verification is working correctly.

**Response:**
```json
{
  "ok": true,
  "data": {
    "headers": { "authorization": "Bearer ..." },
    "query": {},
    "node": "v22.x.x",
    "invocationId": "..."
  }
}
```

**Test:**
```bash
curl -sS -H "Authorization: Bearer <ACCESS_TOKEN>" \
  "https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/echo"
```

---

## 10. Client Routes (`/v1/client/*`)

All routes require `Authorization: Bearer <nhost_access_token>` unless marked **Public** or **Optional**.

List endpoints return `{ ok: true, data: { items: [...], total: N, limit: N, offset: N } }`.

### Users

| Method | Path | Auth | Request |
|---|---|---|---|
| `POST` | `/v1/client/users/create-user` | Bearer | Body: `{ email, name, ... }` — `userId` from JWT |
| `GET` | `/v1/client/users/get-user-by-id` | Bearer | Query: `?id=` |
| `GET` | `/v1/client/users/get-user-by-uuid` | Bearer | Query: `?uuid=` |
| `PATCH` | `/v1/client/users/update-user` | Bearer | Body: profile fields — scoped to JWT user |

### Properties

| Method | Path | Auth | Request |
|---|---|---|---|
| `POST` | `/v1/client/properties/create-property` | Bearer | Body: property fields |
| `GET` | `/v1/client/properties/get-drafts` | Bearer | — Returns JWT user's drafts only |
| `DELETE` | `/v1/client/properties/delete-draft` | Bearer | Query: `?property_uuid=` — ownership checked |
| `POST` | `/v1/client/properties/publish-draft` | Bearer | Body: `{ propertyUuid }` |
| `GET` | `/v1/client/properties/get-listings` | Optional | Query: `?limit=&offset=` |
| `GET` | `/v1/client/properties/get-property` | Optional | Query: `?id=` |
| `GET` | `/v1/client/properties/get-property-by-uuid` | Optional | Query: `?uuid=` |
| `GET` | `/v1/client/properties/get-property-count-by-user` | Bearer | — Returns count for JWT user |
| `PATCH` | `/v1/client/properties/update-property` | Bearer | Body: fields — ownership checked |

### Offers

| Method | Path | Auth | Request |
|---|---|---|---|
| `POST` | `/v1/client/offers/create-offer` | Bearer | Body: `{ propertyUuid, amount, terms? }` — initiator from JWT |
| `GET` | `/v1/client/offers/get-offers` | Bearer | Query: `?limit=&offset=` |
| `GET` | `/v1/client/offers/get-offers-by-id` | Bearer | Query: `?offerId=` — access-checked |
| `GET` | `/v1/client/offers/get-offers-by-initiator` | Bearer | — JWT user's offers only |
| `POST` | `/v1/client/offers/accept-offer` | Bearer | Body: `{ offerId }` — landlord; ownership checked |
| `POST` | `/v1/client/offers/reject-offer` | Bearer | Body: `{ offerId }` — landlord |
| `POST` | `/v1/client/offers/counter-offer` | Bearer | Body: `{ offerId, amount, terms? }` |
| `POST` | `/v1/client/offers/withdraw-offer` | Bearer | Body: `{ offerId }` — tenant only |
| `GET` | `/v1/client/offers/get-negotiation-state` | Bearer | Query: `?offerId=` |
| `GET` | `/v1/client/offers/get-offer-actions` | Bearer | Query: `?offerId=` — role-aware |
| `GET` | `/v1/client/offers/get-review-opportunities` | Bearer | — Concluded offers eligible for review |

### Reviews

| Method | Path | Auth | Request |
|---|---|---|---|
| `POST` | `/v1/client/reviews/create-review` | Bearer | Body: `{ offerId, rating, comment }` |
| `PATCH` | `/v1/client/reviews/update-review` | Bearer | Body: `{ reviewId, rating?, comment? }` — own review |
| `DELETE` | `/v1/client/reviews/delete-review` | Bearer | Query: `?reviewId=` — own review |
| `GET` | `/v1/client/reviews/get-reviews-by-property` | Optional | Query: `?propertyUuid=` |
| `GET` | `/v1/client/reviews/get-reviews-by-user` | Optional | Query: `?userId=` |
| `POST` | `/v1/client/reviews/mark-helpful` | Bearer | Body: `{ reviewId }` — one vote per user |

### Tenants

| Method | Path | Auth | Request |
|---|---|---|---|
| `GET` | `/v1/client/tenants/index` | Bearer | — Tenants for JWT landlord's properties |
| `GET` | `/v1/client/tenants/profile` | Bearer | — JWT user's tenant profile |
| `PATCH` | `/v1/client/tenants/profile` | Bearer | Body: tenant profile fields |

### Transfer of Ownership (client-facing)

| Method | Path | Auth | Request |
|---|---|---|---|
| `GET` | `/v1/client/transfer-ownership/validate` | **Public** | Query: `?token=<uuid>` — auto-expires stale tokens |
| `POST` | `/v1/client/transfer-ownership/validate` | **Public** | Body: `{ token }` (legacy alias) |
| `POST` | `/v1/client/transfer-ownership/claim` | Bearer | Body: `{ token }` — new owner from JWT, not body |

### Chat

| Method | Path | Auth | Request |
|---|---|---|---|
| `POST` | `/v1/client/chat/get-or-create-room` | Bearer | Body: `{ otherUserId }` |
| `GET` | `/v1/client/chat/get-chat-rooms` | Bearer | — All rooms for JWT user |
| `GET` | `/v1/client/chat/get-room-messages` | Bearer | Query: `?roomId=&limit=&before=` |
| `POST` | `/v1/client/chat/send-message` | Bearer | Body: `{ roomId, content }` — sender from JWT |

### Notifications

| Method | Path | Auth | Request |
|---|---|---|---|
| `GET` | `/v1/client/notifications/index` | Bearer | — All for JWT user |
| `GET` | `/v1/client/notifications/unread-count` | Bearer | — Count for badge |
| `POST` | `/v1/client/notifications/mark-read` | Bearer | Body: `{ notificationId }` |
| `POST` | `/v1/client/notifications/mark-all-read` | Bearer | — Marks all for JWT user |
| `POST` | `/v1/client/notifications/archive` | Bearer | Body: `{ notificationId }` |

### Upload (client)

| Method | Path | Auth | Request | Returns |
|---|---|---|---|---|
| `POST` | `/v1/client/upload/presign` | Bearer | Body: `{ filename, mimeType }` | `{ uploadUrl, s3Key, publicUrl }` |

Client PUTs the file directly to `uploadUrl` (S3 presigned PUT). The Function never proxies file bytes.

---

## 11. Admin Routes (`/v1/admin/*`)

All admin routes require `requireAdminRole()`. Non-admin JWT → `403`. Missing/invalid JWT → `401`.

Airwallex proxy routes return `{ ok: true, data: { stub: true, items: [] } }` when `AIRWALLEX_API_KEY` is unset — safe for development.

### Transfer of Ownership (admin-side)

| Method | Path | Request | Notes |
|---|---|---|---|
| `POST` | `/v1/admin/transfer-ownership/invite` | Body: `{ propertyUuid, externalContact?, offerId?, skipWhatsApp? }` | Creates DB row; sends Meta template WhatsApp unless `skipWhatsApp: true` |
| `POST` | `/v1/admin/transfer-ownership/resend` | Body: `{ propertyUuid, externalContact?, skipWhatsApp? }` | Cancels old token, creates new; resends WhatsApp unless `skipWhatsApp: true` |
| `GET` | `/v1/admin/transfer-ownership/status` | Query: `?propertyUuid=` | Latest invitation; `data.invitationUrl` when `hasInvitation` (client app claim link) |
| `PUT` | `/v1/admin/transfer-ownership/transfer` | Body: `{ propertyUuid, newOwnerId }` | Direct reassignment without invite flow |

### Offers

| Method | Path | Request | Notes |
|---|---|---|---|
| `GET` | `/v1/admin/offers/incoming` | Query: `?status=&limit=&offset=&propertyUuid=` | Includes `whatsappOutreachUrl` when `external_contact` is set |
| `GET` | `/v1/admin/offers/incoming-detail` | Query: `?id=` | Single incoming offer detail |
| `GET` | `/v1/admin/offers/index` | Query: `?status=&limit=&offset=` | All platform offers |
| `GET` | `/v1/admin/offers/get-offer` | Query: `?offerId=` | Full offer + negotiation history |
| `GET` | `/v1/admin/offers/stalled` | Query: `?daysSinceLastActivity=` (default `3`) | Stalled negotiations |
| `POST` | `/v1/admin/offers/remind` | Body: `{ offerId, recipientType, message }` | |
| `POST` | `/v1/admin/offers/flag` | Body: `{ offerId, flagType, reason }` | |
| `POST` | `/v1/admin/offers/cancel` | Body: `{ offerId, reason }` | Admin override |

### Users

| Method | Path | Request | Notes |
|---|---|---|---|
| `GET` | `/v1/admin/users` | Query: `?search=&limit=&offset=&defaultRole=&excludeDefaultRole=` | Filter `user_profile.defaultRole` (`defaultRole=admin` → user-management; `defaultRole=user` → app-customers) |
| `GET` | `/v1/admin/users/get-user` | Query: `?userId=` | |
| `PUT` | `/v1/admin/users/update-user` | Body: user fields | |
| `POST` | `/v1/admin/users/verify-user` | Body: `{ userId, verificationType, status, notes }` | |
| `POST` | `/v1/admin/users/suspend-user` | Body: `{ userId, reason, duration }` | |
| `POST` | `/v1/admin/users/reactivate-user` | Body: `{ userId, notes }` | |
| `POST` | `/v1/admin/users/ban-user` | Body: `{ userId, reason, permanent }` | |
| `GET` | `/v1/admin/users/activity-log` | Query: `?userId=` | |
| `GET` | `/v1/admin/users/export-user-data` | Query: `?userId=` | GDPR export — 6 MB cap applies |
| `DELETE` | `/v1/admin/users/delete-user-data` | Body: `{ userId, confirmDeletion }` | GDPR deletion |
| `POST` | `/v1/admin/users/bulk` | Body: `{ action, userIds, params }` | Max 20 users |

### Properties

| Method | Path | Request | Notes |
|---|---|---|---|
| `GET` | `/v1/admin/properties/list` | Query: `?status=&landlordId=&search=&sortBy=&limit=&offset=` | `AdminListProperties` (v6 §8a). **BFF:** `GET admin/properties` → this path. |
| `GET` | `/v1/admin/properties/get-property` | Query: `?propertyUuid=` | |
| `PUT` | `/v1/admin/properties/update-property` | Body: `{ propertyUuid, updates, reason }` | |
| `GET` | `/v1/admin/properties/moderation-queue` | Query: `?limit=&offset=` | Pending review queue |
| `POST` | `/v1/admin/properties/create-property` | Body: create payload | **BFF:** `POST admin/properties` → this path |
| `POST` | `/v1/admin/properties/approve` | Body: `{ propertyUuid, notes? }` | |
| `POST` | `/v1/admin/properties/reject` | Body: `{ propertyUuid, reason }` | |
| `POST` | `/v1/admin/properties/flag` | Body: `{ propertyUuid, flagType, reason }` | |
| `POST` | `/v1/admin/properties/feature` | Body: `{ propertyUuid, featured, featureUntil? }` | |
| `POST` | `/v1/admin/properties/bulk` | Body: `{ action, propertyUuids }` | Max 20 |

### Media library

| Method | Path | Request | Notes |
|---|---|---|---|
| `GET` | `/v1/admin/media` | Query: `?limit=&offset=&search=` | Lists `real_estate_media_assets` (non-deleted). **File:** `functions/admin/media/index.ts`. **BFF:** `GET admin/media` → this path (no `/index` suffix). |

### Upload (admin — AWS S3 presigned PUT)

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/v1/admin/upload/presign` | `{ filename: string, mimeType: string }` | `{ uploadUrl, s3Key, publicUrl, fileId }` |
| `POST` | `/v1/admin/upload/batch` | `Array<{ filename, mimeType }>` max 20 | `Array<{ uploadUrl, s3Key, publicUrl, filename }>` |

`uploadUrl` is an S3 presigned PUT URL. Client PUTs the file directly to S3. The Function never proxies file bytes. S3 credentials are in `.secrets` only — never in the admin console frontend.

### Airwallex Proxy

All routes are server-side only. When `AIRWALLEX_API_KEY` is unset, routes return `{ ok: true, data: { stub: true } }`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/v1/admin/customers` | List Airwallex customers |
| `GET` | `/v1/admin/customers/get-customer?id=` | |
| `PUT` | `/v1/admin/customers/update-customer` | |
| `DELETE` | `/v1/admin/customers/delete-customer` | |
| `POST` | `/v1/admin/customers/client-secret` | Get payment client secret |
| `GET` | `/v1/admin/payment-intents` | |
| `GET` | `/v1/admin/payment-intents/get-intent?id=` | |
| `PUT` | `/v1/admin/payment-intents/update-intent` | |
| `POST` | `/v1/admin/payments/cancel` | Body: `{ paymentId }` |
| `POST` | `/v1/admin/payments/attach-method` | |
| `GET` | `/v1/admin/beneficiaries` | |
| `GET` | `/v1/admin/beneficiaries/get-beneficiary?id=` | |
| `PUT` | `/v1/admin/beneficiaries/update-beneficiary` | |
| `DELETE` | `/v1/admin/beneficiaries/delete-beneficiary` | |
| `GET` | `/v1/admin/transfers` | |
| `POST` | `/v1/admin/transfers/cancel` | Body: `{ transferId }` |

### Analytics, Settings, Reviews, Reports, Support, Audit

| Domain | Method | Paths |
|---|---|---|
| Analytics | `GET` | `/v1/admin/analytics/dashboard`, `users`, `properties`, `transactions`, `performance` |
| Analytics | `POST` | `/v1/admin/analytics/export` (async — returns job ID if >5 MB), `custom-report` |
| Settings | `GET` / `PUT` | `/v1/admin/settings/index`, `update`, `feature-flags`, `toggle-flag`, `email-templates`, `update-template` |
| Reviews | `GET` / `POST` / `PUT` / `DELETE` | `/v1/admin/reviews/moderation-queue`, `approve`, `reject`, `update-review`, `delete-review` |
| Reports | `GET` / `PUT` / `POST` | `/v1/admin/reports/index`, `update`, `resolve`, `summary` |
| Support tickets | `GET` / `POST` / `PUT` | `/v1/admin/support/tickets/index`, `get-ticket`, `create`, `update`, `reply`, `add-note`, `assign`, `close` |
| Support | `GET` | `/v1/admin/support/canned-responses` |
| Audit | `GET` | `/v1/admin/audit-logs/index`, `export`, `admin-activity` |

---

## 12. Pre-Push Verification

Run all five checks from inside `functions/` before every commit to `main`. Every check must return zero results.

```bash
# 1. TypeScript build — zero errors required
npm run build

# 2. Lambda pattern check — deploy blocker if any result found
grep -rn \
  "APIGatewayEvent\|LambdaContext\|statusCode.*body\|export const handler\|export function handler\|module\.exports" \
  --include="*.ts" .

# 3. Raw process.env check — only _lib/env.ts may read process.env
grep -rn "process\.env\." --include="*.ts" . | grep -v "_lib/env\.ts"

# 4. Direct res.json/res.send — must go through ok() / fail() only
grep -rn "res\.json\|res\.send\|res\.status" --include="*.ts" . | grep -v "_lib/respond\.ts"

# 5. Hardcoded secrets check
grep -rn "AKIA\|sk_live\|sk_test\|Bearer [A-Za-z0-9+/]" --include="*.ts" .
```

After deploy:

```bash
# Health check — must return { "ok": true }
curl -sS "https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/health"

# Auth check — must return 200 with a valid user token
curl -sS -H "Authorization: Bearer <USER_TOKEN>" \
  "https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/echo"

# Admin properties list — must return 200 with a valid admin token
curl -sS -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/admin/properties/list?limit=5"

# Admin auth check — must return 403 with a non-admin user token
curl -sS -H "Authorization: Bearer <USER_TOKEN>" \
  "https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/admin/users"
```

---

*api-doc v2.0 — May 2026. Sourced from `myeung-6ixtech/dropiti-nhost` main branch. v1.0 listed `GET /v1/admin/properties` for the list; v2.0 uses `GET /v1/admin/properties/list` and documents the BFF rewrite. Update when routes or `_lib/` contracts change.*