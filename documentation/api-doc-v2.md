# Dropiti Nhost — Backend API Reference

**Version:** 3.0 — June 2026
**Repo:** `myeung-6ixtech/dropiti-nhost` · branch `main`
**Sourced from:** `documentation/api-doc-v1.md` (v2.0 base) + Nhost Storage media upload unification

**Changes in 3.0 (from 2.0):**
- **Media upload completely rewritten.** Primary backend is now **Nhost Storage** (not S3 presign). Admin proxy upload (`POST /v1/admin/upload/image`) replaces the old `presign` flow for all files ≤ 10 MB.
- **`POST /v1/admin/upload/register` is rejected** when `MEDIA_STORAGE_BACKEND=nhost` — use the proxy path only.
- **`storage.files` ↔ `media_assets` relationship** documented explicitly.
- **mimeType repair** added: dedup hits opportunistically fix `storage.files.mime_type` when it was stored as `application/octet-stream` by older code.
- **Raw multipart body** replaces `FormData` for all Nhost Storage uploads to guarantee correct `Content-Type` propagation in Node.js 18.
- **New `_lib/` modules** documented: `media-storage.ts`, `nhost-storage.ts`, `media-assets.ts`, `media-url.ts`, `storage-paths.ts`, `upload-policy.ts`.
- **New environment variables** for Nhost Storage documented (`NHOST_STORAGE_URL`, `MEDIA_STORAGE_BUCKET`, `MEDIA_STORAGE_BACKEND`).

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
12. [Media Upload System](#12-media-upload-system)
13. [Pre-Push Verification](#13-pre-push-verification)

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

**Admin console (`dropiti-admin-console-2`):** the browser does not call this URL directly. It uses same-origin `GET|POST|… /api/v1/bff/functions/<path>`, which reads the httpOnly `nhost_access_token` cookie and proxies to `{NEXT_PUBLIC_FUNCTIONS_URL}/v1/<path>` with a Bearer header. **Media uploads bypass the BFF** — the admin console uses a dedicated same-origin proxy at `/api/v1/admin/upload/image` that forwards raw bytes + Bearer to the Functions upload handler. Implementation: `src/app/api/v1/bff/functions/[...path]/route.ts`, `src/lib/bff-route-rewrite.ts`, `src/lib/admin-api.ts`.

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
| `functions/admin/properties/list.ts` | `GET /v1/admin/properties/list` |
| `functions/admin/upload/image.ts` | `POST /v1/admin/upload/image` |
| `functions/admin/upload/batch.ts` | `POST /v1/admin/upload/batch` |
| `functions/admin/upload/register.ts` | `POST /v1/admin/upload/register` (**Nhost: rejected**) |
| `functions/admin/media/index.ts` | `GET /v1/admin/media` |

### Namespace summary

| Namespace | On-disk prefix | URL prefix | Used by |
|---|---|---|---|
| Ops | `functions/` (root) | `/v1/` | Internal health checks |
| Client | `functions/client/` | `/v1/client/` | `dropiti-v3` frontend |
| Admin | `functions/admin/` | `/v1/admin/` | `dropiti-admin-console-2` |

### ❌ Do NOT

- Create a `functions/v1/` directory — produces `/v1/v1/...`
- Call `/v1/admin/<domain>/index` for `index.ts` handlers — `functions/admin/users/index.ts` is served at **`GET /v1/admin/users`**
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

> **Cookies are not forwarded cross-origin.** The admin console and client app run on different origins from the Functions URL. They must send the Bearer header explicitly on every request. Exception: the admin console's own same-origin upload proxy (`/api/v1/admin/upload/image`) reads the `nhost_access_token` cookie from the request and forwards it as a Bearer header to the Nhost Function.

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
| **Admin Bearer** | All admin routes (including upload) | `requireAdminRole(req, res)` |

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
| `413` | File too large for proxy upload |
| `422` | Body present but Zod schema validation failed |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error |
| `502` | Upstream failure (Nhost Storage or Hasura catalog write) |

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

| `env` function | Source secret | Notes |
|---|---|---|
| `getHasuraAdminSecret()` | `NHOST_ADMIN_SECRET` → `HASURA_GRAPHQL_ADMIN_SECRET` | Used by `_lib/hasura.ts` and `_lib/nhost-storage.ts` |
| `getJwtSecretKey()` | `NHOST_JWT_SECRET` → `HASURA_GRAPHQL_JWT_SECRET` | Nhost wraps as JSON — `env.ts` parses `.key` |
| `getGraphqlUrl()` | `NHOST_GRAPHQL_URL` | Falls back to building from `NHOST_SUBDOMAIN`+`NHOST_REGION` |
| `getStorageBaseUrl()` | `NHOST_STORAGE_URL` | Falls back to `https://{sub}.storage.{region}.nhost.run/v1` |
| `getDefaultAdminMediaBucket()` | `MEDIA_STORAGE_BUCKET` | Defaults to `dropiti-bucket` |
| `getUploadBackend()` | `MEDIA_STORAGE_BACKEND` | `nhost` (default when configured) \| `s3` |
| `getClientOrigin()` | `DROPITI_CLIENT_ORIGIN` | CORS allowed origin; defaults to `*` in local dev |
| `getAirwallexApiKey()` | `AIRWALLEX_API_KEY` | Server-only — never in frontend |
| `getS3AccessKey()` | `S3_BUCKET_ACCESS_KEY` | AWS S3 credentials (fallback only) |
| `getS3BucketName()` | `S3_BUCKET_NAME` | AWS S3 bucket (fallback only) |
| `getUpstashRedisUrl()` | `UPSTASH_REDIS_REST_URL` | Rate limiting |

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
- Can query and mutate `storage.files` (Hasura tracks this table) for mimeType repair

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
fail(res, 'message', 502, errorDetails)  // 502 upstream error
```

### `_lib/validate.ts` — Zod schema validation

```ts
const MySchema = z.object({ name: z.string(), count: z.number().int().positive() })

const body = validateBody(req, res, MySchema)
if (!body) return   // 422 already sent with Zod error details
```

### `_lib/upload-policy.ts` — upload constraints

Centralises all upload limits. **Never hardcode these values in handlers.**

| Export | Value | Meaning |
|---|---|---|
| `PROXY_UPLOAD_MAX_BYTES_NHOST` | 10 MB | Max file size for proxy upload to Nhost Storage |
| `PROXY_UPLOAD_MAX_BYTES_S3` | 5 MB | Max file size for proxy upload to S3 |
| `DIRECT_PRESIGN_MAX_BYTES` | 10 MB | Max file size for direct S3 presigned PUT |
| `MAX_BATCH_UPLOAD_FILES` | 20 | Max files per batch slot request |
| `IMAGE_MAX_WIDTH` / `IMAGE_MAX_HEIGHT` | 1600 px | Client-side resize hints |
| `IMAGE_WEBP_QUALITY` | 75 | Client-side WebP quality hint |
| `ALLOWED_UPLOAD_MIME` | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, `video/mp4` | Allowed MIME types |
| `isAllowedMime(mimeType)` | — | Guard used in `image.ts` handler |

### `_lib/storage-paths.ts` — content-addressable path builder

```ts
// Builds the canonical object path used in storage.files.name and media_assets.s3_key
buildHashStorageKey(sha256, mimeType)
// → "uploads/by-hash/{sha256}.{ext}"

extensionFromMime(mimeType)
// "image/jpeg" → "jpeg"  |  "image/webp" → "webp"
```

### `_lib/media-url.ts` — URL classification (Functions-side)

```ts
isNhostStoragePublicUrl(url)  // true for https://{sub}.storage.*.nhost.run/v1/files/{uuid}
isLegacyS3MediaUrl(url)        // true for old S3/Lightsail public-read URLs
```

### `_lib/nhost-storage.ts` — Nhost Storage interactions

Core interface to Nhost's `hasura-storage` service. **Never call the Storage API directly from a handler — always go through these functions.**

| Export | Purpose |
|---|---|
| `postMultipartToNhostStorage(input)` | Upload raw bytes to `POST /v1/files` via manual raw multipart body (guarantees correct `Content-Type`) |
| `nhostStorageFileExists(fileId)` | `HEAD`/`GET` check whether a UUID is in `storage.files` |
| `repairStorageFileMimeType(fileId, correctMimeType)` | Updates `storage.files.mime_type` via Hasura when it is `application/octet-stream` |
| `findExistingMediaBySha256(sha256)` | Queries `real_estate_media_assets` for existing Hasura row by content hash |
| `parseStorageFileIdFromPublicUrl(url)` | Extracts UUID from a Nhost `public_url` string |
| `createNhostBatchSlot(input)` | Creates a proxy-upload slot descriptor (no actual upload) |
| `downloadNhostStorageFile(input)` | Server-side download (admin secret or Bearer) |

**Raw multipart body:** `postMultipartToNhostStorage` constructs the multipart request body as raw `Buffer` bytes instead of using the `FormData` API. This is required because Node.js 18's undici-backed `FormData` does not reliably forward `Blob.type` as the part's `Content-Type`, causing hasura-storage to store `application/octet-stream`. The raw implementation writes `Content-Type: image/jpeg` (or `webp`, `png`, etc.) literally in the wire bytes.

### `_lib/media-assets.ts` — Hasura catalog operations

Wraps all GraphQL mutations on `real_estate_media_assets`. **Never write GraphQL mutations for this table outside this module.**

| Export | Purpose |
|---|---|
| `insertMediaAsset(input)` | Insert a new catalog row (new content) |
| `updateMediaAsset(id, input)` | Update existing row (repair / migrate) |
| `persistMediaCatalog(existingId, input)` | Upsert: update if `existingId`, else insert. Throws on failure — **no success response without catalog write.** |

### `_lib/media-storage.ts` — upload orchestration

The single entry point for all server-side uploads. Handlers call **only** `uploadMediaFile()`.

```ts
const result = await uploadMediaFile({
  body,        // Buffer — raw file bytes
  filename,    // original filename (e.g. "photo.jpg")
  mimeType,    // "image/jpeg" | "image/webp" | ...
  sha256,      // optional pre-computed SHA256
  sizeBytes,   // file byte length
  width,       // optional image width hint
  height,      // optional image height hint
})
```

Returns `MediaUploadResult` — see [§12 Media Upload System](#12-media-upload-system).

### `_lib/s3.ts` — AWS S3 presigned URLs

Generates S3 presigned PUT URLs. Used by the S3 fallback upload path only. Never proxies file bytes through the Function.

### `_lib/airwallex.ts` — Airwallex API client

Server-side Airwallex proxy. Returns `{ stub: true, data: [] }` when `AIRWALLEX_API_KEY` is not set — safe for local development without live credentials.

### `_lib/ratelimit.ts` — Upstash rate limiter

```ts
const allowed = await isAllowed(`upload:image:${adminId}`, 30, 60)
if (!allowed) return fail(res, 'Rate limit exceeded', 429)
```

Keys are per-user, not global. Pattern: `{category}:{action}:{userId}`.

### `_lib/whatsapp.ts` — WhatsApp service

Provider-agnostic. Set `WHATSAPP_PROVIDER=stub` for local dev (logs to console).

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

| What you set in Dashboard / `.secrets` | What `_lib/env.ts` reads | Notes |
|---|---|---|
| `HASURA_GRAPHQL_ADMIN_SECRET` | `NHOST_ADMIN_SECRET` → fallback | Primary name auto-injected by Nhost |
| `HASURA_GRAPHQL_JWT_SECRET` | `NHOST_JWT_SECRET` → fallback | Arrives as JSON `{"key":"...","type":"HS256"}` — parse `.key` |
| `HASURA_GRAPHQL_ENDPOINT` | `NHOST_GRAPHQL_URL` | Preferred; fallback builds from subdomain + region |
| `NHOST_SUBDOMAIN`, `NHOST_REGION` | Auto-injected | Used for Storage URL + GraphQL URL construction |

### Custom secrets → Functions (`[[global.environment]]`)

Dashboard / `.secrets` values are **not** automatically available as `process.env` in Functions unless mapped in `nhost/nhost.toml`. All media + S3 keys are wired there. After adding or changing Dashboard secrets, **redeploy Functions**.

### Full secrets list

```bash
# Core (auto-injected by Nhost in cloud; required in .secrets for local CLI)
HASURA_GRAPHQL_ADMIN_SECRET=...
HASURA_GRAPHQL_JWT_SECRET=...       # plain key string — not the JSON wrapper

# CORS
DROPITI_CLIENT_ORIGIN=https://dropiti.com

# WhatsApp
WHATSAPP_PROVIDER=stub              # stub | meta | twilio
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
INVITATION_EXPIRY_DAYS=7

# Airwallex (server-only, never in any frontend .env)
AIRWALLEX_API_KEY=
AIRWALLEX_CLIENT_ID=
AIRWALLEX_ENV=demo                  # demo | prod

# Nhost Storage (primary media backend — v3.0)
NHOST_SUBDOMAIN=fcuycyemqprjrkbshlcj      # auto-injected; also used for Storage URL
NHOST_REGION=ap-southeast-1               # auto-injected
MEDIA_STORAGE_BUCKET=dropiti-bucket       # Nhost Storage bucket id
MEDIA_STORAGE_BACKEND=nhost               # optional force: nhost | s3

# AWS S3 / Lightsail (fallback only — not used when Nhost Storage is configured)
S3_BUCKET_ACCESS_KEY=
S3_BUCKET_SECRET_KEY=
S3_BUCKET_DOMAIN_URL=https://tastyplates-bucket.s3.ap-northeast-2.amazonaws.com
S3_BUCKET_AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=tastyplates-bucket

# Upstash Redis (rate limiting)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### ❌ Do NOT

- Read `process.env.*` anywhere except `_lib/env.ts`
- Create `.env` inside `functions/`
- Commit `.secrets`
- Use `NEXT_PUBLIC_*` env vars inside Functions
- Reference `process.env.HASURA_GRAPHQL_ADMIN_SECRET` directly in handlers

---

## 7. Handler Contract

Every function file must export exactly one default async handler:

```ts
import type { Request, Response } from 'express'

export default async function handlerName(req: Request, res: Response): Promise<void> {
  // handler body
}
```

### Mandatory execution order for protected mutation routes

```
1. Method guard (if not POST/PUT, return fail 405)
2. Auth verification (requireAuth or requireAdminRole)
3. Rate limit check (write-heavy or export routes)
4. Input validation (Zod schema on all POST/PUT/PATCH, or header parsing for binary uploads)
5. Business logic (uploadMediaFile, hasuraQuery, S3, Airwallex, etc.)
6. Respond (ok() or fail())
```

### CORS preflight

Browsers send `OPTIONS` before `PUT`, `PATCH`, `DELETE`, and any request with an `Authorization` header from a different origin. Nhost does **not** handle preflight automatically — your handler must respond to `OPTIONS` with the correct headers.

### Platform limits

| Limit | Value |
|---|---|
| Execution timeout (Starter plan) | 10 seconds |
| Execution timeout (Pro plan) | 180 seconds |
| Response payload hard cap | **6 MB** (all tiers) |
| Max items in bulk/batch operations | **20** |
| Default pagination limit | **20** |
| Maximum pagination limit | **100** |
| Proxy upload cap (Nhost Storage) | **10 MB** |
| Proxy upload cap (S3 fallback) | **5 MB** |

### Banned native packages

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
| `export default async function name(req, res): Promise<void>` | `export const handler = async (event, context) => { return { statusCode } }` |
| Write to `res` via `ok()` / `fail()` | Return an object from the handler |
| TypeScript strict mode — fix the type | Add `// @ts-ignore` or cast to `any` |

### Media upload

| ✅ Do | ❌ Do Not |
|---|---|
| Call `uploadMediaFile()` from `_lib/media-storage.ts` for all uploads | Call `postMultipartToNhostStorage` directly from a handler |
| Use `persistMediaCatalog()` for Hasura writes (insert/update in one call) | Write to `real_estate_media_assets` with ad-hoc mutations in handlers |
| Use `repairStorageFileMimeType()` to fix `application/octet-stream` rows | Manually call `hasuraQuery` for `update_storage_files_by_pk` in handlers |
| Use `ALLOWED_UPLOAD_MIME` + `isAllowedMime()` from `upload-policy.ts` | Hardcode allowed MIME types in handlers |
| Use `getProxyUploadMaxBytes()` for the size cap | Hardcode 10 MB or 5 MB in handlers |

### Authentication

| ✅ Do | ❌ Do Not |
|---|---|
| Call `requireAdminRole(req, res)` first in every admin handler | Decode the JWT manually |
| Use `getUserId(payload)` to get the acting user | Trust `user_id` from the request body |

### Response and errors

| ✅ Do | ❌ Do Not |
|---|---|
| Use `ok(res, data)` and `fail(res, message, status)` | Write `res.json(...)` or `res.send(...)` directly |
| Return `502` for upstream failures (Storage/Hasura) | Return `500` for upstream failures |
| Log with `console.error('[domain/action]', err)` | Log raw stack traces or env values |

### Hasura and data

| ✅ Do | ❌ Do Not |
|---|---|
| Define GraphQL documents at module scope | Inline GraphQL strings inside `hasuraQuery()` calls |
| Check `result.errors?.length` before using `result.data` | Access `result.data` without checking errors |
| Use `hasuraQuery()` from `_lib/hasura.ts` | Open-code `fetch(HASURA_URL, ...)` in handlers |

---

## 9. Operational Routes

### `GET /v1/health`

Auth: **None**.

```json
{ "ok": true, "data": { "status": "ok", "node": "v22.x.x", "time": "2026-06-03T..." } }
```

### `GET /v1/echo`

Auth: **Bearer required**. Returns request metadata. Used to verify JWT verification is working.

---

## 10. Client Routes (`/v1/client/*`)

All routes require `Authorization: Bearer <nhost_access_token>` unless marked **Public** or **Optional**.

### Users

| Method | Path | Auth | Request |
|---|---|---|---|
| `POST` | `/v1/client/users/create-user` | Bearer | Body: `{ email, name, ... }` — `userId` from JWT |
| `GET` | `/v1/client/users/get-user-by-id` | Optional† / Bearer‡ | Query: `?nhost_user_id=<uuid>` or `?id=<int>` |
| `GET` | `/v1/client/users/get-user-by-uuid` | — | **Deprecated (410)** — use `get-user-by-id?nhost_user_id=` |

† `?nhost_user_id=` — `optionalAuth`; public `/user/[id]` profiles.  
‡ `?id=` (numeric PK) — `requireAuth`; admin/internal only.
| `PATCH` | `/v1/client/users/update-user` | Bearer | Body: profile fields — scoped to JWT user |

#### `GET /v1/client/users/get-user-by-id` — query params

| Param | Type | Description |
|-------|------|-------------|
| `nhost_user_id` | UUID string | Nhost auth user id (`auth.users.id`). JWT `x-hasura-user-id` must equal this value. **Preferred for post-login profile load.** |
| `id` | Integer | Hasura numeric PK on `real_estate_user`. Kept for admin/legacy use. |

#### Response fields (`get-user-by-id`)

Both endpoints return the full `real_estate_user` row inside `{ ok: true, data: <row> }`:

```
uuid, nhost_user_id, display_name, first_name, last_name, email,
photo_url, auth_provider, phone_number, location, about, education,
occupation, marital_status, languages, verified, rating, review_count,
response_rate, response_time, avg_response_time, total_properties,
total_guests, onboarding_complete, preferences, notification_settings,
privacy_settings, created_at, updated_at
```

### Properties

| Method | Path | Auth | Request |
|---|---|---|---|
| `POST` | `/v1/client/properties/create-property` | Bearer | Body: property fields |
| `GET` | `/v1/client/properties/get-drafts` | Bearer | JWT user's drafts only |
| `DELETE` | `/v1/client/properties/delete-draft` | Bearer | Query: `?property_uuid=` — ownership checked |
| `POST` | `/v1/client/properties/publish-draft` | Bearer | Body: `{ propertyUuid }` |
| `GET` | `/v1/client/properties/get-listings` | Optional | Query: `?limit=&offset=&minPrice=&maxPrice=&bedrooms=&type=&landlord_user_id=` (`bedrooms` → `num_bedroom` _gte) |
| `GET` | `/v1/client/properties/get-property` | Optional | Query: `?id=` |
| `GET` | `/v1/client/properties/get-property-by-uuid` | Optional | Query: `?uuid=` (alias `property_uuid`); returns `{ property, landlord }` |
| `PATCH` | `/v1/client/properties/update-property` | Bearer | Body: fields — ownership checked |

### Offers

| Method | Path | Auth | Request |
|---|---|---|---|
| `POST` | `/v1/client/offers/create-offer` | Bearer | Body: `{ propertyUuid, amount, terms? }` |
| `GET` | `/v1/client/offers/get-offers` | Bearer | Query: `?limit=&offset=` |
| `POST` | `/v1/client/offers/accept-offer` | Bearer | Body: `{ offerId }` — landlord |
| `POST` | `/v1/client/offers/reject-offer` | Bearer | Body: `{ offerId }` |
| `POST` | `/v1/client/offers/counter-offer` | Bearer | Body: `{ offerId, amount, terms? }` |
| `POST` | `/v1/client/offers/withdraw-offer` | Bearer | Body: `{ offerId }` — tenant only |
| `GET` | `/v1/client/offers/get-negotiation-state` | Bearer | Query: `?offerId=` |

### Reviews

| Method | Path | Auth | Request |
|---|---|---|---|
| `POST` | `/v1/client/reviews/create-review` | Bearer | Body: `{ offerId, rating, comment }` |
| `PATCH` | `/v1/client/reviews/update-review` | Bearer | Body: `{ reviewId, rating?, comment? }` — own review |
| `DELETE` | `/v1/client/reviews/delete-review` | Bearer | Query: `?reviewId=` — own review |
| `GET` | `/v1/client/reviews/get-reviews-by-property` | Optional | Query: `?propertyUuid=` |
| `GET` | `/v1/client/reviews/get-reviews-by-user` | Optional | Query: `?userId=` |

### Tenants

| Method | Path | Auth | Request |
|---|---|---|---|
| `GET` | `/v1/client/tenants` | Optional | Query: `?limit=&offset=&status=` (default `active`), `budget_min`, `budget_max`, `location`, `move_in_date`, `property_type` — marketplace feed; returns `{ items, pagination }` with embedded `user` |
| `GET` | `/v1/client/tenants/profile` | Optional / Bearer | Query: `?nhost_user_id=<uuid>` (public **active** profiles) or omit param (JWT user's own profile, any status) |
| `POST` | `/v1/client/tenants/profile` | Bearer | Body: tenant profile fields; optional `user_nhost_user_id` (must match JWT) — insert or update |
| `PATCH` | `/v1/client/tenants/profile` | Bearer | Body: partial tenant profile fields — JWT user only |

`real_estate_tenant_profile.user_id` is the Nhost auth user id (`auth.users.id`).

#### `GET /v1/client/tenants/profile` — query params

| Param | Type | Description |
|-------|------|-------------|
| `nhost_user_id` | UUID | Lookup by `user_id`. Anonymous may read **active** listings only; draft/inactive require JWT owner. |
| *(none)* | — | Requires Bearer; returns the authenticated user's profile. |

Each tenant profile row includes a nested **`user`** object (Hasura relationship → `auth.users`):

```json
{
  "user": {
    "id": "<uuid>",
    "email": "user@example.com",
    "avatarUrl": "https://..."
  }
}
```

`user.id` matches `real_estate_tenant_profile.user_id` (Nhost auth user id).

### Transfer of Ownership (client-facing)

| Method | Path | Auth | Request |
|---|---|---|---|
| `GET` | `/v1/client/transfer-ownership/validate` | **Public** | Query: `?token=<uuid>` |
| `POST` | `/v1/client/transfer-ownership/claim` | Bearer | Body: `{ token }` — new owner from JWT |

### Chat

| Method | Path | Auth | Request |
|---|---|---|---|
| `POST` | `/v1/client/chat/get-or-create-room` | Bearer | Body: `{ otherUserId }` |
| `GET` | `/v1/client/chat/get-chat-rooms` | Bearer | All rooms for JWT user |
| `GET` | `/v1/client/chat/get-room-messages` | Bearer | Query: `?roomId=&limit=&before=` |
| `POST` | `/v1/client/chat/send-message` | Bearer | Body: `{ roomId, content }` |

### Notifications

| Method | Path | Auth | Request |
|---|---|---|---|
| `GET` | `/v1/client/notifications/index` | Bearer | All for JWT user |
| `GET` | `/v1/client/notifications/unread-count` | Bearer | Count for badge |
| `POST` | `/v1/client/notifications/mark-read` | Bearer | Body: `{ notificationId }` |
| `POST` | `/v1/client/notifications/mark-all-read` | Bearer | All for JWT user |

### Upload (client)

| Method | Path | Auth | Request | Returns |
|---|---|---|---|---|
| `POST` | `/v1/client/upload/presign` | Bearer | Body: `{ filename, mimeType }` | `{ uploadUrl, s3Key, publicUrl }` |

Client PUTs the file directly to `uploadUrl` (S3 presigned PUT). The Function never proxies file bytes.

---

## 11. Admin Routes (`/v1/admin/*`)

All admin routes require `requireAdminRole()`. Non-admin JWT → `403`. Missing/invalid JWT → `401`.

### Transfer of Ownership (admin-side)

| Method | Path | Request | Notes |
|---|---|---|---|
| `POST` | `/v1/admin/transfer-ownership/invite` | Body: `{ propertyUuid, externalContact?, offerId?, skipWhatsApp? }` | Creates DB row; sends WhatsApp unless `skipWhatsApp: true` |
| `POST` | `/v1/admin/transfer-ownership/resend` | Body: `{ propertyUuid, externalContact?, skipWhatsApp? }` | Cancels old token, creates new |
| `GET` | `/v1/admin/transfer-ownership/status` | Query: `?propertyUuid=` | Latest invitation |
| `PUT` | `/v1/admin/transfer-ownership/transfer` | Body: `{ propertyUuid, newOwnerId }` | Direct reassignment |

### Offers

| Method | Path | Request | Notes |
|---|---|---|---|
| `GET` | `/v1/admin/offers/incoming` | Query: `?status=&limit=&offset=&propertyUuid=` | |
| `GET` | `/v1/admin/offers/incoming-detail` | Query: `?id=` | |
| `GET` | `/v1/admin/offers/index` | Query: `?status=&limit=&offset=` | |
| `GET` | `/v1/admin/offers/get-offer` | Query: `?offerId=` | Full offer + negotiation history |
| `POST` | `/v1/admin/offers/remind` | Body: `{ offerId, recipientType, message }` | |
| `POST` | `/v1/admin/offers/flag` | Body: `{ offerId, flagType, reason }` | |
| `POST` | `/v1/admin/offers/cancel` | Body: `{ offerId, reason }` | Admin override |

### Users

| Method | Path | Request | Notes |
|---|---|---|---|
| `GET` | `/v1/admin/users` | Query: `?search=&limit=&offset=&defaultRole=` | |
| `GET` | `/v1/admin/users/get-user` | Query: `?userId=` | |
| `PUT` | `/v1/admin/users/update-user` | Body: user fields | |
| `POST` | `/v1/admin/users/verify-user` | Body: `{ userId, verificationType, status, notes }` | |
| `POST` | `/v1/admin/users/suspend-user` | Body: `{ userId, reason, duration }` | |
| `POST` | `/v1/admin/users/reactivate-user` | Body: `{ userId, notes }` | |
| `POST` | `/v1/admin/users/ban-user` | Body: `{ userId, reason, permanent }` | |
| `GET` | `/v1/admin/users/activity-log` | Query: `?userId=` | |
| `DELETE` | `/v1/admin/users/delete-user-data` | Body: `{ userId, confirmDeletion }` | GDPR deletion |
| `POST` | `/v1/admin/users/bulk` | Body: `{ action, userIds, params }` | Max 20 users |

### Properties

| Method | Path | Request | Notes |
|---|---|---|---|
| `GET` | `/v1/admin/properties/list` | Query: `?status=&landlordId=&search=&sortBy=&limit=&offset=` | **BFF:** `GET admin/properties` → this path |
| `GET` | `/v1/admin/properties/get-property` | Query: `?propertyUuid=` | |
| `PUT` | `/v1/admin/properties/update-property` | Body: `{ propertyUuid, updates, reason }` | |
| `GET` | `/v1/admin/properties/moderation-queue` | Query: `?limit=&offset=` | |
| `POST` | `/v1/admin/properties/create-property` | Body: create payload | |
| `POST` | `/v1/admin/properties/approve` | Body: `{ propertyUuid, notes? }` | |
| `POST` | `/v1/admin/properties/reject` | Body: `{ propertyUuid, reason }` | |
| `POST` | `/v1/admin/properties/bulk` | Body: `{ action, propertyUuids }` | Max 20 |

### Media library

| Method | Path | Request | Notes |
|---|---|---|---|
| `GET` | `/v1/admin/media` | Query: `?limit=&offset=&search=` | Lists `real_estate_media_assets` (non-deleted). **File:** `functions/admin/media/index.ts`. |

### Upload (admin — Nhost Storage proxy, v3.0)

> **Breaking change from v2.0:** The `presign` → browser PUT flow is replaced by the proxy upload flow for all files ≤ 10 MB. The `register` endpoint is rejected when the backend is Nhost.

| Method | Path | Body / Headers | Returns | Notes |
|---|---|---|---|---|
| `POST` | `/v1/admin/upload/image` | Raw bytes. Headers: `Content-Type`, `X-Filename`, optional `X-Width`, `X-Height`, `X-Sha256` | See response envelope below | **Primary upload path (Nhost).** Never call directly from browser — use the admin console's same-origin proxy `/api/v1/admin/upload/image`. |
| `POST` | `/v1/admin/upload/batch` | Body: `Array<{ filename, mimeType, sha256 }>` max 20 | `Array<BatchUploadSlot>` | Returns proxy hint slots (`useProxy: true`) for Nhost; presigned PUT slots for S3 |
| `POST` | `/v1/admin/upload/register` | Body: `{ s3Key, publicUrl, filename, mimeType, sizeBytes, sha256?, etag?, width?, height? }` | `{ publicUrl, s3Key, fileId, mediaId }` | **Nhost backend: returns 400.** S3 fallback only. Validates that a Nhost-shaped `publicUrl` references an existing `storage.files` entry. |

**Upload response (`POST /v1/admin/upload/image`):**

```json
{
  "ok": true,
  "data": {
    "filename": "photo.jpeg",
    "publicUrl": "https://fcuycyemqprjrkbshlcj.storage.ap-southeast-1.nhost.run/v1/files/{uuid}",
    "s3Key": "uploads/by-hash/{sha256}.jpeg",
    "fileId": "{uuid}",
    "storageFileId": "{uuid}",
    "sha256": "3ebbc368...",
    "mediaId": "{media-asset-uuid}",
    "deduped": false,
    "repaired": false,
    "migrated": false,
    "storageBackend": "nhost",
    "imageHints": {
      "maxWidth": 1600,
      "maxHeight": 1600,
      "webpQuality": 75
    }
  }
}
```

| Flag | Meaning for admin console |
|---|---|
| `deduped: true` | Same SHA256; `storage.files` entry verified; `media_assets` row reused. Show "Already uploaded" toast. |
| `repaired: true` | Row existed (Nhost URL) but `storage.files` entry was missing; re-uploaded + updated row. Show "Repaired" toast. |
| `migrated: true` | Row had legacy S3 `public_url`; uploaded to Nhost + updated row. Show "Migrated to Nhost" toast. |

Admin client parses these flags via `formatUploadResultMessage()` in `src/lib/admin-api.ts`.

### Airwallex Proxy

All routes are server-side only. When `AIRWALLEX_API_KEY` is unset, routes return `{ ok: true, data: { stub: true } }`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/v1/admin/customers` | List Airwallex customers |
| `POST` | `/v1/admin/customers/client-secret` | Get payment client secret |
| `GET` | `/v1/admin/payment-intents` | |
| `POST` | `/v1/admin/payments/cancel` | Body: `{ paymentId }` |
| `GET` | `/v1/admin/transfers` | |
| `POST` | `/v1/admin/transfers/cancel` | Body: `{ transferId }` |

### Analytics, Settings, Reviews, Reports, Support, Audit

| Domain | Method | Paths |
|---|---|---|
| Analytics | `GET` | `/v1/admin/analytics/dashboard`, `users`, `properties`, `transactions`, `performance` |
| Analytics | `POST` | `/v1/admin/analytics/export`, `custom-report` |
| Settings | `GET` / `PUT` | `/v1/admin/settings/index`, `update`, `feature-flags`, `toggle-flag` |
| Reviews | `GET` / `POST` | `/v1/admin/reviews/moderation-queue`, `approve`, `reject`, `delete-review` |
| Reports | `GET` / `PUT` / `POST` | `/v1/admin/reports/index`, `update`, `resolve`, `summary` |
| Support tickets | `GET` / `POST` / `PUT` | `/v1/admin/support/tickets/index`, `get-ticket`, `create`, `update`, `reply`, `close` |
| Audit | `GET` | `/v1/admin/audit-logs/index`, `export`, `admin-activity` |

---

## 12. Media Upload System

This section is the authoritative specification for all media asset handling. Cross-reference: `dropiti-admin-console-2/documentation/media-upload.md` for the frontend contract.

### Data model

#### `real_estate_media_assets` (Hasura)

| Column | Type | Meaning |
|---|---|---|
| `id` | `uuid` | Primary key |
| `public_url` | `text` | Canonical URL — Nhost: `https://{sub}.storage.{region}.nhost.run/v1/files/{uuid}` |
| `s3_key` | `text` | Logical path: `uploads/by-hash/{sha256}.{ext}` — **not** a browser URL for Nhost rows |
| `s3_bucket` | `text` | Nhost bucket id (`dropiti-bucket`) or S3 bucket name |
| `sha256` | `text` | Content hash — deduplication key |
| `content_type` | `text` | MIME type (`image/jpeg`, `image/webp`, etc.) |
| `size_bytes` | `int` | File size |
| `width` / `height` | `int` | Optional image dimensions |
| `original_filename` | `text` | Original upload filename |
| `etag` | `text` | Storage etag |
| `deleted_at` | `timestamptz` | Soft delete — null = active |

#### `storage.files` (Nhost managed, Hasura-tracked)

| Column | Meaning |
|---|---|
| `id` | UUID — **this is the file identifier embedded in `public_url`** |
| `name` | Logical path = same value as `real_estate_media_assets.s3_key` |
| `mime_type` | MIME type stored by hasura-storage — must be `image/jpeg` (not `application/octet-stream`) |
| `size` | Bytes |
| `etag` | Content hash from storage |
| `bucket_id` | Nhost bucket (`dropiti-bucket`) |
| `is_uploaded` | `true` when the upload is complete |

#### Relationship between the two tables

The link is implicit via the UUID in `public_url`:

```
real_estate_media_assets.public_url
  = "https://{sub}.storage.{region}.nhost.run/v1/files/{uuid}"
                                                               ↑
                                                    storage.files.id
```

There is no explicit foreign key. The UUID can be extracted with `parseStorageFileIdFromPublicUrl(publicUrl)` from `_lib/nhost-storage.ts`. Hasura does not define a relationship between these two tables — the admin console navigates via the extracted UUID.

**Invariant:** every active `real_estate_media_assets` row with a Nhost `public_url` must have the UUID present in `storage.files` with `is_uploaded = true`.

### Storage backends

| Backend | Bucket env var | When active |
|---|---|---|
| **Nhost Storage** (default) | `MEDIA_STORAGE_BUCKET` → `dropiti-bucket` | `NHOST_SUBDOMAIN` + `NHOST_REGION` configured, OR `MEDIA_STORAGE_BACKEND=nhost` |
| **S3 / Lightsail** (fallback) | `S3_BUCKET_NAME` | `MEDIA_STORAGE_BACKEND=s3`, or Nhost Storage not configured |

### Upload flow (Nhost — primary)

```
Browser
  → POST /api/v1/admin/upload/image        (admin console same-origin proxy)
      ↓  reads nhost_access_token cookie
      ↓  forwards raw bytes + Bearer JWT + X-Filename + X-Sha256 headers
  → POST /v1/admin/upload/image            (Nhost Function)
      ↓  requireAdminRole
      ↓  uploadMediaFile()
          ├─ SHA256 exists in real_estate_media_assets?
          │   ├─ YES → nhostStorageFileExists(uuid)?
          │   │   ├─ YES → repairStorageFileMimeType() [fire-and-forget]
          │   │   │         → return { deduped: true }
          │   │   └─ NO  → postMultipartToNhostStorage()
          │   │              → persistMediaCatalog(existingId, …)  [UPDATE]
          │   │              → return { repaired: true } or { migrated: true }
          │   └─ NO  → postMultipartToNhostStorage()
          │              → persistMediaCatalog(undefined, …)        [INSERT]
          │              → return { deduped: false, repaired: false }
      ↓  ok(res, { publicUrl, s3Key, fileId, sha256, mediaId, flags … })
```

**Key invariant:** `postMultipartToNhostStorage` always runs BEFORE `persistMediaCatalog`. A failure in Storage throws and prevents the Hasura write — no catalog entry without a corresponding storage object.

### Why raw multipart (not FormData)

`postMultipartToNhostStorage` constructs the HTTP body as raw `Buffer` bytes:

```
--DropitiBoundary{sha256-nonce}
Content-Disposition: form-data; name="bucket-id"

dropiti-bucket
--DropitiBoundary{sha256-nonce}
Content-Disposition: form-data; name="metadata[]"

{"name":"uploads/by-hash/{sha256}.jpeg","metadata":{"sha256":"...","originalFilename":"..."}}
--DropitiBoundary{sha256-nonce}
Content-Disposition: form-data; name="file[]"; filename="photo.jpeg"
Content-Type: image/jpeg          ← written as literal wire bytes

<binary file data>
--DropitiBoundary{sha256-nonce}--
```

Using the `FormData` API in Node.js 18 (undici) does not reliably forward `Blob.type` as the part's `Content-Type`, causing hasura-storage to store `mime_type = application/octet-stream`. The raw approach guarantees the correct MIME type is persisted in `storage.files`.

### mimeType repair

When the dedup path finds a file that already exists in `storage.files` but was previously uploaded with `mime_type = application/octet-stream`, `repairStorageFileMimeType(fileId, correctMimeType)` automatically repairs it:

1. Queries `storage_files_by_pk` via Hasura admin.
2. If `mime_type = application/octet-stream` and `correctMimeType ≠ application/octet-stream`, fires `update_storage_files_by_pk`.
3. Logs: `[nhost-storage] repaired mime_type for {uuid}: application/octet-stream → image/jpeg`.
4. Non-blocking — `.catch()` wrapped; a failure does not affect the upload response.

**To repair an existing file with wrong mimeType:** re-upload the same file through the media library. The dedup path will detect and fix it automatically.

### MIME type flow (admin console → Functions)

```
Browser File.type  (e.g. "image/jpeg")
  → guessMimeTypeFromFilename() fallback (extension-based)
  → "application/octet-stream" last resort
  ↓
/api/v1/admin/upload/image (admin console proxy)
  sets  Content-Type: image/jpeg  header
  ↓
/v1/admin/upload/image (Nhost Function)
  reads  req.headers["content-type"]
  falls back to  guessMimeTypeFromFilename()
  ↓
uploadMediaFile({ mimeType: "image/jpeg", … })
  ↓
postMultipartToNhostStorage({ mimeType: "image/jpeg", … })
  writes  Content-Type: image/jpeg  into the raw multipart wire bytes
  ↓
storage.files.mime_type = "image/jpeg"   ✓
```

### Display vs canonical URL (admin console)

The admin console must **never** render `public_url` directly in an `<Image src>` for Nhost-hosted files — Nhost Storage requires authentication.

| Use case | Helper | Result |
|---|---|---|
| `<Image src>` in admin UI | `getMediaDisplayUrl(publicUrl)` | `/api/v1/admin/media/file/{uuid}` (proxied, authenticated) |
| Save to property / Hasura | `getMediaCanonicalUrl(publicUrl)` | Stored `public_url` unchanged |
| Check if Nhost-hosted | `isNhostStorageUrl(url)` | `boolean` |
| Extract UUID | `extractNhostFileId(url)` | `string | null` |

Implementation: `src/lib/media-url.ts`. Proxy route: `src/app/api/v1/admin/media/file/[fileId]/route.ts` (uses `HASURA_GRAPHQL_ADMIN_SECRET` server-side; returns `Content-Type: image/jpeg` to the browser).

### Allowed MIME types

| Type | Ext |
|---|---|
| `image/jpeg` | `.jpg`, `.jpeg` |
| `image/png` | `.png` |
| `image/webp` | `.webp` |
| `image/gif` | `.gif` |
| `application/pdf` | `.pdf` |
| `video/mp4` | `.mp4` |

Any other MIME type → `400 MIME type not allowed`.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Row in `media_assets`, no entry in `storage.files` | Old orphaned row (pre-fix) | Re-upload same file → repair path creates `storage.files` entry |
| `storage.files.mime_type = application/octet-stream` | Uploaded before raw multipart fix | Re-upload same file → `repairStorageFileMimeType` fixes in-place |
| `deduped: true` but image 404 | Orphaned Nhost UUID | Re-upload → repair path re-creates storage entry |
| S3 URL in `media_assets`, Nhost backend active | Legacy row not migrated | Re-upload → `migrated: true` |
| Upload returns `502 … catalog` | Hasura `real_estate_media_assets` insert/update failed | Check Functions logs + Hasura permissions |
| `POST /v1/admin/upload/register` returns `400` | Called with Nhost backend | Use proxy upload (`POST /v1/admin/upload/image`) instead |
| Image renders as download, not inline | `storage.files.mime_type` is `application/octet-stream` | Re-upload to trigger mimeType repair |
| Admin console shows broken image | `HASURA_GRAPHQL_ADMIN_SECRET` missing or unquoted in `.env.local` | Quote the secret value; restart `next dev` |

### Key source files

| Repo | File | Role |
|---|---|---|
| `dropiti-nhost` | `functions/_lib/media-storage.ts` | Upload orchestration (`uploadMediaFile`, `createBatchUploadSlot`) |
| `dropiti-nhost` | `functions/_lib/nhost-storage.ts` | Storage API — upload, exists, mimeType repair, download |
| `dropiti-nhost` | `functions/_lib/media-assets.ts` | Hasura insert/update for `real_estate_media_assets` |
| `dropiti-nhost` | `functions/_lib/media-url.ts` | URL classification (Nhost vs legacy S3) |
| `dropiti-nhost` | `functions/_lib/storage-paths.ts` | Content-addressable path builder |
| `dropiti-nhost` | `functions/_lib/upload-policy.ts` | Size caps, MIME allowlist, image hints |
| `dropiti-nhost` | `functions/admin/upload/image.ts` | Proxy upload handler |
| `dropiti-nhost` | `functions/admin/upload/batch.ts` | Batch slot handler |
| `dropiti-nhost` | `functions/admin/upload/register.ts` | Register handler (S3 only; rejected for Nhost) |
| `dropiti-admin-console-2` | `src/lib/admin-api.ts` | Client-side upload + toast message formatting |
| `dropiti-admin-console-2` | `src/lib/media-url.ts` | Display vs canonical URL helpers |
| `dropiti-admin-console-2` | `src/app/api/v1/admin/upload/image/route.ts` | Same-origin upload proxy |
| `dropiti-admin-console-2` | `src/app/api/v1/admin/media/file/[fileId]/route.ts` | Authenticated file display proxy |
| `dropiti-admin-console-2` | `src/lib/nhost-storage-server.ts` | Server-side Storage fetch (used by display proxy) |

---

## 13. Pre-Push Verification

Run all checks from inside `functions/` before every commit to `main`.

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

# 6. FormData usage in nhost-storage — must not use FormData for file uploads
grep -n "new FormData\|form\.append" functions/_lib/nhost-storage.ts
```

After deploy:

```bash
# Health check — must return { "ok": true }
curl -sS "https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/health"

# Auth check — must return 200 with a valid user token
curl -sS -H "Authorization: Bearer <USER_TOKEN>" \
  "https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/echo"

# Admin upload smoke test — must return { "ok": true, "data": { ... "storageBackend": "nhost" } }
curl -sS -X POST \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: image/jpeg" \
  -H "X-Filename: test.jpg" \
  --data-binary @test.jpg \
  "https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/admin/upload/image"

# Register rejected — must return 400 on Nhost backend
curl -sS -X POST \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"s3Key":"test","publicUrl":"https://example.com/file.jpg","filename":"test.jpg","mimeType":"image/jpeg","sizeBytes":1000}' \
  "https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/admin/upload/register"
```

---

*api-doc-v2.md — June 2026. Supersedes `api-doc-v1.md` (May 2026). Primary change: Nhost Storage as the default media backend, raw multipart upload, mimeType repair, and explicit `storage.files` ↔ `media_assets` relationship documentation. Update this document when routes, `_lib/` contracts, or the media upload flow change.*
