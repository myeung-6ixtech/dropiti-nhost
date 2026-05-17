# Dropiti — Unified Nhost Backend

---

## Version History

| Version | Date | Author | Summary of Changes |
|---|---|---|---|
| 1.0 | May 2026 | Platform Team | Initial unified backend — architecture, namespace strategy, directory layout, shared infra, auth model, client + admin route inventory, deprecation list, Hasura roles, storage, subscriptions, coding standards, migration sequence, env vars. |
| 2.0 | May 2026 | Platform Team | Full admin interface expansion: property moderation, content moderation, analytics & reporting, system config, support & ticketing, audit logs. Admin Offer Inbox + WhatsApp outreach. Transfer Ownership Invitation (DB schema, WhatsApp service, 5 routes, UI spec, token lifecycle). Updated directory layout, env vars, DB tables, migration sequence. |
| 3.0 | May 2026 | Platform Team | **Admin console decouple audit.** Added Airwallex proxy Functions (payments, payment-intents, beneficiaries, transfers) — required by `/payments`, `/payment-intents`, `/beneficiaries`, `/transfers` pages. Added admin upload Functions (single presign + batch presign). Added `_lib/airwallex.ts` shared Airwallex API client. Added `_lib/ratelimit.ts` Upstash rate limiting helper. Migrated S3 upload to Nhost Storage. Added `AIRWALLEX_*` env vars to Functions. Updated directory layout with all new files. Updated migration sequence. |

> **Governing rules:** All code must satisfy every constraint in `AI_Rules.md`. This document does not repeat them — it references them. When a rule here conflicts with `AI_Rules.md`, `AI_Rules.md` wins.
>
> **Implementation note:** Deployed client handlers use `/v1/client/<domain>/<action>` (files under `functions/client/`). Admin handlers use `/v1/admin/<domain>/<action>`. Airwallex fund transfers live at `/v1/admin/transfers/*` — distinct from property `/v1/admin/transfer-ownership/*`.
>
> **Sources:** `client-side-functions.md`, `admin-side-functions.md`, `admin-interface-functions.md`, `dropiti-unified-backend-v2.md`, `decouple-plan.md`, `AI_Rules.md`, `boilerplate.md`

---

## Table of Contents

1. [Architecture Decision](#1-architecture-decision)
2. [URL Namespace Strategy](#2-url-namespace-strategy)
3. [Directory Layout](#3-directory-layout)
4. [Shared Infrastructure (`_lib/`)](#4-shared-infrastructure-_lib)
5. [Auth Model — Unified](#5-auth-model--unified)
6. [Client API Routes (`v1/`)](#6-client-api-routes-v1)
7. [Admin API Routes (`v1/admin/`)](#7-admin-api-routes-v1admin)
   - [7.1 User Management](#71-user-management)
   - [7.2 Property Management & Moderation](#72-property-management--moderation)
   - [7.3 Offer Management](#73-offer-management)
   - [7.4 Admin Offer Inbox & WhatsApp Outreach](#74-admin-offer-inbox--whatsapp-outreach)
   - [7.5 Transfer Ownership Invitation](#75-transfer-ownership-invitation)
   - [7.6 Content Moderation](#76-content-moderation)
   - [7.7 Analytics & Reporting](#77-analytics--reporting)
   - [7.8 System Configuration](#78-system-configuration)
   - [7.9 Support & Ticketing](#79-support--ticketing)
   - [7.10 Audit Logs](#710-audit-logs)
   - [7.11 Payments — Airwallex Proxy](#711-payments--airwallex-proxy) ⭐ New in v3.0
   - [7.12 Payment Intents — Airwallex Proxy](#712-payment-intents--airwallex-proxy) ⭐ New in v3.0
   - [7.13 Beneficiaries — Airwallex Proxy](#713-beneficiaries--airwallex-proxy) ⭐ New in v3.0
   - [7.14 Transfers — Airwallex Proxy](#714-transfers--airwallex-proxy) ⭐ New in v3.0
   - [7.15 Admin Upload](#715-admin-upload) ⭐ New in v3.0
8. [Shared / Cross-Cutting Routes](#8-shared--cross-cutting-routes)
9. [Routes Deprecated on Migration](#9-routes-deprecated-on-migration)
10. [Hasura Role Strategy](#10-hasura-role-strategy)
11. [Database Schema](#11-database-schema)
12. [WhatsApp Service Layer](#12-whatsapp-service-layer)
13. [Airwallex Service Layer](#13-airwallex-service-layer) ⭐ New in v3.0
14. [Nhost Storage — Upload](#14-nhost-storage--upload)
15. [Rate Limiting — Upstash](#15-rate-limiting--upstash) ⭐ New in v3.0
16. [Real-Time — Subscriptions](#16-real-time--subscriptions)
17. [Coding Standards Cheatsheet](#17-coding-standards-cheatsheet)
18. [Migration Sequence](#18-migration-sequence)
19. [Environment Variables Reference](#19-environment-variables-reference)

---

## 1. Architecture Decision

### Current state (two separate repos, two backends)

```
dropiti-v3 (Next.js)
  └── src/app/api/v1/*         ← ~55 REST routes, Hasura via admin secret
  └── src/app/api/graphql/*    ← GraphQL proxy + browser/server clients

dropiti-admin-console (Next.js)
  └── src/app/api/login        ← PBKDF2 session auth (legacy)
  └── src/app/api/auth/check   ← Session validation
  └── src/app/api/auth/logout  ← Session teardown
  └── middleware.ts            ← JWT guard (already on Nhost nhost_access_token)
  └── Direct Hasura queries    ← Using HASURA_ADMIN_SECRET in server components
  └── S3 uploads               ← @aws-sdk/client-s3
  └── Airwallex calls          ← @airwallex/components-sdk (API key exposed)
```

### Target state (one Nhost Functions repo)

```
dropiti-nhost (Nhost Functions)
  └── functions/<domain>/*     ← Client-facing logic   → URL /v1/<domain>/...
  └── functions/admin/*        ← Admin operations      → URL /v1/admin/...
  └── functions/_lib/*         ← Shared infra
  └── functions/health.ts      ← Health check          → URL /v1/health
```

> **Routing:** Nhost maps `functions/<path>.ts` → `{FUNCTIONS_URL}/v1/<path>`. No `v1/` subfolder in `functions/`.

**Key v3.0 decisions:**
- Airwallex API calls proxied through Nhost Functions — API key never reaches the browser
- S3 replaced by Nhost Storage — `@aws-sdk/client-s3` removed from admin console
- Upstash rate limiting moved from admin console to `_lib/ratelimit.ts` in Functions
- Admin console `src/app/api/` directory deleted entirely

---

## 2. URL Namespace Strategy

```
{FUNCTIONS_URL}/v1/health                          ← Health ping
{FUNCTIONS_URL}/v1/<domain>/<action>               ← Client app routes
{FUNCTIONS_URL}/v1/admin/<domain>/<action>         ← Admin console routes
```

**Admin console base URL config:**
```ts
const ADMIN_API = `${process.env.NEXT_PUBLIC_FUNCTIONS_URL}/v1/admin`
```

**Client app base URL config:**
```ts
const API = `${process.env.NEXT_PUBLIC_FUNCTIONS_URL}/v1`
```

---

## 3. Directory Layout

```
functions/
├── package.json
├── package-lock.json              ← always committed
├── tsconfig.json                  ← strict, ES2022, CommonJS
│
├── _lib/
│   ├── env.ts                     ← only source of process.env reads
│   ├── hasura.ts                  ← hasuraQuery<T>() helper
│   ├── auth.ts                    ← requireAuth(), getUserId(), requireAdminRole()
│   ├── respond.ts                 ← ok(), fail()
│   ├── validate.ts                ← validate(req, res, Schema)
│   ├── whatsapp.ts                ← WhatsApp service layer (v2.0)
│   ├── airwallex.ts               ← Airwallex API client ⭐ New v3.0
│   ├── ratelimit.ts               ← Upstash rate limiting helper ⭐ New v3.0
│   └── enums/
│       └── offer-actions.ts       ← ACCEPT | REJECT | COUNTER | WITHDRAW
│
├── health.ts                      ← GET /v1/health
│
├── users/
│   ├── create-user.ts
│   ├── get-user-by-id.ts
│   ├── get-user-by-uuid.ts
│   └── update-user.ts
│
├── tenants/
│   ├── index.ts
│   └── profile.ts
│
├── properties/
│   ├── create-property.ts
│   ├── get-drafts.ts
│   ├── delete-draft.ts
│   ├── publish-draft.ts
│   ├── get-listings.ts
│   ├── get-property.ts
│   ├── get-property-by-uuid.ts
│   ├── get-property-count-by-user.ts
│   └── update-property.ts
│
├── offers/
│   ├── create-offer.ts
│   ├── get-offers.ts
│   ├── get-offers-by-id.ts
│   ├── get-offers-by-initiator.ts
│   ├── accept-offer.ts
│   ├── reject-offer.ts
│   ├── counter-offer.ts
│   ├── withdraw-offer.ts
│   ├── get-negotiation-state.ts
│   ├── get-offer-actions.ts
│   └── get-review-opportunities.ts
│
├── reviews/
│   ├── create-review.ts
│   ├── update-review.ts
│   ├── delete-review.ts
│   ├── get-reviews-by-property.ts
│   ├── get-reviews-by-user.ts
│   └── mark-helpful.ts
│
├── chat/
│   ├── get-or-create-room.ts
│   ├── get-chat-rooms.ts
│   ├── get-room-messages.ts
│   └── send-message.ts
│
├── notifications/
│   ├── index.ts
│   ├── unread-count.ts
│   ├── mark-read.ts
│   ├── mark-all-read.ts
│   └── archive.ts
│
├── transfer-ownership/
│   ├── validate.ts                ← GET  /v1/transfer-ownership/validate?token=
│   └── claim.ts                   ← POST /v1/transfer-ownership/claim
│
├── upload/
│   └── presign.ts                 ← POST /v1/upload/presign (client-side)
│
└── admin/
    ├── users/
    │   ├── index.ts               ← GET    /v1/admin/users
    │   ├── get-user.ts
    │   ├── update-user.ts
    │   ├── verify-user.ts
    │   ├── suspend-user.ts
    │   ├── reactivate-user.ts
    │   ├── ban-user.ts
    │   ├── activity-log.ts
    │   ├── export-user-data.ts
    │   ├── delete-user-data.ts
    │   └── bulk.ts
    │
    ├── properties/
    │   ├── index.ts
    │   ├── get-property.ts
    │   ├── approve.ts
    │   ├── reject.ts
    │   ├── flag.ts
    │   ├── update-property.ts
    │   ├── feature.ts
    │   ├── bulk.ts
    │   ├── moderation-queue.ts
    │   └── reports.ts
    │
    ├── offers/
    │   ├── index.ts
    │   ├── get-offer.ts
    │   ├── incoming.ts
    │   ├── remind.ts
    │   ├── flag.ts
    │   ├── cancel.ts
    │   └── stalled.ts
    │
    ├── transfer-ownership/
    │   ├── invite.ts
    │   ├── resend.ts
    │   └── status.ts
    │
    ├── reviews/
    │   ├── moderation-queue.ts
    │   ├── approve.ts
    │   ├── reject.ts
    │   └── update-review.ts
    │
    ├── reports/
    │   ├── index.ts
    │   ├── update.ts
    │   ├── resolve.ts
    │   └── summary.ts
    │
    ├── analytics/
    │   ├── dashboard.ts
    │   ├── users.ts
    │   ├── properties.ts
    │   ├── transactions.ts
    │   ├── performance.ts
    │   ├── export.ts
    │   └── custom-report.ts
    │
    ├── settings/
    │   ├── index.ts
    │   ├── update.ts
    │   ├── feature-flags.ts
    │   ├── toggle-flag.ts
    │   ├── email-templates.ts
    │   └── update-template.ts
    │
    ├── support/
    │   ├── tickets/
    │   │   ├── index.ts
    │   │   ├── get-ticket.ts
    │   │   ├── create.ts
    │   │   ├── update.ts
    │   │   ├── reply.ts
    │   │   ├── add-note.ts
    │   │   ├── assign.ts
    │   │   └── close.ts
    │   └── canned-responses.ts
    │
    ├── audit-logs/
    │   ├── index.ts
    │   ├── export.ts
    │   └── admin-activity.ts
    │
    ├── payments/                  ← ⭐ New v3.0 — Airwallex proxy
    │   ├── index.ts               ← GET  /v1/admin/payments
    │   ├── get-payment.ts         ← GET  /v1/admin/payments/:id
    │   ├── capture.ts             ← POST /v1/admin/payments/:id/capture
    │   └── cancel.ts              ← POST /v1/admin/payments/:id/cancel
    │
    ├── payment-intents/           ← ⭐ New v3.0 — Airwallex proxy
    │   ├── index.ts               ← GET  /v1/admin/payment-intents
    │   └── get-intent.ts          ← GET  /v1/admin/payment-intents/:id
    │
    ├── beneficiaries/             ← ⭐ New v3.0 — Airwallex proxy
    │   ├── index.ts               ← GET    /v1/admin/beneficiaries
    │   ├── create.ts              ← POST   /v1/admin/beneficiaries
    │   └── delete.ts              ← DELETE /v1/admin/beneficiaries/:id
    │
    ├── transfers/                 ← ⭐ New v3.0 — Airwallex proxy
    │   ├── index.ts               ← GET  /v1/admin/transfers
    │   ├── create.ts              ← POST /v1/admin/transfers
    │   └── status.ts              ← GET  /v1/admin/transfers/:id/status
    │
    └── upload/                    ← ⭐ New v3.0 — replaces admin S3 uploads
        ├── presign.ts             ← POST /v1/admin/upload/presign (single)
        └── batch.ts               ← POST /v1/admin/upload/batch (multi-file)
```

---

## 4. Shared Infrastructure (`_lib/`)

### `_lib/env.ts`
Single source of `process.env` reads. Updated in v3.0 with Airwallex + Upstash vars.

```ts
export const env = {
  // Hasura
  adminSecret:          process.env.NHOST_ADMIN_SECRET ?? process.env.HASURA_GRAPHQL_ADMIN_SECRET,
  jwtSecret:            resolveJwtSecret(),
  graphqlUrl:           process.env.NHOST_GRAPHQL_URL ?? buildGraphqlUrl(),
  // WhatsApp
  whatsappProvider:     process.env.WHATSAPP_PROVIDER ?? 'stub',
  whatsappApiToken:     process.env.WHATSAPP_API_TOKEN,
  whatsappPhoneId:      process.env.WHATSAPP_PHONE_NUMBER_ID,
  invitationExpiryDays: Number(process.env.INVITATION_EXPIRY_DAYS ?? '7'),
  // Airwallex ⭐ New v3.0
  airwallexApiKey:      process.env.AIRWALLEX_API_KEY,
  airwallexClientId:    process.env.AIRWALLEX_CLIENT_ID,
  airwallexEnv:         process.env.AIRWALLEX_ENV ?? 'demo',
  // Upstash ⭐ New v3.0
  upstashRedisUrl:      process.env.UPSTASH_REDIS_REST_URL,
  upstashRedisToken:    process.env.UPSTASH_REDIS_REST_TOKEN,
}
```

### `_lib/airwallex.ts` ⭐ New in v3.0

Shared Airwallex API client. All Airwallex proxy handlers import from here — never call Airwallex inline.

```ts
const AIRWALLEX_BASE = {
  demo: 'https://api-demo.airwallex.com/api/v1',
  prod: 'https://api.airwallex.com/api/v1',
}

// Returns a bearer token from Airwallex using CLIENT_ID + API_KEY
async function getAirwallexToken(): Promise<string>

// Generic Airwallex request — wraps fetch with auth header
export async function airwallexRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T>

// Typed helpers used by route handlers
export const airwallex = {
  payments:      { list, get },
  paymentIntents: { list, get },
  beneficiaries: { list, create, delete: remove },
  transfers:     { list, create, getStatus },
}
```

### `_lib/ratelimit.ts` ⭐ New in v3.0

Upstash sliding-window rate limiter. Used by Airwallex proxy routes and any other rate-sensitive admin endpoints.

```ts
/**
 * Returns true if the request is within limits, false if it should be rejected.
 * Uses Upstash REST API (no SDK needed in Functions).
 *
 * @param key     - Unique key e.g. "airwallex:payments:{adminId}"
 * @param max     - Max requests
 * @param windowS - Window in seconds
 */
export async function isAllowed(key: string, max: number, windowS: number): Promise<boolean>
```

Usage in a handler:
```ts
const allowed = await isAllowed(`airwallex:payments:${getUserId(payload)}`, 30, 60)
if (!allowed) return fail(res, 'Rate limit exceeded', 429)
```

### `_lib/hasura.ts`, `_lib/auth.ts`, `_lib/respond.ts`, `_lib/validate.ts`, `_lib/whatsapp.ts`

Unchanged from v2.0. See §4 of `dropiti-unified-backend-v2.md`.

---

## 5. Auth Model — Unified

Unchanged from v2.0. Both frontends use Nhost Auth JWT. Admin console `middleware.ts` requires zero changes.

Admin users must have `"admin"` in `x-hasura-allowed-roles` — set via Nhost Auth custom claims.

See full auth model in `dropiti-unified-backend-v2.md` §5.

---

## 6. Client API Routes (`v1/`)

Unchanged from v2.0. Full table in `dropiti-unified-backend-v2.md` §6.

---

## 7. Admin API Routes (`v1/admin/`)

Sections 7.1–7.10 are unchanged from v2.0. See `dropiti-unified-backend-v2.md` §7.1–7.10.

The following sections are new in v3.0.

### 7.11 Payments — Airwallex Proxy ⭐ New in v3.0

All routes require `requireAdminRole()`. All Airwallex calls are server-side via `_lib/airwallex.ts`. The `AIRWALLEX_API_KEY` is never exposed to the browser.

| Route | Method | Description |
|---|---|---|
| `payments/index` | `GET` | List payment intents from Airwallex. Params: `status`, `page`, `limit`, `dateFrom`, `dateTo`. Rate: 30 req/min per admin. |
| `payments/get-payment` | `GET` | Single payment detail. Query param: `id`. |
| `payments/capture` | `POST` | Capture a payment intent. Body: `{ id, captureAmount? }`. |
| `payments/cancel` | `POST` | Cancel a payment intent. Body: `{ id, cancellationReason? }`. |

**Handler pattern:**
```ts
export default async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = await requireAdminRole(req, res)
    if (!payload) return

    const allowed = await isAllowed(`payments:${getUserId(payload)}`, 30, 60)
    if (!allowed) return fail(res, 'Rate limit exceeded', 429)

    const payments = await airwallex.payments.list({ status: req.query.status })
    ok(res, payments)
  } catch (err) {
    console.error('[admin/payments/index]', err)
    fail(res, 'Internal server error', 500)
  }
}
```

### 7.12 Payment Intents — Airwallex Proxy ⭐ New in v3.0

| Route | Method | Description |
|---|---|---|
| `payment-intents/index` | `GET` | List payment intents. Params: `status`, `page`, `limit`. |
| `payment-intents/get-intent` | `GET` | Single intent detail. Query param: `id`. |

### 7.13 Beneficiaries — Airwallex Proxy ⭐ New in v3.0

| Route | Method | Description |
|---|---|---|
| `beneficiaries/index` | `GET` | List all beneficiaries. Params: `page`, `limit`, `search`. |
| `beneficiaries/create` | `POST` | Create a beneficiary. Body: Airwallex beneficiary schema. |
| `beneficiaries/delete` | `DELETE` | Remove a beneficiary. Query param: `id`. |

### 7.14 Transfers — Airwallex Proxy ⭐ New in v3.0

| Route | Method | Description |
|---|---|---|
| `transfers/index` | `GET` | List fund transfers. Params: `status`, `page`, `limit`, `dateFrom`. |
| `transfers/create` | `POST` | Initiate a transfer. Body: `{ beneficiaryId, amount, currency, reference }`. |
| `transfers/status` | `GET` | Poll transfer status. Query param: `id`. |

### 7.15 Admin Upload ⭐ New in v3.0

Replaces the current `@aws-sdk/client-s3` upload from the admin console. Both routes require `requireAdminRole()`.

#### `POST /v1/admin/upload/presign` — Single file
```ts
Body: { filename: string; mimeType: string; bucketId?: string }
Returns: { uploadUrl: string; fileId: string }
```
Client uploads directly to the returned `uploadUrl` (PUT to Nhost Storage).

#### `POST /v1/admin/upload/batch` — Multiple files
```ts
Body: Array<{ filename: string; mimeType: string; bucketId?: string }>
Returns: Array<{ uploadUrl: string; fileId: string; filename: string }>
```
Client iterates the array and PUTs each file to its corresponding `uploadUrl`.

**Validation in both routes:**
- MIME type must be in allowlist: `["image/jpeg","image/png","image/webp","application/pdf","video/mp4"]`
- Max file size enforced by Nhost Storage bucket policy (set in Nhost dashboard)
- Max 20 files per batch request

**Image processing constants** (moved from admin console env vars):
```ts
const IMAGE_MAX_WIDTH  = 1600
const IMAGE_MAX_HEIGHT = 1600
const IMAGE_WEBP_QUALITY = 75
// Resizing happens client-side before upload, or via a Nhost Storage transform URL
```

---

## 8. Shared / Cross-Cutting Routes

| Route | Method | Description |
|---|---|---|
| `health.ts` | `GET` | `{ ok: true, data: { status: "healthy" } }`. No auth. First check after every deploy. |

---

## 9. Routes Deprecated on Migration

All routes from v2.0 deprecation list plus new additions in v3.0:

| Current route | Reason |
|---|---|
| `src/app/api/graphql/route.ts` | GraphQL proxy — removed |
| `src/app/api/graphql/client.ts` | Replaced by `@nhost/nextjs` + Apollo/urql |
| `src/app/api/graphql/serverClient.ts` | Replaced by `hasuraQuery()` |
| `src/app/api/test-*` | All test routes — delete |
| `v1/reviews/test-review-schema` | Dev-only — delete |
| `POST /api/login` (admin-console) | Replaced by Nhost Auth `signIn()` |
| `GET /api/auth/check` (admin-console) | Replaced by `useAuthenticationStatus()` |
| `POST /api/auth/logout` (admin-console) | Replaced by Nhost Auth `signOut()` |
| Admin console S3 upload code | Replaced by Nhost Storage + `admin/upload/*` Functions |
| Admin console direct Hasura calls with admin secret | Replaced by Nhost Function calls with JWT |

---

## 10. Hasura Role Strategy

Unchanged from v2.0. See `dropiti-unified-backend-v2.md` §10.

**New in v3.0:** The `admin/payments/*`, `admin/transfers/*`, `admin/beneficiaries/*`, and `admin/upload/*` routes do not make Hasura queries — they proxy to Airwallex or Nhost Storage. They still require `requireAdminRole()` for auth.

---

## 11. Database Schema

Unchanged from v2.0. See `dropiti-unified-backend-v2.md` §11 for all migration SQL.

**No new tables added in v3.0.** Airwallex data is not persisted to Hasura — it's fetched live from the Airwallex API on each request.

---

## 12. WhatsApp Service Layer

Unchanged from v2.0. See `dropiti-unified-backend-v2.md` §12.

---

## 13. Airwallex Service Layer ⭐ New in v3.0

**File:** `functions/_lib/airwallex.ts`

The admin console currently uses `@airwallex/components-sdk` with `AIRWALLEX_API_KEY` in `.env`. After decoupling, the API key lives exclusively in Nhost Functions `.secrets`. The browser-facing Airwallex Elements SDK (`NEXT_PUBLIC_AIRWALLEX_ENV`, `AIRWALLEX_CLIENT_ID`) stays in the admin console frontend for payment form rendering — those are browser-safe credentials.

### Environment setup

```
# .secrets (Nhost Functions — never in admin console frontend)
AIRWALLEX_API_KEY=d129b557fe0d1dea...
AIRWALLEX_CLIENT_ID=WyQ2_hk4TlaAnOuaOSV1FQ
AIRWALLEX_ENV=demo   # or prod
```

### Token caching

Airwallex tokens expire in 30 minutes. The service layer caches the token in-memory and refreshes automatically:

```ts
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAirwallexToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value
  }
  const res = await fetch(`${baseUrl}/authentication/login`, {
    method: 'POST',
    headers: {
      'x-client-id': env.airwallexClientId!,
      'x-api-key':   env.airwallexApiKey!,
    },
  })
  const data = await res.json()
  cachedToken = { value: data.token, expiresAt: Date.now() + 29 * 60 * 1000 }
  return cachedToken.value
}
```

### Error handling

Airwallex errors follow a different shape than Hasura errors. Map them to the standard `fail()` response:

```ts
// Airwallex 4xx → fail(res, airwallexError.message, 400)
// Airwallex 401 → fail(res, 'Airwallex auth failed', 502)
// Airwallex 5xx → fail(res, 'Airwallex service error', 502)
// Network error → fail(res, 'Internal server error', 500)
```

Never leak raw Airwallex error payloads (may contain API key in headers or sensitive amounts).

### Phase roadmap

| Phase | Item | Status |
|---|---|---|
| 1 | `_lib/airwallex.ts` with stub mode (returns mock data) | Implement first |
| 1 | All proxy Function files (payments, payment-intents, beneficiaries, transfers) | Implement |
| 2 | Switch `AIRWALLEX_ENV=prod` in production `.secrets` | When ready for production |
| 2 | Add Airwallex webhook handler for async payment status updates | Future |

---

## 14. Nhost Storage — Upload

### Client-side (admin console, simple single upload)
```ts
const { fileMetadata, error } = await nhost.storage.upload({
  file,
  bucketId: 'admin-media',
})
```

### Server-validated (via Nhost Function — single file)
```
POST /v1/admin/upload/presign
Body: { filename, mimeType, bucketId? }
Returns: { uploadUrl, fileId }
```

### Server-validated (via Nhost Function — batch)
```
POST /v1/admin/upload/batch
Body: [{ filename, mimeType, bucketId? }, ...]
Returns: [{ uploadUrl, fileId, filename }, ...]
```

### Nhost Storage URL pattern
```ts
// Get public URL for a file
nhost.storage.getPublicUrl({ fileId })
// → https://fcuycyemqprjrkbshlcj.storage.ap-southeast-1.nhost.run/v1/files/{fileId}
```

### Buckets to create in Nhost dashboard

| Bucket ID | Purpose | Access |
|---|---|---|
| `property-images` | Client property listing photos | Public read |
| `admin-media` | Admin media library uploads | Admin-only read |
| `user-avatars` | User profile pictures | Public read |
| `documents` | Lease agreements, ID verification | Private (signed URL) |

---

## 15. Rate Limiting — Upstash ⭐ New in v3.0

Upstash Redis rate limiting moves from the admin console frontend to `_lib/ratelimit.ts` in Nhost Functions.

**Add to Nhost Functions `.secrets`:**
```
UPSTASH_REDIS_REST_URL=https://selected-bear-31650.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXuiAAIncDI4...
```

**Remove from admin console `.env`:**
```
# DELETE THESE:
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

### Rate limit policies per route category

| Route category | Limit | Window |
|---|---|---|
| Admin reads (users, properties) | 100 req | 60s |
| Admin writes (suspend, approve) | 30 req | 60s |
| Admin bulk operations | 10 req | 60s |
| Admin export (analytics, audit) | 5 req | 3600s |
| Airwallex proxy (all methods) | 30 req | 60s |
| Admin upload (presign, batch) | 20 req | 60s |

The `isAllowed()` function uses per-admin keying (`{category}:{adminId}`) so limits are per-user not global.

---

## 16. Real-Time — Subscriptions

Unchanged from v2.0. Chat and notifications read paths migrate to Hasura subscriptions. See `dropiti-unified-backend-v2.md` §14.

---

## 17. Coding Standards Cheatsheet

Unchanged from v2.0, with one addition for Airwallex proxy routes:

**Airwallex proxy handler pattern:**
```ts
export default async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Admin auth
    const payload = await requireAdminRole(req, res)
    if (!payload) return

    // 2. Rate limit
    const allowed = await isAllowed(`airwallex:payments:${getUserId(payload)}`, 30, 60)
    if (!allowed) return fail(res, 'Rate limit exceeded', 429)

    // 3. Validate input
    const query = validate(req, res, MySchema)
    if (!query) return

    // 4. Airwallex call
    const result = await airwallex.payments.list(query)

    // 5. Respond
    ok(res, result)
  } catch (err) {
    console.error('[admin/payments/index]', err)
    fail(res, 'Internal server error', 500)
  }
}
```

Full cheatsheet in `dropiti-unified-backend-v2.md` §15.

---

## 18. Migration Sequence

Phases 1–5 from v2.0 are preserved. New steps are added at Phase 2c.

### Phase 1 — Foundation
_(Unchanged from v2.0)_
1. Set up `dropiti-nhost` with `_lib/` files — including new `airwallex.ts` (stub) and `ratelimit.ts`
2. Deploy `health.ts`. Confirm `GET /v1/health`
3. Nhost Auth custom claims for admin role
4. Verify admin console `middleware.ts`
5. Run all DB migrations

### Phase 2a — Transfer Ownership & Admin Offer Inbox
_(Unchanged from v2.0)_

### Phase 2b — Full Admin Expansion
_(Unchanged from v2.0)_

### Phase 2c — Airwallex Proxy & Upload Functions ⭐ New in v3.0
18. Implement `_lib/airwallex.ts` with stub mode
19. Implement `admin/payments/*`, `admin/payment-intents/*`, `admin/beneficiaries/*`, `admin/transfers/*`
20. Implement `admin/upload/presign.ts`, `admin/upload/batch.ts`
21. Test all Airwallex proxy routes with admin JWT (stub mode — check shape not live data)
22. Switch to live Airwallex credentials in staging, confirm real data flows
23. Update admin console `/payments`, `/payment-intents`, `/beneficiaries`, `/transfers`, `/media-library` to call Nhost Functions

### Phase 2d — Admin Console Auth Decoupling ⭐ New in v3.0
24. Add `@nhost/nextjs`, `@nhost/react` to admin console
25. Create `src/lib/nhost.ts`, `src/lib/admin-api.ts`
26. Rewrite `AuthContext.tsx` to use Nhost hooks
27. Test login → dashboard → logout via Nhost Auth
28. Delete `src/app/api/login/route.ts`, `src/app/api/auth/check/route.ts`, `src/app/api/auth/logout/route.ts`
29. Remove `@aws-sdk/client-s3`, all `S3_BUCKET_*` env vars
30. Remove `HASURA_ADMIN_SECRET`, `SDK_BACKEND_URL`, `HASURA_ENDPOINT` from admin console
31. Remove Upstash env vars from admin console (now in Nhost Functions `.secrets`)
32. Add `NEXT_PUBLIC_FUNCTIONS_URL` to admin console `.env`

### Phase 3 — Client Routes
_(Unchanged from v2.0, steps 18–20 renumbered to 33–35)_

### Phase 4 — Real-Time Migration
_(Unchanged from v2.0)_

### Phase 5 — Cleanup & Production
_(Unchanged from v2.0, plus:)_
- Remove `@airwallex/components-sdk` server-side usage from admin console (keep UI Elements only)
- Confirm `AIRWALLEX_API_KEY` is not in any frontend env file
- Run `grep -r "AIRWALLEX_API_KEY\|S3_BUCKET\|HASURA_ADMIN_SECRET\|SDK_BACKEND_URL" src/` in admin console — must return 0 results

### Operational check after every phase
```bash
GET /v1/health                                    # must return { ok: true }
# Client route with user JWT → 200
# Admin route with admin JWT → 200
# Admin route with user JWT → 403
# /v1/admin/payments with admin JWT → 200 (even in stub mode)
# /v1/admin/upload/batch with admin JWT → returns presigned URLs
```

---

## 19. Environment Variables Reference

### Nhost Functions `.secrets` / Nhost Dashboard

| Variable | Notes |
|---|---|
| `NHOST_ADMIN_SECRET` | Falls back to `HASURA_GRAPHQL_ADMIN_SECRET` |
| `NHOST_JWT_SECRET` | JSON `{ "key": "...", "type": "HS256" }` — parse `.key` |
| `NHOST_GRAPHQL_URL` | Auto-injected. Falls back to `NHOST_SUBDOMAIN` + `NHOST_REGION` |
| `NHOST_SUBDOMAIN` | Auto-injected |
| `NHOST_REGION` | Auto-injected |
| `WHATSAPP_PROVIDER` | `stub` / `meta` / `twilio` |
| `WHATSAPP_API_TOKEN` | Required when provider ≠ stub |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Cloud API only |
| `INVITATION_EXPIRY_DAYS` | Default `7` |
| `AIRWALLEX_API_KEY` | **Server-only** — never in frontend ⭐ New v3.0 |
| `AIRWALLEX_CLIENT_ID` | Server-side Airwallex auth ⭐ New v3.0 |
| `AIRWALLEX_ENV` | `demo` or `prod` ⭐ New v3.0 |
| `UPSTASH_REDIS_REST_URL` | Moved from admin console ⭐ New v3.0 |
| `UPSTASH_REDIS_REST_TOKEN` | Moved from admin console ⭐ New v3.0 |

### Admin console frontend `.env`

| Variable | Keep/Remove/New | Notes |
|---|---|---|
| `NHOST_JWT_SECRET` | **Keep** | `middleware.ts` JWT verification |
| `NEXT_PUBLIC_NHOST_SUBDOMAIN` | **Keep** | `@nhost/nextjs` client |
| `NEXT_PUBLIC_NHOST_REGION` | **Keep** | `@nhost/nextjs` client |
| `NEXT_PUBLIC_SITE_URL` | **Keep** | Auth redirect URL |
| `NEXT_PUBLIC_AIRWALLEX_ENV` | **Keep** | Airwallex Elements (browser-safe) |
| `AIRWALLEX_CLIENT_ID` | **Keep** | Airwallex Elements (browser-safe) |
| `NEXT_PUBLIC_FUNCTIONS_URL` | **NEW ⭐** | Base URL for all Nhost Function calls |
| `SDK_BACKEND_URL` | **REMOVE** | Direct Hasura — replaced by Functions |
| `HASURA_ADMIN_SECRET` | **REMOVE** | Server secret — move to Functions `.secrets` |
| `HASURA_ENDPOINT` | **REMOVE** | Same |
| `AIRWALLEX_API_KEY` | **REMOVE** | Move to Functions `.secrets` |
| `S3_BUCKET_ACCESS_KEY` | **REMOVE** | AWS S3 gone |
| `S3_BUCKET_SECRET_KEY` | **REMOVE** | AWS S3 gone |
| `S3_BUCKET_DOMAIN_URL` | **REMOVE** | AWS S3 gone |
| `S3_BUCKET_AWS_REGION` | **REMOVE** | AWS S3 gone |
| `S3_BUCKET_NAME` | **REMOVE** | AWS S3 gone |
| `IMAGE_MAX_WIDTH` | **REMOVE** | Constant in Functions |
| `IMAGE_MAX_HEIGHT` | **REMOVE** | Constant in Functions |
| `IMAGE_WEBP_QUALITY` | **REMOVE** | Constant in Functions |
| `UPSTASH_REDIS_REST_URL` | **REMOVE** | Move to Functions `.secrets` |
| `UPSTASH_REDIS_REST_TOKEN` | **REMOVE** | Move to Functions `.secrets` |
| `JWT_SECRET` | **REMOVE** | Legacy — replaced by `NHOST_JWT_SECRET` |
| `ROOT_EMAIL` | **REMOVE** | Legacy seed credential |
| `ROOT_PASSWORD` | **REMOVE** | Legacy seed credential |
| `NEXT_PUBLIC_API_URL` | **REMOVE** | Was pointing to old local API |
| `NEXT_PUBLIC_CLIENT_SECRET` | **Review** | If Airwallex-specific keep; otherwise remove |

**Local development** — copy `secrets/dotsecrets.example` to repo-root `.secrets`. Never commit `.secrets`.

---

*Dropiti Unified Backend v3.0 — May 2026. Maintain alongside `AI_Rules.md` and `decouple-dropiti-admin.md`. Update version history on every structural change.*