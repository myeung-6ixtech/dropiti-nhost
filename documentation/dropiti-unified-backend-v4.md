# Dropiti — Unified Nhost Backend

---

## Version History

| Version | Date | Author | Summary of Changes |
|---|---|---|---|
| 1.0 | May 2026 | Platform Team | Initial unified backend — architecture, namespace, shared infra, auth model, client + admin route inventory, deprecation list, Hasura roles, storage, subscriptions, coding standards, migration sequence. |
| 2.0 | May 2026 | Platform Team | Full admin interface expansion: property moderation, content moderation, analytics, system config, support, audit logs. Admin Offer Inbox + WhatsApp. Transfer Ownership Invitation (DB schema, service layer, 5 routes, token lifecycle). |
| 3.0 | May 2026 | Platform Team | Admin console decouple audit. Airwallex proxy Functions (payments, payment-intents, beneficiaries, transfers). Admin upload (presign + batch) using AWS S3. `_lib/s3.ts`, `_lib/airwallex.ts`, `_lib/ratelimit.ts`. S3 credentials moved to Functions `.secrets`. All endpoints resolved to concrete subdomain URL. |
| 4.0 | May 2026 | Platform Team | **Lambda fix + precision update.** Root-cause analysis of lambda deployment error. Enforced `(req, res)` Express-style handler signature — NOT `(event, context)` AWS Lambda style. Added `client/` directory prefix correcting v3 flat-namespace error. Corrected admin auth to use JWT `requireAdminRole()` NOT `x-admin-secret` header. Full precise handler template with import paths. Added `nhost.toml` constraints. Complete corrected directory layout. |

> **Governing rules:** All code must satisfy `AI_Rules.md` in `documentation/AI_Rules.md`. This document does not repeat them — it extends them with Dropiti-specific constraints. When this doc conflicts with `AI_Rules.md`, `AI_Rules.md` wins **except** for the lambda fix and namespace corrections in §2 and §3 which override any earlier guidance in this series.
>
> **Authoritative sources read for v4.0:** Live `documentation/AI_Rules.md`, `documentation/api-guide.md`, `documentation/boilerplate.md` from `myeung-6ixtech/dropiti-nhost` main branch.

---

## ⚠️ Lambda Issue — Root Cause & Fix

**Why it fails:** Code was written using the AWS Lambda handler signature:

```ts
// ❌ WRONG — AWS Lambda style, breaks Nhost deploy
export const handler = async (event: APIGatewayEvent, context: Context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  }
}
```

or

```ts
// ❌ ALSO WRONG — named export, Nhost needs default export
export async function handler(req: Request, res: Response) { ... }
```

**Why this happens:** AI code generation tools default to AWS Lambda patterns because they are more common in training data. Nhost Functions do **not** use Lambda. They run on a persistent Node.js HTTP server using an **Express-compatible `(req, res)` interface**.

**The correct signature — non-negotiable:**

```ts
// ✅ CORRECT — Nhost Functions handler
import type { Request, Response } from 'express'

export default async (req: Request, res: Response): Promise<void> => {
  // handler body
}
```

**Three hard rules that prevent the lambda error:**

1. **Always `export default`** — named exports (`export const handler`, `export function handler`) are not picked up by Nhost's function loader.
2. **Always `(req: Request, res: Response): Promise<void>`** — the return type is `void`, not a response object. You write to `res`, you do not return a value.
3. **Never `statusCode` / `body` as return values** — use `res.status(N).json(...)` or the `ok()` / `fail()` helpers from `_lib/respond.ts`.

**Check for lambda patterns before every push:**

```bash
# Run from functions/ — any hit is a deploy blocker
grep -r "APIGatewayEvent\|LambdaHandler\|statusCode.*body\|export const handler\|export function handler" --include="*.ts" .
```

If this returns results, the file will either fail to deploy or silently return nothing.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Namespace — Corrected for v4.0](#2-namespace--corrected-for-v40)
3. [Directory Layout — Precise](#3-directory-layout--precise)
4. [Shared Infrastructure (`_lib/`)](#4-shared-infrastructure-_lib)
5. [Handler Template — The Only Acceptable Form](#5-handler-template--the-only-acceptable-form)
6. [Auth Model](#6-auth-model)
7. [Admin Auth — Corrected for v4.0](#7-admin-auth--corrected-for-v40)
8. [Client Routes (`/v1/client/*`)](#8-client-routes-v1client)
9. [Admin Routes (`/v1/admin/*`)](#9-admin-routes-v1admin)
10. [nhost.toml Constraints](#10-nhosttoml-constraints)
11. [Build & Deploy Checklist](#11-build--deploy-checklist)
12. [Environment Variables](#12-environment-variables)

---

## 1. Architecture

```
dropiti-nhost/
├── functions/              ← Nhost bundles everything under here
│   ├── _lib/               ← Shared infra — prefixed _ = not a route
│   ├── health.ts           → GET /v1/health
│   ├── echo.ts             → GET /v1/echo
│   ├── client/             → all /v1/client/* routes
│   └── admin/              → all /v1/admin/* routes
├── nhost/
│   └── nhost.toml          ← Nhost project config — Node version, JWT mode
└── secrets/
    └── dotsecrets.example  ← template; copy to repo-root .secrets locally
```

**Both frontends call the same base URL:**

```
https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run
```

- Admin console: `{BASE_URL}/v1/admin/<domain>/<action>`
- Client app: `{BASE_URL}/v1/client/<domain>/<action>`

---

## 2. Namespace — Corrected for v4.0

Previous versions (v1–v3) specified inconsistent namespaces. **This is the authoritative layout, taken directly from the live `api-guide.md`:**

| Namespace | On-disk path under `functions/` | URL prefix |
|---|---|---|
| Client app | `functions/client/<domain>/<action>.ts` | `/v1/client/...` |
| Admin console | `functions/admin/<domain>/<action>.ts` | `/v1/admin/...` |
| Ops | `functions/health.ts`, `functions/echo.ts` | `/v1/health`, `/v1/echo` |

> **How Nhost routing works:** Nhost maps the file path relative to `functions/` directly to the URL path under `/v1/`. So `functions/client/properties/get-listings.ts` becomes `GET /v1/client/properties/get-listings`. There is **no** `v1/` folder inside `functions/` — that would produce `/v1/v1/...`.

**Concrete examples from the live api-guide:**

```
functions/client/users/create-user.ts     → POST /v1/client/users/create-user
functions/admin/offers/incoming.ts        → GET  /v1/admin/offers/incoming
functions/health.ts                       → GET  /v1/health
```

---

## 3. Directory Layout — Precise

Every file listed here produces exactly one route. The `_lib/` prefix keeps helpers off the routing surface.

```
functions/
├── package.json            ← engines.node = "22"; module type CommonJS
├── package-lock.json       ← always committed
├── tsconfig.json           ← strict: true, target: ES2022, module: CommonJS
│
├── _lib/
│   ├── env.ts              ← ONLY place that reads process.env
│   ├── hasura.ts           ← hasuraQuery<T>()
│   ├── auth.ts             ← requireAuth(), getUserId(), requireAdminRole()
│   ├── respond.ts          ← ok(), fail()
│   ├── validate.ts         ← validate(req, res, ZodSchema)
│   ├── whatsapp.ts         ← WhatsApp service (stub/meta/twilio)
│   ├── airwallex.ts        ← Airwallex API client
│   ├── s3.ts               ← AWS S3 presigned URL helper
│   └── ratelimit.ts        ← Upstash sliding-window rate limiter
│
├── health.ts               → GET /v1/health          (no auth)
├── echo.ts                 → GET /v1/echo            (Bearer)
│
├── client/
│   ├── users/
│   │   ├── create-user.ts          → POST  /v1/client/users/create-user
│   │   ├── get-user-by-id.ts       → GET   /v1/client/users/get-user-by-id
│   │   ├── get-user-by-uuid.ts     → GET   /v1/client/users/get-user-by-uuid
│   │   └── update-user.ts          → PATCH /v1/client/users/update-user
│   │
│   ├── properties/
│   │   ├── create-property.ts      → POST   /v1/client/properties/create-property
│   │   ├── get-drafts.ts           → GET    /v1/client/properties/get-drafts
│   │   ├── delete-draft.ts         → DELETE /v1/client/properties/delete-draft
│   │   ├── publish-draft.ts        → POST   /v1/client/properties/publish-draft
│   │   ├── get-listings.ts         → GET    /v1/client/properties/get-listings
│   │   ├── get-property.ts         → GET    /v1/client/properties/get-property
│   │   ├── get-property-by-uuid.ts → GET    /v1/client/properties/get-property-by-uuid
│   │   ├── get-property-count-by-user.ts → GET /v1/client/properties/get-property-count-by-user
│   │   └── update-property.ts      → PATCH  /v1/client/properties/update-property
│   │
│   ├── offers/
│   │   ├── create-offer.ts         → POST /v1/client/offers/create-offer
│   │   ├── get-offers.ts           → GET  /v1/client/offers/get-offers
│   │   ├── get-offers-by-id.ts     → GET  /v1/client/offers/get-offers-by-id
│   │   ├── get-offers-by-initiator.ts → GET /v1/client/offers/get-offers-by-initiator
│   │   ├── accept-offer.ts         → POST /v1/client/offers/accept-offer
│   │   ├── reject-offer.ts         → POST /v1/client/offers/reject-offer
│   │   ├── counter-offer.ts        → POST /v1/client/offers/counter-offer
│   │   ├── withdraw-offer.ts       → POST /v1/client/offers/withdraw-offer
│   │   ├── get-negotiation-state.ts → GET /v1/client/offers/get-negotiation-state
│   │   ├── get-offer-actions.ts    → GET  /v1/client/offers/get-offer-actions
│   │   └── get-review-opportunities.ts → GET /v1/client/offers/get-review-opportunities
│   │
│   ├── reviews/
│   │   ├── create-review.ts        → POST   /v1/client/reviews/create-review
│   │   ├── update-review.ts        → PATCH  /v1/client/reviews/update-review
│   │   ├── delete-review.ts        → DELETE /v1/client/reviews/delete-review
│   │   ├── get-reviews-by-property.ts → GET /v1/client/reviews/get-reviews-by-property
│   │   ├── get-reviews-by-user.ts  → GET    /v1/client/reviews/get-reviews-by-user
│   │   └── mark-helpful.ts         → POST   /v1/client/reviews/mark-helpful
│   │
│   ├── tenants/
│   │   ├── index.ts                → GET        /v1/client/tenants/index
│   │   └── profile.ts              → GET, PATCH /v1/client/tenants/profile
│   │
│   ├── chat/
│   │   ├── get-or-create-room.ts   → POST /v1/client/chat/get-or-create-room
│   │   ├── get-chat-rooms.ts       → GET  /v1/client/chat/get-chat-rooms
│   │   ├── get-room-messages.ts    → GET  /v1/client/chat/get-room-messages
│   │   └── send-message.ts         → POST /v1/client/chat/send-message
│   │
│   ├── notifications/
│   │   ├── index.ts                → GET  /v1/client/notifications/index
│   │   ├── unread-count.ts         → GET  /v1/client/notifications/unread-count
│   │   ├── mark-read.ts            → POST /v1/client/notifications/mark-read
│   │   ├── mark-all-read.ts        → POST /v1/client/notifications/mark-all-read
│   │   └── archive.ts              → POST /v1/client/notifications/archive
│   │
│   ├── transfer-ownership/
│   │   ├── validate.ts             → GET  /v1/client/transfer-ownership/validate (PUBLIC)
│   │   └── claim.ts                → POST /v1/client/transfer-ownership/claim
│   │
│   └── upload/
│       └── presign.ts              → POST /v1/client/upload/presign
│
└── admin/
    ├── users/
    │   ├── index.ts                → GET    /v1/admin/users
    │   ├── get-user.ts             → GET    /v1/admin/users/get-user
    │   ├── update-user.ts          → PUT    /v1/admin/users/update-user
    │   ├── verify-user.ts          → POST   /v1/admin/users/verify-user
    │   ├── suspend-user.ts         → POST   /v1/admin/users/suspend-user
    │   ├── reactivate-user.ts      → POST   /v1/admin/users/reactivate-user
    │   ├── ban-user.ts             → POST   /v1/admin/users/ban-user
    │   ├── activity-log.ts         → GET    /v1/admin/users/activity-log
    │   ├── export-user-data.ts     → GET    /v1/admin/users/export-user-data
    │   ├── delete-user-data.ts     → DELETE /v1/admin/users/delete-user-data
    │   └── bulk.ts                 → POST   /v1/admin/users/bulk
    │
    ├── properties/
    │   ├── index.ts                → GET  /v1/admin/properties
    │   ├── get-property.ts         → GET  /v1/admin/properties/get-property
    │   ├── update-property.ts      → PUT  /v1/admin/properties/update-property
    │   ├── approve.ts              → POST /v1/admin/properties/approve
    │   ├── reject.ts               → POST /v1/admin/properties/reject
    │   ├── flag.ts                 → POST /v1/admin/properties/flag
    │   ├── feature.ts              → POST /v1/admin/properties/feature
    │   ├── bulk.ts                 → POST /v1/admin/properties/bulk
    │   ├── moderation-queue.ts     → GET  /v1/admin/properties/moderation-queue
    │   └── reports.ts              → GET  /v1/admin/properties/reports
    │
    ├── offers/
    │   ├── index.ts                → GET  /v1/admin/offers/index
    │   ├── get-offer.ts            → GET  /v1/admin/offers/get-offer
    │   ├── incoming.ts             → GET  /v1/admin/offers/incoming
    │   ├── incoming-detail.ts      → GET  /v1/admin/offers/incoming-detail
    │   ├── remind.ts               → POST /v1/admin/offers/remind
    │   ├── flag.ts                 → POST /v1/admin/offers/flag
    │   ├── cancel.ts               → POST /v1/admin/offers/cancel
    │   └── stalled.ts              → GET  /v1/admin/offers/stalled
    │
    ├── transfer-ownership/
    │   ├── invite.ts               → POST /v1/admin/transfer-ownership/invite
    │   ├── resend.ts               → POST /v1/admin/transfer-ownership/resend
    │   ├── status.ts               → GET  /v1/admin/transfer-ownership/status
    │   └── transfer.ts             → PUT  /v1/admin/transfer-ownership/transfer
    │
    ├── reviews/
    │   ├── moderation-queue.ts     → GET    /v1/admin/reviews/moderation-queue
    │   ├── approve.ts              → POST   /v1/admin/reviews/approve
    │   ├── reject.ts               → POST   /v1/admin/reviews/reject
    │   ├── update-review.ts        → PUT    /v1/admin/reviews/update-review
    │   └── delete-review.ts        → DELETE /v1/admin/reviews/delete-review
    │
    ├── reports/
    │   ├── index.ts                → GET  /v1/admin/reports/index
    │   ├── update.ts               → PUT  /v1/admin/reports/update
    │   ├── resolve.ts              → POST /v1/admin/reports/resolve
    │   └── summary.ts              → GET  /v1/admin/reports/summary
    │
    ├── analytics/
    │   ├── dashboard.ts            → GET  /v1/admin/analytics/dashboard
    │   ├── users.ts                → GET  /v1/admin/analytics/users
    │   ├── properties.ts           → GET  /v1/admin/analytics/properties
    │   ├── transactions.ts         → GET  /v1/admin/analytics/transactions
    │   ├── performance.ts          → GET  /v1/admin/analytics/performance
    │   ├── export.ts               → POST /v1/admin/analytics/export
    │   └── custom-report.ts        → POST /v1/admin/analytics/custom-report
    │
    ├── settings/
    │   ├── index.ts                → GET  /v1/admin/settings/index
    │   ├── update.ts               → PUT  /v1/admin/settings/update
    │   ├── feature-flags.ts        → GET  /v1/admin/settings/feature-flags
    │   ├── toggle-flag.ts          → POST /v1/admin/settings/toggle-flag
    │   ├── email-templates.ts      → GET  /v1/admin/settings/email-templates
    │   └── update-template.ts      → PUT  /v1/admin/settings/update-template
    │
    ├── support/
    │   ├── tickets/
    │   │   ├── index.ts            → GET  /v1/admin/support/tickets/index
    │   │   ├── get-ticket.ts       → GET  /v1/admin/support/tickets/get-ticket
    │   │   ├── create.ts           → POST /v1/admin/support/tickets/create
    │   │   ├── update.ts           → PUT  /v1/admin/support/tickets/update
    │   │   ├── reply.ts            → POST /v1/admin/support/tickets/reply
    │   │   ├── add-note.ts         → POST /v1/admin/support/tickets/add-note
    │   │   ├── assign.ts           → POST /v1/admin/support/tickets/assign
    │   │   └── close.ts            → POST /v1/admin/support/tickets/close
    │   └── canned-responses.ts     → GET  /v1/admin/support/canned-responses
    │
    ├── audit-logs/
    │   ├── index.ts                → GET /v1/admin/audit-logs/index
    │   ├── export.ts               → GET /v1/admin/audit-logs/export
    │   └── admin-activity.ts       → GET /v1/admin/audit-logs/admin-activity
    │
    ├── customers/                  ← Airwallex proxy
    │   ├── index.ts                → GET    /v1/admin/customers
    │   ├── get-customer.ts         → GET    /v1/admin/customers/get-customer
    │   ├── update-customer.ts      → PUT    /v1/admin/customers/update-customer
    │   ├── delete-customer.ts      → DELETE /v1/admin/customers/delete-customer
    │   └── client-secret.ts        → POST   /v1/admin/customers/client-secret
    │
    ├── payment-intents/            ← Airwallex proxy
    │   ├── index.ts                → GET /v1/admin/payment-intents
    │   ├── get-intent.ts           → GET /v1/admin/payment-intents/get-intent
    │   └── update-intent.ts        → PUT /v1/admin/payment-intents/update-intent
    │
    ├── payments/                   ← Airwallex proxy
    │   ├── cancel.ts               → POST /v1/admin/payments/cancel
    │   └── attach-method.ts        → POST /v1/admin/payments/attach-method
    │
    ├── beneficiaries/              ← Airwallex proxy
    │   ├── index.ts                → GET    /v1/admin/beneficiaries
    │   ├── get-beneficiary.ts      → GET    /v1/admin/beneficiaries/get-beneficiary
    │   ├── update-beneficiary.ts   → PUT    /v1/admin/beneficiaries/update-beneficiary
    │   └── delete-beneficiary.ts   → DELETE /v1/admin/beneficiaries/delete-beneficiary
    │
    ├── transfers/                  ← Airwallex proxy
    │   ├── index.ts                → GET  /v1/admin/transfers
    │   └── cancel.ts               → POST /v1/admin/transfers/cancel
    │
    └── upload/                     ← AWS S3 presigned PUT
        ├── presign.ts              → POST /v1/admin/upload/presign
        └── batch.ts                → POST /v1/admin/upload/batch
```

---

## 4. Shared Infrastructure (`_lib/`)

Files prefixed `_` are **never exposed as routes**. Import from these in handlers — never inline the logic.

### `_lib/env.ts` — single `process.env` reader

```ts
// This is the only file that reads process.env directly.
// All handlers import from here.
export const env = {
  // Hasura (auto-injected by Nhost + .secrets fallback)
  adminSecret:          process.env.NHOST_ADMIN_SECRET
                        ?? process.env.HASURA_GRAPHQL_ADMIN_SECRET,
  jwtSecret:            resolveJwtSecret(), // parses JSON {"key":"...","type":"HS256"}
  graphqlUrl:           process.env.NHOST_GRAPHQL_URL ?? buildGraphqlUrl(),

  // WhatsApp
  whatsappProvider:     (process.env.WHATSAPP_PROVIDER ?? 'stub') as 'stub'|'meta'|'twilio',
  whatsappApiToken:     process.env.WHATSAPP_API_TOKEN,
  whatsappPhoneId:      process.env.WHATSAPP_PHONE_NUMBER_ID,
  invitationExpiryDays: Number(process.env.INVITATION_EXPIRY_DAYS ?? '7'),

  // Airwallex
  airwallexApiKey:      process.env.AIRWALLEX_API_KEY,
  airwallexClientId:    process.env.AIRWALLEX_CLIENT_ID,
  airwallexEnv:         (process.env.AIRWALLEX_ENV ?? 'demo') as 'demo'|'prod',

  // AWS S3
  s3AccessKey:          process.env.S3_BUCKET_ACCESS_KEY,
  s3SecretKey:          process.env.S3_BUCKET_SECRET_KEY,
  s3DomainUrl:          process.env.S3_BUCKET_DOMAIN_URL,
  s3Region:             process.env.S3_BUCKET_AWS_REGION,
  s3BucketName:         process.env.S3_BUCKET_NAME,

  // Upstash Redis
  upstashRedisUrl:      process.env.UPSTASH_REDIS_REST_URL,
  upstashRedisToken:    process.env.UPSTASH_REDIS_REST_TOKEN,

  // CORS
  clientOrigin:         process.env.DROPITI_CLIENT_ORIGIN ?? '*',
}
```

### `_lib/respond.ts` — response envelope

```ts
import type { Response } from 'express'

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ ok: true, data })
}

export function fail(res: Response, message: string, status: number, details?: unknown): void {
  res.status(status).json({ ok: false, error: message, ...(details ? { details } : {}) })
}
```

### `_lib/auth.ts` — JWT verification

```ts
import type { Request, Response } from 'express'
import { jwtVerify } from 'jose'
import { env } from './env'
import { fail } from './respond'

export interface JWTPayload { [key: string]: unknown }

// Verifies Bearer token. Sends 401 and returns null on failure.
export async function requireAuth(req: Request, res: Response): Promise<JWTPayload | null> {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) { fail(res, 'Unauthorized', 401); return null }
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.jwtSecret))
    return payload as JWTPayload
  } catch {
    fail(res, 'Unauthorized', 401)
    return null
  }
}

// Extracts user UUID from payload. NEVER trust the request body for this.
export function getUserId(payload: JWTPayload): string {
  const claims = payload['https://hasura.io/jwt/claims'] as Record<string, unknown>
  return claims['x-hasura-user-id'] as string
}

// requireAuth() + checks x-hasura-allowed-roles for "admin". Sends 403 if absent.
export async function requireAdminRole(req: Request, res: Response): Promise<JWTPayload | null> {
  const payload = await requireAuth(req, res)
  if (!payload) return null
  const claims = payload['https://hasura.io/jwt/claims'] as Record<string, unknown>
  const roles = (claims?.['x-hasura-allowed-roles'] as string[]) ?? []
  if (!roles.includes('admin')) {
    fail(res, 'Forbidden', 403)
    return null
  }
  return payload
}
```

### `_lib/validate.ts` — Zod validation

```ts
import type { Request, Response } from 'express'
import { ZodSchema } from 'zod'
import { fail } from './respond'

export function validate<T>(req: Request, res: Response, schema: ZodSchema<T>): T | null {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    fail(res, 'Validation failed', 422, result.error.flatten())
    return null
  }
  return result.data
}
```

---

## 5. Handler Template — The Only Acceptable Form

Copy this exactly. Do not deviate from the signature, import paths, or structure.

### Client route handler

```ts
// functions/client/properties/get-listings.ts
import type { Request, Response } from 'express'
import { requireAuth } from '../../_lib/auth'
import { hasuraQuery } from '../../_lib/hasura'
import { ok, fail } from '../../_lib/respond'

const GET_LISTINGS = /* GraphQL */ `
  query GetListings($limit: Int!, $offset: Int!) {
    real_estate_property_listing(
      where: { status: { _eq: "published" } }
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
    ) {
      property_uuid
      title
      price
      location
    }
  }
`

export default async (req: Request, res: Response): Promise<void> => {
  try {
    // Auth is optional for listings — skip requireAuth or use it optionally
    const limit  = Math.min(Number(req.query.limit  ?? 20), 100)
    const offset = Number(req.query.offset ?? 0)

    const result = await hasuraQuery<{ real_estate_property_listing: unknown[] }>(
      GET_LISTINGS, { limit, offset }
    )
    if (result.errors?.length) return fail(res, 'Failed to fetch listings', 500)

    ok(res, { items: result.data?.real_estate_property_listing ?? [] })
  } catch (err) {
    console.error('[client/properties/get-listings]', err)
    fail(res, 'Internal server error', 500)
  }
}
```

### Admin route handler

```ts
// functions/admin/offers/incoming.ts
import type { Request, Response } from 'express'
import { requireAdminRole } from '../../_lib/auth'
import { hasuraQuery } from '../../_lib/hasura'
import { ok, fail } from '../../_lib/respond'

const GET_INCOMING_OFFERS = /* GraphQL */ `
  query GetIncomingOffers($limit: Int!, $offset: Int!) {
    real_estate_offer(
      where: {
        property_listing: { landlord_role: { _eq: "admin" } }
        status: { _neq: "withdrawn" }
      }
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
    ) {
      id
      status
      amount
      created_at
      property_listing {
        property_uuid
        title
        external_contact
      }
      initiator: user {
        display_name
        email
      }
    }
  }
`

export default async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Admin auth — returns null + sends 401/403 automatically if invalid
    const payload = await requireAdminRole(req, res)
    if (!payload) return

    // 2. Query params
    const limit  = Math.min(Number(req.query.limit  ?? 50), 100)
    const offset = Number(req.query.offset ?? 0)

    // 3. Hasura query
    const result = await hasuraQuery<{ real_estate_offer: unknown[] }>(
      GET_INCOMING_OFFERS, { limit, offset }
    )
    if (result.errors?.length) return fail(res, 'Failed to fetch offers', 500)

    // 4. Respond
    ok(res, { items: result.data?.real_estate_offer ?? [], limit, offset })
  } catch (err) {
    console.error('[admin/offers/incoming]', err)
    fail(res, 'Internal server error', 500)
  }
}
```

**Mandatory import depth rules:**

| Handler location | Import `_lib` as |
|---|---|
| `functions/client/<domain>/<file>.ts` | `../../_lib/...` |
| `functions/admin/<domain>/<file>.ts` | `../../_lib/...` |
| `functions/admin/support/tickets/<file>.ts` | `../../../_lib/...` |
| `functions/health.ts` | `./_lib/...` |

---

## 6. Auth Model

Both frontends authenticate via **Nhost Auth**. On sign-in, Nhost issues a JWT containing:

```json
{
  "https://hasura.io/jwt/claims": {
    "x-hasura-user-id": "<uuid>",
    "x-hasura-allowed-roles": ["user"],
    "x-hasura-default-role": "user"
  }
}
```

Admin users have `"admin"` in `x-hasura-allowed-roles`. This is set via Nhost Auth custom claims in the Nhost dashboard.

**Frontends send the Bearer token as a header — not a cookie:**

```ts
// admin console
const res = await fetch(
  'https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/admin/offers/incoming',
  {
    headers: {
      'Authorization': `Bearer ${nhost.auth.getAccessToken()}`,
      'Content-Type': 'application/json',
    }
  }
)
```

> Cookies are **not** forwarded to Functions on a different origin. The Bearer header is required. This is why `middleware.ts` in the admin console handles auth separately via the `nhost_access_token` cookie — it only guards page navigation, not Function calls.

---

## 7. Admin Auth — Corrected for v4.0

**Previous docs (v1–v3) mentioned `x-admin-secret` header for admin routes. This was wrong for Dropiti.** The `AI_Rules.md` mentions it as a pattern for other projects, but the Dropiti admin route auth uses **JWT role checking** via `requireAdminRole()`, not a separate secret header.

**Correct admin auth flow:**

```
1. Admin signs into admin console via Nhost Auth (signIn())
2. Nhost issues JWT with "admin" in x-hasura-allowed-roles
3. Admin console sends: Authorization: Bearer <nhost_access_token>
4. Nhost Function calls requireAdminRole(req, res)
5. requireAdminRole() calls requireAuth() first → verifies JWT signature
6. Then checks x-hasura-allowed-roles contains "admin"
7. Returns payload on success, sends 403 and returns null on failure
```

**Never do this in Dropiti admin routes:**

```ts
// ❌ WRONG for Dropiti — x-admin-secret is not used here
const adminSecret = req.headers['x-admin-secret']
if (adminSecret !== process.env.ADMIN_SECRET) {
  return fail(res, 'Forbidden', 403)
}
```

**Always do this:**

```ts
// ✅ CORRECT for Dropiti admin routes
const payload = await requireAdminRole(req, res)
if (!payload) return  // 401 or 403 already sent
```

---

## 8. Client Routes (`/v1/client/*`)

All routes require `Authorization: Bearer <token>` unless marked **Public**.

### Users
| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/client/users/create-user` | Create user profile post-signup. Body: `{ firebaseUid?, email, name }`. |
| `GET` | `/v1/client/users/get-user-by-id?id=` | Fetch by sequential ID. |
| `GET` | `/v1/client/users/get-user-by-uuid?uuid=` | Fetch by UUID. |
| `PATCH` | `/v1/client/users/update-user` | Update own profile. Scoped to `getUserId(payload)`. |

### Properties
| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/client/properties/create-property` | Create draft. |
| `GET` | `/v1/client/properties/get-drafts` | Drafts owned by JWT user. |
| `DELETE` | `/v1/client/properties/delete-draft?property_uuid=` | Delete own draft. |
| `POST` | `/v1/client/properties/publish-draft` | Draft → published. |
| `GET` | `/v1/client/properties/get-listings` | **Optional Bearer** — public feed. |
| `GET` | `/v1/client/properties/get-property?id=` | **Optional Bearer**. |
| `GET` | `/v1/client/properties/get-property-by-uuid?uuid=` | **Optional Bearer**. |
| `GET` | `/v1/client/properties/get-property-count-by-user` | Dashboard stat. |
| `PATCH` | `/v1/client/properties/update-property` | Update. Validates ownership. |

### Offers
| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/client/offers/create-offer` | Submit offer. Initiator from JWT. |
| `GET` | `/v1/client/offers/get-offers` | All visible to JWT user. |
| `GET` | `/v1/client/offers/get-offers-by-id?offerId=` | Single offer, access-checked. |
| `GET` | `/v1/client/offers/get-offers-by-initiator` | Offers by JWT user. |
| `POST` | `/v1/client/offers/accept-offer` | Landlord accepts. Ownership-checked. |
| `POST` | `/v1/client/offers/reject-offer` | Landlord rejects. |
| `POST` | `/v1/client/offers/counter-offer` | Counter. State machine validated. |
| `POST` | `/v1/client/offers/withdraw-offer` | Tenant withdraws own offer. |
| `GET` | `/v1/client/offers/get-negotiation-state?offerId=` | Current state. |
| `GET` | `/v1/client/offers/get-offer-actions?offerId=` | Role-aware permitted actions. |
| `GET` | `/v1/client/offers/get-review-opportunities` | Concluded offers eligible for review. |

### Reviews
| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/client/reviews/create-review` | Create on concluded offer. |
| `PATCH` | `/v1/client/reviews/update-review` | Edit own review. |
| `DELETE` | `/v1/client/reviews/delete-review?reviewId=` | Delete own review. |
| `GET` | `/v1/client/reviews/get-reviews-by-property?propertyUuid=` | **Optional Bearer**. |
| `GET` | `/v1/client/reviews/get-reviews-by-user?userId=` | **Optional Bearer**. |
| `POST` | `/v1/client/reviews/mark-helpful` | Vote helpful. One per user per review. |

### Transfer of Ownership (client-facing)
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/client/transfer-ownership/validate?token=` | **Public** | Validate invite token. Auto-expires stale tokens. |
| `POST` | `/v1/client/transfer-ownership/claim` | Bearer | Claim property. User ID from JWT only. |

### Chat, Notifications, Upload
See directory layout in §3 — routes map one-to-one from filenames.

---

## 9. Admin Routes (`/v1/admin/*`)

All routes require `requireAdminRole()`. Non-admin JWT → `403`. Missing token → `401`.

### Offers — Incoming & WhatsApp Outreach
| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/admin/offers/incoming` | All offers on admin-managed listings. Includes `whatsappOutreachUrl` when `external_contact` is set on the property. Params: `status`, `limit`, `offset`, `propertyUuid`. |
| `GET` | `/v1/admin/offers/incoming-detail?id=` | Single incoming offer detail. |
| `GET` | `/v1/admin/offers/stalled?daysSinceLastActivity=` | Default: 3 days. |

### Transfer Ownership (admin-side)
| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/admin/transfer-ownership/invite` | Creates `property_transfer_invitation` row + sends WhatsApp via `_lib/whatsapp.ts`. Body: `{ propertyUuid, externalContact?, offerId? }`. |
| `POST` | `/v1/admin/transfer-ownership/resend` | Cancels old token, creates new one, resends WhatsApp. |
| `GET` | `/v1/admin/transfer-ownership/status?propertyUuid=` | Returns invitation status for `AdminOfferCard` badge. |
| `PUT` | `/v1/admin/transfer-ownership/transfer` | Direct reassignment (no invite flow). |

### Upload — AWS S3 Presigned PUT
| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/v1/admin/upload/presign` | `{ filename: string, mimeType: string }` | `{ uploadUrl, s3Key, publicUrl, fileId }` |
| `POST` | `/v1/admin/upload/batch` | `Array<{ filename, mimeType }>` max 20 | `Array<{ uploadUrl, s3Key, publicUrl, filename }>` |

The `uploadUrl` is an S3 presigned PUT URL. The admin console PUTs the file directly to S3 — the Function never proxies the file bytes. S3 credentials (`S3_BUCKET_*`) live only in `.secrets`.

### Airwallex Proxy — Responses include `stub: true` when `AIRWALLEX_*` unset
| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/admin/customers` | List Airwallex customers |
| `GET` | `/v1/admin/customers/get-customer?id=` | Single customer |
| `PUT` | `/v1/admin/customers/update-customer` | Update customer |
| `DELETE` | `/v1/admin/customers/delete-customer` | Remove customer |
| `POST` | `/v1/admin/customers/client-secret` | Get payment client secret |
| `GET` | `/v1/admin/payment-intents` | List payment intents |
| `GET` | `/v1/admin/payment-intents/get-intent?id=` | Single intent |
| `PUT` | `/v1/admin/payment-intents/update-intent` | Update intent |
| `POST` | `/v1/admin/payments/cancel` | Cancel payment |
| `POST` | `/v1/admin/payments/attach-method` | Attach payment method |
| `GET` | `/v1/admin/beneficiaries` | List beneficiaries |
| `GET` | `/v1/admin/beneficiaries/get-beneficiary?id=` | Single beneficiary |
| `PUT` | `/v1/admin/beneficiaries/update-beneficiary` | Update |
| `DELETE` | `/v1/admin/beneficiaries/delete-beneficiary` | Remove |
| `GET` | `/v1/admin/transfers` | List transfers |
| `POST` | `/v1/admin/transfers/cancel` | Cancel transfer |

All Airwallex handlers must check `env.airwallexApiKey` at runtime and return `{ stub: true, data: [] }` if unset, to allow frontend development without live credentials.

---

## 10. nhost.toml Constraints

The `nhost/nhost.toml` must contain exactly these settings. Do not change them without updating `AI_Rules.md`.

```toml
[functions]
[functions.node]
version = 22

[auth]
[auth.tokens]
accessTokenExpiresIn = 900          # 15 minutes
refreshTokenExpiresIn = 43200       # 30 days

[auth.method.emailPassword]
enabled = true

[hasura]
[hasura.jwtSecrets]
type = "HS256"                      # Must match _lib/auth.ts
key  = "{{ secrets.HASURA_GRAPHQL_JWT_SECRET }}"
```

**Critical constraints from AI_Rules.md §1:**
- Node version in `nhost.toml` and `functions/package.json` `engines.node` must always match: `22`
- JWT mode `HS256` must not be changed without updating both `nhost.toml` and `_lib/auth.ts`
- Never commit `dist/` — Nhost bundles on deploy
- Always commit `functions/package-lock.json` with dependency changes

**`replaceConfig` null-section error:** If deploy fails with a null-section error, run `nhost config pull` and merge the diff into `nhost.toml`. Partial configs must not send `null` for required config objects like `auth` or `storage`.

---

## 11. Build & Deploy Checklist

Run before every push to `main`:

```bash
cd functions
npm run build              # must pass with zero errors
```

Then check:

- [ ] Zero TypeScript errors from `npm run build`
- [ ] Every handler file uses `export default async (req: Request, res: Response): Promise<void>`
- [ ] No lambda patterns: `grep -r "APIGatewayEvent\|statusCode.*body\|export const handler\|export function handler" --include="*.ts" .` → zero results
- [ ] No direct `process.env` reads outside `_lib/env.ts`: `grep -r "process\.env\." --include="*.ts" . | grep -v "_lib/env.ts"` → zero results
- [ ] No hardcoded secrets in source
- [ ] `functions/package-lock.json` committed with any new dependency
- [ ] `nhost.toml` still pins Node 22 and HS256
- [ ] `.secrets` is gitignored and not committed
- [ ] Import paths from `client/<domain>/` and `admin/<domain>/` use `../../_lib/` (two levels up)
- [ ] Import paths from `admin/support/tickets/` use `../../../_lib/` (three levels up)
- [ ] After deploy: `GET /v1/health` → `{ ok: true, data: { status: "ok" } }`
- [ ] Test one protected client route with valid user JWT → `200`
- [ ] Test one admin route with valid admin JWT → `200`
- [ ] Test same admin route with user JWT → `403`
- [ ] Test admin upload: `POST /v1/admin/upload/presign` with admin JWT → returns `uploadUrl` starting with your `S3_BUCKET_DOMAIN_URL`

---

## 12. Environment Variables

### Nhost Functions `.secrets` (repo root, never committed)

```bash
# Hasura (auto-injected by Nhost in cloud; needed in .secrets for local CLI)
HASURA_GRAPHQL_ADMIN_SECRET=...
HASURA_GRAPHQL_JWT_SECRET=...         # plain string value of the "key" field, not the full JSON

# WhatsApp
WHATSAPP_PROVIDER=stub                # stub | meta | twilio
WHATSAPP_API_TOKEN=                   # required when provider = meta or twilio
WHATSAPP_PHONE_NUMBER_ID=             # Meta Cloud API phone number ID
INVITATION_EXPIRY_DAYS=7

# Airwallex
AIRWALLEX_API_KEY=                    # server-only — never in admin console .env
AIRWALLEX_CLIENT_ID=
AIRWALLEX_ENV=demo                    # demo | prod

# AWS S3 (moved from admin console)
S3_BUCKET_ACCESS_KEY=your-aws-access-key-id
S3_BUCKET_SECRET_KEY=your-aws-secret-access-key
S3_BUCKET_DOMAIN_URL=https://your-bucket.s3.your-region.amazonaws.com
S3_BUCKET_AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=your-bucket-name

# Upstash Redis (moved from admin console)
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-rest-token

# CORS
DROPITI_CLIENT_ORIGIN=https://dropiti.com
```

### Admin console frontend `.env`

```bash
# Keep
NHOST_JWT_SECRET=your-nhost-jwt-secret   # middleware.ts JWT verify
NEXT_PUBLIC_NHOST_SUBDOMAIN=your-nhost-subdomain
NEXT_PUBLIC_NHOST_REGION=ap-southeast-1
NEXT_PUBLIC_SITE_URL=https://admin.example.com
NEXT_PUBLIC_AIRWALLEX_ENV=demo
AIRWALLEX_CLIENT_ID=your-airwallex-client-id

# New — base URL for all Function calls
NEXT_PUBLIC_FUNCTIONS_URL=https://your-subdomain.functions.ap-southeast-1.nhost.run

# Remove all of these — they moved to .secrets or are obsolete
# SDK_BACKEND_URL, HASURA_ADMIN_SECRET, HASURA_ENDPOINT
# S3_BUCKET_*, IMAGE_MAX_*
# UPSTASH_REDIS_*, AIRWALLEX_API_KEY
# JWT_SECRET, ROOT_EMAIL, ROOT_PASSWORD, NEXT_PUBLIC_API_URL
```

---

*Dropiti Unified Backend v4.0 — May 2026. This document supersedes v1–v3 on handler signature, namespace, and admin auth. Maintain alongside `AI_Rules.md`. Update version history on every structural change.*