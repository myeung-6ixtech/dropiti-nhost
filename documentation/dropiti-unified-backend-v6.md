# Dropiti — Unified Nhost Backend

---

## Version History

| Version | Date | Author | Summary of Changes |
|---|---|---|---|
| 1.0 | May 2026 | Platform Team | Initial unified backend — architecture, namespace, shared infra, auth model, client + admin route inventory. |
| 2.0 | May 2026 | Platform Team | Full admin interface expansion: property moderation, analytics, system config, support, audit logs. WhatsApp + Transfer Ownership. |
| 3.0 | May 2026 | Platform Team | Admin console decouple audit. Airwallex proxy Functions. Admin S3 upload. `_lib/s3.ts`, `_lib/airwallex.ts`, `_lib/ratelimit.ts`. |
| 4.0 | May 2026 | Platform Team | Lambda fix + precision update. Enforced `export default (req, res)` Express signature. Corrected `client/` directory prefix. Corrected admin auth to `requireAdminRole()`. |
| 5.0 | May 2026 | Platform Team | **Nhost API standard enforced as must-check §0.** Full handler standard derived from live Nhost docs (`getting-started`, `jwt-verification`, `error-handling`, `cors`, `runtimes`, `limits`). Precise CORS preflight handling. `invocationId` logging. Native dependency ban list. Timeout + payload limits. Response envelope locked. Complete annotated handler templates for client and admin routes. |
| 6.0 | May 2026 | Platform Team | **Properties listing query inconsistency documented and resolved.** Added §8a — Properties Listing vs Offers Incoming: Query Contracts. Documents the column-set divergence between `AdminListProperties` (full listing shape over `real_estate_property_listing`) and the offers incoming batched lookup (slim shape). Specifies all fields returned by each query, explains why they differ, and adds constraints for frontend consumers to prevent shape-mismatch bugs. Updated §8 Admin Routes properties section with full field inventory and the `AdminGetProperty` detail query. Added GraphQL document names as the authoritative identifier for each query. |

> **Governing rules:** `AI_Rules.md` in the repo is authoritative on project invariants. This document extends it with Dropiti-specific constraints and the full Nhost API standard. On conflict, `AI_Rules.md` wins except where this document cites live Nhost documentation directly — those override AI_Rules where they differ.
>
> **Nhost documentation sourced for v5.0:**
> - https://docs.nhost.io/products/functions/guides/getting-started
> - https://docs.nhost.io/products/functions/guides/jwt-verification
> - https://docs.nhost.io/products/functions/guides/error-handling
> - https://docs.nhost.io/products/functions/guides/cors
> - https://docs.nhost.io/products/functions/runtimes
> - https://docs.nhost.io/products/functions/limits

---

# §0 — NHOST FUNCTION API STANDARD (MUST CHECK FIRST)

> **This section is the first thing to verify before writing, reviewing, or deploying any function. Every rule here comes directly from Nhost's official documentation. A single violation can block deployment or silently break a route.**

---

## §0.1 — Handler Signature (sourced from docs/getting-started)

Nhost Functions run on a persistent Node.js HTTP server using an **Express-compatible interface**. They are **not** AWS Lambda, Vercel Edge, Cloudflare Workers, or any serverless event-based system.

### The one and only valid handler shape

```ts
import type { Request, Response } from 'express'

export default (req: Request, res: Response): void => {
  res.status(200).json({ ok: true })
}
```

Or with async:

```ts
import type { Request, Response } from 'express'

export default async (req: Request, res: Response): Promise<void> => {
  // async operations
  res.status(200).json({ ok: true })
}
```

### What is wrong and why it breaks deployment

| Pattern | Why it fails |
|---|---|
| `export const handler = async (event, context) => { return { statusCode, body } }` | AWS Lambda shape — Nhost cannot locate `default` export; `statusCode`/`body` return objects are not HTTP responses |
| `export function handler(req, res) { ... }` | Named export — Nhost's function loader only picks up `export default` |
| `export default async (event: APIGatewayEvent, context: Context) => { ... }` | AWS Lambda types — crashes because `res` is undefined; `event` has no `.body`/`.query` in Express form |
| `module.exports = (req, res) => { ... }` | CommonJS default — does not work; must use ES module `export default` even in CommonJS output |
| `return res.status(200).json(...)` | Never `return` the result of `res.json()` — the return type is `void`. Write to `res`, do not return. |

### Pre-push grep — run from `functions/`

```bash
# Any result here is a deploy blocker
grep -rn \
  "APIGatewayEvent\|LambdaContext\|statusCode.*body\|export const handler\|export function handler\|module\.exports" \
  --include="*.ts" .
```

Zero results required before every push.

---

## §0.2 — File-to-URL Routing (sourced from docs/getting-started)

Nhost maps the file path **relative to `functions/`** directly to the URL path under `/v1/`. There is no configuration — the file system is the router.

```
functions/health.ts                          → GET /v1/health
functions/client/users/create-user.ts        → POST /v1/client/users/create-user
functions/admin/offers/incoming.ts           → GET /v1/admin/offers/incoming
functions/admin/support/tickets/index.ts     → GET /v1/admin/support/tickets/index
```

**Rules that follow from this:**
- Never create a `functions/v1/` directory — that produces `/v1/v1/...`
- Never create an `index.ts` and expect it to answer the directory URL (e.g. `functions/client/users/index.ts` answers `/v1/client/users/index`, not `/v1/client/users/`)
- File and directory names must be `kebab-case` — they become URL path segments
- One file = one `export default` handler = one route
- Never import one route handler from another route handler

---

## §0.3 — Runtime & Package Manager (sourced from docs/runtimes)

**Runtime:** Node.js 22 — set in `nhost/nhost.toml`:
```toml
[functions.node]
version = 22
```

**Package manager:** npm (preferred for Dropiti). Nhost detects the manager from the lockfile present in `functions/` or a parent directory. Preference order: `npm` > `pnpm` > `yarn`.

- Commit `functions/package-lock.json` with every dependency change
- Never mix lockfiles (don't commit both `package-lock.json` and `yarn.lock`)
- `engines.node` in `functions/package.json` must match `nhost.toml`: `"22"`

---

## §0.4 — Native Dependencies (sourced from docs/limits)

Nhost bundles each function into a single JavaScript file during deployment. **Native binaries are stripped.** The following packages will silently fail or cause build errors and must never be added to `functions/package.json`:

| Banned package | Reason | Alternative |
|---|---|---|
| `sharp` | Native C++ image bindings | Client-side resize before upload, or Nhost Run |
| `bcrypt` | Native C bindings | `bcryptjs` (pure JS) |
| `better-sqlite3` | Embeds native SQLite binary | Use Hasura/PostgreSQL via `hasuraQuery()` |
| `canvas` | Native Cairo bindings | Not supported in Functions |
| Any `*.node` binary addon | Stripped at bundle time | Nhost Run for native code |

---

## §0.5 — Execution Limits (sourced from docs/limits)

| Limit | Value |
|---|---|
| Execution timeout (Starter plan) | **10 seconds** |
| Execution timeout (Pro plan) | **180 seconds** |
| Response payload hard cap | **6 MB** (all tiers) |

**Design constraints for Dropiti:**
- Paginate all list endpoints — never return unbounded result sets
- Default `limit` on all list endpoints: `20`; max: `100`
- Bulk operations (e.g. `admin/users/bulk`, `admin/upload/batch`) cap at **20 items** per request
- Analytics export routes that may exceed 6 MB must stream or return a job ID for async pickup
- Never fetch full image binaries through a Function — return presigned S3 URLs instead

---

## §0.6 — CORS (sourced from docs/cors)

Nhost injects these default CORS headers on every response unless your function overrides them:

| Header | Default value |
|---|---|
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Allow-Headers` | `origin, Accept, Authorization, Content-Type` |

`Access-Control-Allow-Methods` and `Access-Control-Allow-Credentials` are **not set by default** — you must set them.

**Dropiti standard for every handler that accepts non-GET methods:**

```ts
// Handle CORS preflight at the top of every handler that accepts PUT/PATCH/DELETE
// or sends custom headers (including Authorization)
export default async (req: Request, res: Response): Promise<void> => {
  // Preflight — browser sends OPTIONS before PUT/PATCH/DELETE/custom-header requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', env.clientOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    return res.status(204).end()
  }

  // Set CORS on every actual response too
  res.setHeader('Access-Control-Allow-Origin', env.clientOrigin)

  // ... rest of handler
}
```

`env.clientOrigin` is read from `DROPITI_CLIENT_ORIGIN` in `.secrets` (e.g. `https://dropiti.com`). In local development this is `*`. In production it must be the exact frontend origin — never `*` with credentials.

**When to handle preflight:**
- Any handler that accepts `PUT`, `PATCH`, or `DELETE` — always
- Any handler the admin console calls — always (different origin)
- `GET` handlers that are client-public (no auth) — optional but recommended

---

## §0.7 — JWT Verification (sourced from docs/jwt-verification)

Nhost uses **HS256** symmetric JWT signing for Dropiti. The raw secret string is in `HASURA_GRAPHQL_JWT_SECRET`. Nhost wraps this in JSON when it injects it as `NHOST_JWT_SECRET` — `_lib/env.ts` must parse the `.key` field.

**The `_lib/auth.ts` implementation must use `jose` (already in use) with this exact extraction pattern:**

```ts
import { jwtVerify } from 'jose'
import { env } from './env'

// env.jwtSecret is the raw string key extracted from HASURA_GRAPHQL_JWT_SECRET
// NOT the full JSON object that NHOST_JWT_SECRET contains

const secret = new TextEncoder().encode(env.jwtSecret)
const { payload } = await jwtVerify(token, secret)
```

**JWT payload structure from Nhost Auth — always present on authenticated requests:**

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

**`Authorization` header format — the only accepted form:**
```
Authorization: Bearer <nhost_access_token>
```

Cookies are not forwarded to Functions from a different origin. The Bearer header is mandatory for all cross-origin requests from the admin console and client app.

---

## §0.8 — Error Handling Standard (sourced from docs/error-handling)

Every handler must use `try/catch`. Unhandled errors return a generic 500 to the client with no detail — always catch and respond explicitly.

**From Nhost docs — best practices:**
- Log before responding: call `console.error()` before `res.json()` so the error is captured in logs even if the client disconnects
- Include `req.invocationId` in log messages to correlate a specific request in the Nhost logs dashboard
- Return structured errors with a consistent shape
- Use the correct HTTP status code — `400` bad input, `401`/`403` auth, `500` unexpected

**Dropiti standard error log format:**

```ts
console.error(`[admin/offers/incoming] invocation=${req.invocationId}`, err)
```

---

## §0.9 — Response Envelope (Dropiti standard, enforced via `_lib/respond.ts`)

All handlers must use `ok()` and `fail()` from `_lib/respond.ts`. Never write `res.json(...)` directly in a handler.

```
Success:  { ok: true,  data: <T> }
Failure:  { ok: false, error: "<message>", details?: <unknown> }
```

HTTP status codes:

| Code | When |
|---|---|
| `200` | Successful read or action |
| `201` | Resource created |
| `204` | Preflight OPTIONS response (no body) |
| `400` | Malformed request body or missing required field |
| `401` | No token, expired token, or invalid signature |
| `403` | Valid token but insufficient role or ownership |
| `404` | Resource not found or intentionally hidden |
| `422` | Body present but Zod validation failed |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error |

---

## §0.10 — Complete Annotated Handler Template

This is the reference implementation every new handler must follow. Read §0.1–§0.9 first — every line here maps to a rule above.

### Client route — with auth, Zod validation, and CORS

```ts
// functions/client/offers/create-offer.ts
import type { Request, Response } from 'express'
import { z } from 'zod'
import { requireAuth, getUserId } from '../../_lib/auth'   // two levels up from client/<domain>/
import { hasuraQuery }              from '../../_lib/hasura'
import { ok, fail }                from '../../_lib/respond'
import { validate }                from '../../_lib/validate'
import { env }                     from '../../_lib/env'

// GraphQL document at module scope — never inline
const CREATE_OFFER = /* GraphQL */ `
  mutation CreateOffer($propertyUuid: uuid!, $initiatorId: String!, $amount: numeric!, $terms: String) {
    insert_real_estate_offer_one(object: {
      property_uuid: $propertyUuid
      initiator_user_id: $initiatorId
      amount: $amount
      terms: $terms
      status: "pending"
    }) {
      id
      status
      created_at
    }
  }
`

// Zod schema at module scope — never inline in the handler
const CreateOfferSchema = z.object({
  propertyUuid: z.string().uuid(),
  amount:       z.number().positive(),
  terms:        z.string().optional(),
})

export default async (req: Request, res: Response): Promise<void> => {
  // §0.6 — CORS preflight (admin console + client app are different origins)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', env.clientOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    return res.status(204).end()
  }
  res.setHeader('Access-Control-Allow-Origin', env.clientOrigin)

  try {
    // §0.7 — Step 1: Auth (always first)
    const payload = await requireAuth(req, res)
    if (!payload) return           // 401 already sent by requireAuth

    // §0.7 — Extract user ID from JWT claims only — never from request body
    const initiatorId = getUserId(payload)

    // §0.8 / §0.9 — Step 2: Validate body with Zod
    const body = validate(req, res, CreateOfferSchema)
    if (!body) return              // 422 already sent by validate

    // Step 3: Business logic — Hasura mutation
    const result = await hasuraQuery<{
      insert_real_estate_offer_one: { id: number; status: string; created_at: string }
    }>(CREATE_OFFER, {
      propertyUuid: body.propertyUuid,
      initiatorId,
      amount:       body.amount,
      terms:        body.terms ?? null,
    })

    // §0.8 — Check Hasura errors before touching data
    if (result.errors?.length) {
      console.error(`[client/offers/create-offer] invocation=${req.invocationId}`, result.errors)
      return fail(res, 'Failed to create offer', 500)
    }

    // §0.9 — Respond with envelope
    ok(res, result.data?.insert_real_estate_offer_one, 201)

  } catch (err) {
    // §0.8 — Log with invocationId before responding
    console.error(`[client/offers/create-offer] invocation=${req.invocationId}`, err)
    fail(res, 'Internal server error', 500)
  }
}
```

### Admin route — with admin role check, CORS, and rate limiting

```ts
// functions/admin/offers/incoming.ts
import type { Request, Response } from 'express'
import { requireAdminRole } from '../../_lib/auth'   // two levels up from admin/<domain>/
import { hasuraQuery }      from '../../_lib/hasura'
import { ok, fail }        from '../../_lib/respond'
import { isAllowed }        from '../../_lib/ratelimit'
import { env }              from '../../_lib/env'

const GET_INCOMING_OFFERS = /* GraphQL */ `
  query GetIncomingOffers($limit: Int!, $offset: Int!, $status: String) {
    real_estate_offer(
      where: {
        property_listing: { landlord_role: { _eq: "admin" } }
        _and: [{ status: { _neq: "withdrawn" } }]
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
      user { display_name email }
    }
    real_estate_offer_aggregate(
      where: { property_listing: { landlord_role: { _eq: "admin" } } }
    ) { aggregate { count } }
  }
`

export default async (req: Request, res: Response): Promise<void> => {
  // §0.6 — CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', env.clientOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    return res.status(204).end()
  }
  res.setHeader('Access-Control-Allow-Origin', env.clientOrigin)

  try {
    // §0.7 / §7 — Admin auth: verifies JWT + checks x-hasura-allowed-roles for "admin"
    const payload = await requireAdminRole(req, res)
    if (!payload) return           // 401 or 403 already sent

    // Rate limit: 100 reads per 60 seconds per admin
    const adminId = (payload['https://hasura.io/jwt/claims'] as Record<string, unknown>)['x-hasura-user-id'] as string
    const allowed = await isAllowed(`admin:offers:incoming:${adminId}`, 100, 60)
    if (!allowed) return fail(res, 'Rate limit exceeded', 429)

    // Query params — validated inline (simple scalars only)
    const limit  = Math.min(Number(req.query.limit  ?? 50), 100)
    const offset = Number(req.query.offset ?? 0)

    const result = await hasuraQuery<{
      real_estate_offer: unknown[]
      real_estate_offer_aggregate: { aggregate: { count: number } }
    }>(GET_INCOMING_OFFERS, { limit, offset })

    if (result.errors?.length) {
      console.error(`[admin/offers/incoming] invocation=${req.invocationId}`, result.errors)
      return fail(res, 'Failed to fetch offers', 500)
    }

    ok(res, {
      items: result.data?.real_estate_offer ?? [],
      total: result.data?.real_estate_offer_aggregate.aggregate.count ?? 0,
      limit,
      offset,
    })

  } catch (err) {
    console.error(`[admin/offers/incoming] invocation=${req.invocationId}`, err)
    fail(res, 'Internal server error', 500)
  }
}
```

### Public route — no auth, CORS wildcard acceptable

```ts
// functions/client/transfer-ownership/validate.ts
import type { Request, Response } from 'express'
import { hasuraQuery } from '../../_lib/hasura'
import { ok, fail }   from '../../_lib/respond'

const GET_INVITATION = /* GraphQL */ `
  query GetInvitation($token: uuid!) {
    real_estate_property_transfer_invitation(
      where: { token_uuid: { _eq: $token } }
      limit: 1
    ) {
      id status expires_at
      property_listing { property_uuid title location }
    }
  }
`

export default async (req: Request, res: Response): Promise<void> => {
  // Public route — CORS wildcard is acceptable (no credentials)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }
  res.setHeader('Access-Control-Allow-Origin', '*')

  try {
    const token = req.query.token as string | undefined
    if (!token) return fail(res, 'token is required', 400)

    const result = await hasuraQuery<{
      real_estate_property_transfer_invitation: Array<{
        id: number; status: string; expires_at: string
        property_listing: { property_uuid: string; title: string; location: string }
      }>
    }>(GET_INVITATION, { token })

    if (result.errors?.length) {
      console.error(`[client/transfer-ownership/validate] invocation=${req.invocationId}`, result.errors)
      return fail(res, 'Failed to validate token', 500)
    }

    const invitation = result.data?.real_estate_property_transfer_invitation[0]
    if (!invitation) return ok(res, { status: 'invalid' })

    // Auto-expire if past expiry
    if (invitation.status === 'pending' && new Date(invitation.expires_at) < new Date()) {
      // Fire-and-forget expiry update — do not await to keep response fast
      hasuraQuery(`mutation { update_real_estate_property_transfer_invitation_by_pk(
        pk_columns: { id: ${invitation.id} }
        _set: { status: "expired" }
      ) { id } }`, {}).catch(() => {})
      return ok(res, { status: 'expired' })
    }

    ok(res, {
      status: invitation.status,
      property: invitation.status === 'valid' || invitation.status === 'pending'
        ? invitation.property_listing
        : undefined,
    })

  } catch (err) {
    console.error(`[client/transfer-ownership/validate] invocation=${req.invocationId}`, err)
    fail(res, 'Internal server error', 500)
  }
}
```

---

## §0.11 — Import Depth Rules

The `_lib/` directory is at `functions/_lib/`. Import depth depends on how many directory levels the handler file is below `functions/`:

| Handler file location | Import `_lib` as |
|---|---|
| `functions/health.ts` | `./_lib/auth` |
| `functions/echo.ts` | `./_lib/respond` |
| `functions/client/<domain>/<file>.ts` | `../../_lib/auth` |
| `functions/admin/<domain>/<file>.ts` | `../../_lib/auth` |
| `functions/admin/support/tickets/<file>.ts` | `../../../_lib/auth` |

**Wrong import paths cause `Cannot find module` at build time** — this is always a path depth error.

---

## §0.12 — Pre-Push Checklist (must pass before every commit to `main`)

```bash
cd functions

# 1. TypeScript build — zero errors required
npm run build

# 2. Lambda pattern check — zero results required
grep -rn "APIGatewayEvent\|LambdaContext\|statusCode.*body\|export const handler\|export function handler\|module\.exports" --include="*.ts" .

# 3. Raw process.env check — only _lib/env.ts may read process.env
grep -rn "process\.env\." --include="*.ts" . | grep -v "_lib/env\.ts"

# 4. Hardcoded secret check
grep -rn "AKIA\|sk_live\|Bearer [A-Za-z0-9]" --include="*.ts" .

# 5. Direct res.json() check — must use ok() / fail() only
grep -rn "res\.json\|res\.send\|res\.status" --include="*.ts" . | grep -v "_lib/respond\.ts"
```

All five must return zero results. Fix before pushing.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Namespace & Routing](#2-namespace--routing)
3. [Directory Layout](#3-directory-layout)
4. [Shared Infrastructure (`_lib/`)](#4-shared-infrastructure-_lib)
5. [Auth Model](#5-auth-model)
6. [Admin Auth](#6-admin-auth)
7. [Client Routes (`/v1/client/*`)](#7-client-routes-v1client)
8. [Admin Routes (`/v1/admin/*`)](#8-admin-routes-v1admin)
   - [8a. Properties Listing vs Offers Incoming — Query Contracts](#8a-properties-listing-vs-offers-incoming--query-contracts) ⭐ New in v6.0
9. [nhost.toml Constraints](#9-nhosttoml-constraints)
10. [Environment Variables](#10-environment-variables)

---

## 1. Architecture

```
dropiti-nhost/
├── functions/              ← Nhost bundles everything here; file path = URL
│   ├── _lib/               ← Shared infra — _ prefix keeps off routing surface
│   ├── health.ts           → GET /v1/health
│   ├── echo.ts             → GET /v1/echo
│   ├── client/             → /v1/client/* (dropiti-v3 frontend)
│   └── admin/              → /v1/admin/* (dropiti-admin-console)
├── nhost/
│   └── nhost.toml          ← Node version, JWT mode — must not change casually
└── secrets/
    └── dotsecrets.example  ← template; copy to repo-root .secrets locally
```

**Base URLs:**
- Cloud: `https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run`
- Local CLI: `https://local.functions.local.nhost.run`

Both frontends use the same Functions URL. Admin console prefix: `/v1/admin/`. Client app prefix: `/v1/client/`.

---

## 2. Namespace & Routing

Nhost routing is purely file-system-based. No configuration file. No router registration. The file path under `functions/` is the URL path under `/v1/`.

```
functions/client/properties/get-listings.ts
→ GET https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/client/properties/get-listings

functions/admin/offers/incoming.ts
→ GET https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/admin/offers/incoming

functions/health.ts
→ GET https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run/v1/health
```

---

## 3. Directory Layout

```
functions/
├── package.json            ← "engines": { "node": "22" }; type not set (CommonJS output)
├── package-lock.json       ← always committed
├── tsconfig.json           ← strict: true, target: ES2022, module: CommonJS
│
├── _lib/
│   ├── env.ts
│   ├── hasura.ts
│   ├── auth.ts
│   ├── respond.ts
│   ├── validate.ts
│   ├── whatsapp.ts
│   ├── airwallex.ts
│   ├── s3.ts
│   └── ratelimit.ts
│
├── health.ts               → GET /v1/health
├── echo.ts                 → GET /v1/echo
│
├── client/
│   ├── users/
│   │   ├── create-user.ts
│   │   ├── get-user-by-id.ts
│   │   ├── get-user-by-uuid.ts
│   │   └── update-user.ts
│   ├── properties/
│   │   ├── create-property.ts
│   │   ├── get-drafts.ts
│   │   ├── delete-draft.ts
│   │   ├── publish-draft.ts
│   │   ├── get-listings.ts
│   │   ├── get-property.ts
│   │   ├── get-property-by-uuid.ts
│   │   ├── get-property-count-by-user.ts
│   │   └── update-property.ts
│   ├── offers/
│   │   ├── create-offer.ts
│   │   ├── get-offers.ts
│   │   ├── get-offers-by-id.ts
│   │   ├── get-offers-by-initiator.ts
│   │   ├── accept-offer.ts
│   │   ├── reject-offer.ts
│   │   ├── counter-offer.ts
│   │   ├── withdraw-offer.ts
│   │   ├── get-negotiation-state.ts
│   │   ├── get-offer-actions.ts
│   │   └── get-review-opportunities.ts
│   ├── reviews/
│   │   ├── create-review.ts
│   │   ├── update-review.ts
│   │   ├── delete-review.ts
│   │   ├── get-reviews-by-property.ts
│   │   ├── get-reviews-by-user.ts
│   │   └── mark-helpful.ts
│   ├── tenants/
│   │   ├── index.ts
│   │   └── profile.ts
│   ├── chat/
│   │   ├── get-or-create-room.ts
│   │   ├── get-chat-rooms.ts
│   │   ├── get-room-messages.ts
│   │   └── send-message.ts
│   ├── notifications/
│   │   ├── index.ts
│   │   ├── unread-count.ts
│   │   ├── mark-read.ts
│   │   ├── mark-all-read.ts
│   │   └── archive.ts
│   ├── transfer-ownership/
│   │   ├── validate.ts     ← PUBLIC — no auth
│   │   └── claim.ts
│   └── upload/
│       └── presign.ts
│
└── admin/
    ├── users/
    │   ├── index.ts
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
    ├── properties/
    │   ├── list.ts
    │   ├── create-property.ts
    │   ├── get-property.ts
    │   ├── update-property.ts
    │   ├── approve.ts
    │   ├── reject.ts
    │   ├── flag.ts
    │   ├── feature.ts
    │   ├── bulk.ts
    │   ├── moderation-queue.ts
    │   └── reports.ts
    ├── offers/
    │   ├── index.ts
    │   ├── get-offer.ts
    │   ├── incoming.ts
    │   ├── incoming-detail.ts
    │   ├── remind.ts
    │   ├── flag.ts
    │   ├── cancel.ts
    │   └── stalled.ts
    ├── transfer-ownership/
    │   ├── invite.ts
    │   ├── resend.ts
    │   ├── status.ts
    │   └── transfer.ts
    ├── reviews/
    │   ├── moderation-queue.ts
    │   ├── approve.ts
    │   ├── reject.ts
    │   ├── update-review.ts
    │   └── delete-review.ts
    ├── reports/
    │   ├── index.ts
    │   ├── update.ts
    │   ├── resolve.ts
    │   └── summary.ts
    ├── analytics/
    │   ├── dashboard.ts
    │   ├── users.ts
    │   ├── properties.ts
    │   ├── transactions.ts
    │   ├── performance.ts
    │   ├── export.ts
    │   └── custom-report.ts
    ├── settings/
    │   ├── index.ts
    │   ├── update.ts
    │   ├── feature-flags.ts
    │   ├── toggle-flag.ts
    │   ├── email-templates.ts
    │   └── update-template.ts
    ├── support/
    │   ├── tickets/
    │   │   ├── index.ts        ← import _lib as ../../../_lib/...
    │   │   ├── get-ticket.ts
    │   │   ├── create.ts
    │   │   ├── update.ts
    │   │   ├── reply.ts
    │   │   ├── add-note.ts
    │   │   ├── assign.ts
    │   │   └── close.ts
    │   └── canned-responses.ts
    ├── audit-logs/
    │   ├── index.ts
    │   ├── export.ts
    │   └── admin-activity.ts
    ├── customers/              ← Airwallex proxy
    │   ├── index.ts
    │   ├── get-customer.ts
    │   ├── update-customer.ts
    │   ├── delete-customer.ts
    │   └── client-secret.ts
    ├── payment-intents/        ← Airwallex proxy
    │   ├── index.ts
    │   ├── get-intent.ts
    │   └── update-intent.ts
    ├── payments/               ← Airwallex proxy
    │   ├── cancel.ts
    │   └── attach-method.ts
    ├── beneficiaries/          ← Airwallex proxy
    │   ├── index.ts
    │   ├── get-beneficiary.ts
    │   ├── update-beneficiary.ts
    │   └── delete-beneficiary.ts
    ├── transfers/              ← Airwallex proxy
    │   ├── index.ts
    │   └── cancel.ts
    └── upload/                 ← AWS S3 presigned PUT
        ├── presign.ts
        └── batch.ts
```

---

## 4. Shared Infrastructure (`_lib/`)

### `_lib/env.ts`

Only file that reads `process.env`. All handlers import from here.

```ts
import type { Request, Response } from 'express'

function resolveJwtSecret(): string {
  const raw = process.env.NHOST_JWT_SECRET ?? process.env.HASURA_GRAPHQL_JWT_SECRET ?? ''
  try {
    // Nhost injects NHOST_JWT_SECRET as JSON: { "key": "...", "type": "HS256" }
    const parsed = JSON.parse(raw)
    return parsed.key ?? raw
  } catch {
    return raw  // plain string (local .secrets format)
  }
}

function buildGraphqlUrl(): string {
  const sub    = process.env.NHOST_SUBDOMAIN
  const region = process.env.NHOST_REGION
  if (!sub || !region) throw new Error('NHOST_SUBDOMAIN and NHOST_REGION are required')
  return `https://${sub}.hasura.${region}.nhost.run/v1/graphql`
}

export const env = {
  adminSecret:          process.env.NHOST_ADMIN_SECRET ?? process.env.HASURA_GRAPHQL_ADMIN_SECRET ?? '',
  jwtSecret:            resolveJwtSecret(),
  graphqlUrl:           process.env.NHOST_GRAPHQL_URL ?? buildGraphqlUrl(),
  clientOrigin:         process.env.DROPITI_CLIENT_ORIGIN ?? '*',
  whatsappProvider:     (process.env.WHATSAPP_PROVIDER ?? 'stub') as 'stub' | 'meta' | 'twilio',
  whatsappApiToken:     process.env.WHATSAPP_API_TOKEN ?? '',
  whatsappPhoneId:      process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  invitationExpiryDays: Number(process.env.INVITATION_EXPIRY_DAYS ?? '7'),
  airwallexApiKey:      process.env.AIRWALLEX_API_KEY ?? '',
  airwallexClientId:    process.env.AIRWALLEX_CLIENT_ID ?? '',
  airwallexEnv:         (process.env.AIRWALLEX_ENV ?? 'demo') as 'demo' | 'prod',
  s3AccessKey:          process.env.S3_BUCKET_ACCESS_KEY ?? '',
  s3SecretKey:          process.env.S3_BUCKET_SECRET_KEY ?? '',
  s3DomainUrl:          process.env.S3_BUCKET_DOMAIN_URL ?? '',
  s3Region:             process.env.S3_BUCKET_AWS_REGION ?? '',
  s3BucketName:         process.env.S3_BUCKET_NAME ?? '',
  upstashRedisUrl:      process.env.UPSTASH_REDIS_REST_URL ?? '',
  upstashRedisToken:    process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
}
```

### `_lib/respond.ts`

```ts
import type { Response } from 'express'

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ ok: true, data })
}

export function fail(res: Response, message: string, status: number, details?: unknown): void {
  res.status(status).json({ ok: false, error: message, ...(details !== undefined ? { details } : {}) })
}
```

### `_lib/auth.ts`

```ts
import type { Request, Response } from 'express'
import { jwtVerify }  from 'jose'
import { env }        from './env'
import { fail }       from './respond'

export type JWTPayload = Record<string, unknown>

function getHasuraClaims(payload: JWTPayload): Record<string, unknown> {
  return (payload['https://hasura.io/jwt/claims'] as Record<string, unknown>) ?? {}
}

export async function requireAuth(req: Request, res: Response): Promise<JWTPayload | null> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    fail(res, 'Unauthorized', 401)
    return null
  }
  const token  = header.slice(7)
  const secret = new TextEncoder().encode(env.jwtSecret)
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as JWTPayload
  } catch {
    fail(res, 'Unauthorized', 401)
    return null
  }
}

// Extracts user UUID. Source: JWT claims only — never trust request body.
export function getUserId(payload: JWTPayload): string {
  return getHasuraClaims(payload)['x-hasura-user-id'] as string
}

// requireAuth() + admin role check. Returns null and sends 403 if not admin.
export async function requireAdminRole(req: Request, res: Response): Promise<JWTPayload | null> {
  const payload = await requireAuth(req, res)
  if (!payload) return null
  const roles = (getHasuraClaims(payload)['x-hasura-allowed-roles'] as string[]) ?? []
  if (!roles.includes('admin')) {
    fail(res, 'Forbidden', 403)
    return null
  }
  return payload
}
```

### `_lib/validate.ts`

```ts
import type { Request, Response } from 'express'
import type { ZodSchema }         from 'zod'
import { fail }                   from './respond'

export function validate<T>(req: Request, res: Response, schema: ZodSchema<T>): T | null {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    fail(res, 'Validation failed', 422, result.error.flatten())
    return null
  }
  return result.data
}
```

### `_lib/hasura.ts`

```ts
import { env } from './env'

interface HasuraResponse<T> {
  data?:   T
  errors?: Array<{ message: string; extensions?: unknown }>
}

export async function hasuraQuery<T>(
  document:   string,
  variables?: Record<string, unknown>,
): Promise<HasuraResponse<T>> {
  const res = await fetch(env.graphqlUrl, {
    method:  'POST',
    headers: {
      'Content-Type':           'application/json',
      'x-hasura-admin-secret':  env.adminSecret,
    },
    body: JSON.stringify({ query: document, variables }),
  })
  if (!res.ok) throw new Error(`Hasura HTTP ${res.status}`)
  return res.json() as Promise<HasuraResponse<T>>
}
```

---

## 5. Auth Model

Both frontends authenticate via Nhost Auth. JWTs are issued on `signIn()` and contain Hasura claims.

**The Bearer token is required in the `Authorization` header for all protected routes:**
```
Authorization: Bearer <nhost_access_token>
```

Cookies are not forwarded cross-origin. The admin console and client app must send the header explicitly.

**Admin users** must have `"admin"` in `x-hasura-allowed-roles`. Set via Nhost Dashboard → Auth → Custom Claims:
```json
{
  "https://hasura.io/jwt/claims": {
    "x-hasura-allowed-roles": ["user", "admin"],
    "x-hasura-default-role": "user",
    "x-hasura-user-id": "{{profile.id}}"
  }
}
```

---

## 6. Admin Auth

Admin routes use `requireAdminRole()` only — not `x-admin-secret`. See `_lib/auth.ts` above.

```ts
const payload = await requireAdminRole(req, res)
if (!payload) return   // 401 (bad/missing JWT) or 403 (not admin) already sent
```

---

## 7. Client Routes (`/v1/client/*`)

All require `Authorization: Bearer` unless marked **Public**. Pagination defaults: `limit=20`, max `100`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/v1/client/users/create-user` | Bearer | User ID from JWT |
| `GET` | `/v1/client/users/get-user-by-id?id=` | Bearer | |
| `GET` | `/v1/client/users/get-user-by-uuid?uuid=` | Bearer | |
| `PATCH` | `/v1/client/users/update-user` | Bearer | Scoped to JWT user |
| `POST` | `/v1/client/properties/create-property` | Bearer | |
| `GET` | `/v1/client/properties/get-drafts` | Bearer | JWT user's drafts only |
| `DELETE` | `/v1/client/properties/delete-draft?property_uuid=` | Bearer | Ownership checked |
| `POST` | `/v1/client/properties/publish-draft` | Bearer | |
| `GET` | `/v1/client/properties/get-listings` | Optional | Public feed |
| `GET` | `/v1/client/properties/get-property?id=` | Optional | |
| `GET` | `/v1/client/properties/get-property-by-uuid?uuid=` | Optional | |
| `GET` | `/v1/client/properties/get-property-count-by-user` | Bearer | |
| `PATCH` | `/v1/client/properties/update-property` | Bearer | Ownership checked |
| `POST` | `/v1/client/offers/create-offer` | Bearer | Initiator from JWT |
| `GET` | `/v1/client/offers/get-offers` | Bearer | |
| `GET` | `/v1/client/offers/get-offers-by-id?offerId=` | Bearer | Access-checked |
| `GET` | `/v1/client/offers/get-offers-by-initiator` | Bearer | JWT user only |
| `POST` | `/v1/client/offers/accept-offer` | Bearer | Landlord, ownership checked |
| `POST` | `/v1/client/offers/reject-offer` | Bearer | Landlord |
| `POST` | `/v1/client/offers/counter-offer` | Bearer | State machine validated |
| `POST` | `/v1/client/offers/withdraw-offer` | Bearer | Tenant only |
| `GET` | `/v1/client/offers/get-negotiation-state?offerId=` | Bearer | |
| `GET` | `/v1/client/offers/get-offer-actions?offerId=` | Bearer | Role-aware |
| `GET` | `/v1/client/offers/get-review-opportunities` | Bearer | |
| `POST` | `/v1/client/reviews/create-review` | Bearer | |
| `PATCH` | `/v1/client/reviews/update-review` | Bearer | Own review only |
| `DELETE` | `/v1/client/reviews/delete-review?reviewId=` | Bearer | Own review only |
| `GET` | `/v1/client/reviews/get-reviews-by-property?propertyUuid=` | Optional | |
| `GET` | `/v1/client/reviews/get-reviews-by-user?userId=` | Optional | |
| `POST` | `/v1/client/reviews/mark-helpful` | Bearer | One vote per user |
| `GET` | `/v1/client/tenants/index` | Bearer | |
| `GET`, `PATCH` | `/v1/client/tenants/profile` | Bearer | |
| `GET` | `/v1/client/transfer-ownership/validate?token=` | **Public** | No auth |
| `POST` | `/v1/client/transfer-ownership/claim` | Bearer | User ID from JWT |
| `POST` | `/v1/client/upload/presign` | Bearer | Returns S3 presigned PUT URL |
| `POST` | `/v1/client/chat/get-or-create-room` | Bearer | |
| `GET` | `/v1/client/chat/get-chat-rooms` | Bearer | |
| `GET` | `/v1/client/chat/get-room-messages?roomId=` | Bearer | |
| `POST` | `/v1/client/chat/send-message` | Bearer | Sender from JWT |
| `GET` | `/v1/client/notifications/index` | Bearer | |
| `GET` | `/v1/client/notifications/unread-count` | Bearer | |
| `POST` | `/v1/client/notifications/mark-read` | Bearer | |
| `POST` | `/v1/client/notifications/mark-all-read` | Bearer | |
| `POST` | `/v1/client/notifications/archive` | Bearer | |

---

## 8. Admin Routes (`/v1/admin/*`)

All require `requireAdminRole()`. Non-admin JWT → `403`. Missing/invalid JWT → `401`. Airwallex routes return `{ stub: true }` when `AIRWALLEX_API_KEY` is unset.

### Core admin routes

| Method | Path | Notes |
|---|---|---|
| `GET` | `/v1/admin/users` | Params: `search`, `limit`, `offset`, `status` |
| `GET` | `/v1/admin/users/get-user?userId=` | |
| `PUT` | `/v1/admin/users/update-user` | |
| `POST` | `/v1/admin/users/verify-user` | |
| `POST` | `/v1/admin/users/suspend-user` | |
| `POST` | `/v1/admin/users/reactivate-user` | |
| `POST` | `/v1/admin/users/ban-user` | |
| `GET` | `/v1/admin/users/activity-log?userId=` | |
| `GET` | `/v1/admin/users/export-user-data?userId=` | Max 6 MB response cap applies |
| `DELETE` | `/v1/admin/users/delete-user-data` | |
| `POST` | `/v1/admin/users/bulk` | Max 20 items |

### Properties routes ⭐ Updated in v6.0

> **Two different query shapes exist for `real_estate_property_listing` depending on context. See §8a for the full contract. Never assume the shape from one route matches the other.**

| Method | Path | Query name | Notes |
|---|---|---|---|
| `GET` | `/v1/admin/properties/list` | `AdminListProperties` | Full listing shape — see §8a; **BFF:** `GET admin/properties` → this path |
| `GET` | `/v1/admin/properties/get-property?propertyUuid=` | `AdminGetProperty` | Single property — full shape plus relations |
| `PUT` | `/v1/admin/properties/update-property` | — | Body: `{ propertyUuid, updates, reason }` |
| `POST` | `/v1/admin/properties/approve` | — | Body: `{ propertyUuid, notes? }` |
| `POST` | `/v1/admin/properties/reject` | — | Body: `{ propertyUuid, reason }` |
| `POST` | `/v1/admin/properties/flag` | — | Body: `{ propertyUuid, flagType, reason }` |
| `POST` | `/v1/admin/properties/feature` | — | Body: `{ propertyUuid, featured, featureUntil? }` |
| `POST` | `/v1/admin/properties/bulk` | — | Max 20 items |
| `GET` | `/v1/admin/properties/moderation-queue` | `AdminModerationQueue` | Only `pending_review` status; sorted by priority score |
| `GET` | `/v1/admin/properties/reports` | — | Query param: `propertyUuid=` |

### Offers routes

| Method | Path | Notes |
|---|---|---|
| `GET` | `/v1/admin/offers/incoming` | Includes `whatsappOutreachUrl` when `external_contact` set. Batched slim property shape — see §8a |
| `GET` | `/v1/admin/offers/incoming-detail?id=` | |
| `GET` | `/v1/admin/offers/stalled?daysSinceLastActivity=` | Default 3 |
| `POST` | `/v1/admin/transfer-ownership/invite` | Creates DB row + WhatsApp via `_lib/whatsapp.ts` |
| `POST` | `/v1/admin/transfer-ownership/resend` | Cancels old, creates new, resends |
| `GET` | `/v1/admin/transfer-ownership/status?propertyUuid=` | For AdminOfferCard badge |
| `PUT` | `/v1/admin/transfer-ownership/transfer` | Direct reassignment |
| `GET` | `/v1/admin/analytics/dashboard` | |
| `POST` | `/v1/admin/analytics/export` | Async; returns job ID if result > 5 MB |

---

## 8a. Properties Listing vs Offers Incoming — Query Contracts ⭐ New in v6.0

> **This section exists because these two contexts both touch `real_estate_property_listing` but return different column sets. Mixing them up causes frontend shape-mismatch bugs where fields render as `undefined` even though the query succeeded.**

---

### Why two shapes exist

`GET /v1/admin/properties/list` (or **`GET admin/properties`** via the admin console BFF) — the **Properties page** — needs the full administrative picture of each listing: status, completion, ownership, moderation state, all media.

`GET /v1/admin/offers/incoming` — the **Admin Offer Inbox** — queries `real_estate_offer` as the primary table, then does a **batched lookup** on `real_estate_property_listing` to resolve just enough context to render each offer card and construct the WhatsApp outreach URL. It deliberately omits heavy fields to keep the payload small.

These are **not interchangeable**. A frontend component that renders the properties management table must call `GET /v1/admin/properties/list` (or BFF `GET admin/properties`) and expect the full shape. A component that renders an offer card must call `GET /v1/admin/offers/incoming` and expect the slim shape. Never use offers incoming to populate the properties page or vice versa.

---

### Shape 1 — `AdminListProperties` (properties list query)

**GraphQL document name:** `AdminListProperties`
**Used by:** `functions/admin/properties/list.ts`  
**Called from:** `GET /v1/admin/properties/list` (BFF: `GET admin/properties`)
**Primary table:** `real_estate_property_listing`

#### Fields returned per item

```ts
interface AdminPropertyListItem {
  // Identity
  id:                   number        // sequential DB id
  property_uuid:        string        // UUID — use this for all cross-references
  
  // Listing content
  title:                string
  description:          string | null
  property_type:        string        // e.g. "apartment", "house", "commercial"
  listing_type:         string        // e.g. "rent", "sale"
  rental_price:         number | null
  sale_price:           number | null
  currency:             string        // e.g. "MYR"
  
  // Location
  address:              string | null
  city:                 string | null
  state:                string | null
  country:              string | null
  postal_code:          string | null
  latitude:             number | null
  longitude:            number | null
  
  // Ownership and admin management
  landlord_user_id:     string        // Nhost Auth user UUID of the owner
  landlord_role:        string        // "user" | "admin" — "admin" means admin-managed listing
  external_contact:     string | null // E.164 digits for WhatsApp outreach (admin-managed listings)
  
  // Status and moderation
  status:               string        // "draft" | "pending_review" | "published" | "rejected" | "archived"
  is_flagged:           boolean
  flag_reason:          string | null
  moderation_notes:     string | null
  quality_score:        number | null // 0–100 set by admin on approve
  is_featured:          boolean
  featured_until:       string | null // ISO timestamp
  
  // Progress tracking
  completion_percentage: number       // 0–100 — how complete the listing is
  
  // Media
  images:               string[]      // array of S3 public URLs
  primary_image:        string | null // first/hero image URL
  
  // Timestamps
  created_at:           string        // ISO timestamp
  updated_at:           string        // ISO timestamp
  published_at:         string | null
}
```

#### Pagination and filters

```
GET /v1/admin/properties/list
  ?limit=20          default 20, max 100
  &offset=0
  &status=           filter by status enum (omit for all)
  &flagged=true      filter flagged-only listings
  &landlordId=       filter by landlord_user_id (UUID)
  &search=           partial match on title, address, city
  &sortBy=created_at|updated_at|rental_price|completion_percentage
```

#### Response envelope

```json
{
  "ok": true,
  "data": {
    "items": [ /* AdminPropertyListItem[] */ ],
    "total": 142,
    "limit": 20,
    "offset": 0
  }
}
```

---

### Shape 2 — Batched slim property lookup inside `AdminIncomingOffers`

**GraphQL document name:** `AdminIncomingOffers` (primary) + batched `AdminPropertyBatch` (secondary)
**Used by:** `functions/admin/offers/incoming.ts`
**Called from:** `GET /v1/admin/offers/incoming`
**Primary table:** `real_estate_offer`
**Secondary lookup table:** `real_estate_property_listing` (slim — batched by `property_uuid`)

The incoming offers handler queries `real_estate_offer` for all offers on admin-managed listings, collects the distinct `property_uuid` values from the result set, then runs a **single batched query** against `real_estate_property_listing` keyed on those UUIDs. This batched lookup returns only the fields needed to render an offer card and build the WhatsApp outreach URL.

#### Fields returned in the slim property shape (per offer item)

```ts
interface AdminOfferPropertyContext {
  id:               number        // sequential DB id
  property_uuid:    string        // UUID
  title:            string        // listing title for offer card heading
  external_contact: string | null // E.164 digits — used to build whatsappOutreachUrl
  rental_price:     number | null // shown on the offer card
}
```

#### Fields NOT present in the slim shape (present in `AdminListProperties` only)

```
description, property_type, listing_type, sale_price, currency,
address, city, state, country, postal_code, latitude, longitude,
landlord_user_id, landlord_role, status, is_flagged, flag_reason,
moderation_notes, quality_score, is_featured, featured_until,
completion_percentage, images, primary_image, published_at
```

If your frontend tries to read any of these from an offer card's property context, it will get `undefined`. This is expected — the offers incoming route does not fetch them. To display full property detail from an offer, make a separate call to `GET /v1/admin/properties/get-property?propertyUuid=`.

#### Offer item shape returned by `/v1/admin/offers/incoming`

```ts
interface AdminIncomingOffer {
  // Offer fields
  id:                   number
  status:               string        // "pending" | "accepted" | "rejected" | "countered" | "withdrawn"
  amount:               number
  terms:                string | null
  created_at:           string
  updated_at:           string
  
  // Slim property context (from batched lookup — see slim shape above)
  property_listing: {
    id:               number
    property_uuid:    string
    title:            string
    external_contact: string | null
    rental_price:     number | null
  }
  
  // Initiator (tenant)
  user: {
    display_name: string | null
    email:        string
  }
  
  // Computed by handler — present only when property_listing.external_contact is set
  whatsappOutreachUrl: string | null
}
```

#### Response envelope

```json
{
  "ok": true,
  "data": {
    "items": [ /* AdminIncomingOffer[] */ ],
    "total": 8,
    "limit": 50,
    "offset": 0
  }
}
```

---

### Shape 3 — `AdminGetProperty` (single property detail)

**GraphQL document name:** `AdminGetProperty`
**Used by:** `functions/admin/properties/get-property.ts`
**Called from:** `GET /v1/admin/properties/get-property?propertyUuid=`

Returns everything in `AdminPropertyListItem` plus:

```ts
interface AdminPropertyDetail extends AdminPropertyListItem {
  // Moderation history
  moderation_records: Array<{
    id:          string
    action:      string    // "approved" | "rejected" | "flagged" | "featured"
    moderator_id: string
    reason:      string | null
    notes:       string | null
    created_at:  string
  }>
  
  // Filed reports against this property
  reports: Array<{
    id:           string
    report_type:  string
    description:  string | null
    status:       string
    severity:     string | null
    created_at:   string
  }>
  
  // Offer summary
  offer_count:         number
  active_offer_count:  number
}
```

---

### Constraint table — which fields exist where

| Field | `AdminListProperties` | Offers slim lookup | `AdminGetProperty` |
|---|---|---|---|
| `property_uuid` | ✅ | ✅ | ✅ |
| `title` | ✅ | ✅ | ✅ |
| `external_contact` | ✅ | ✅ | ✅ |
| `rental_price` | ✅ | ✅ | ✅ |
| `landlord_user_id` | ✅ | ❌ | ✅ |
| `landlord_role` | ✅ | ❌ | ✅ |
| `completion_percentage` | ✅ | ❌ | ✅ |
| `status` | ✅ | ❌ | ✅ |
| `is_flagged` | ✅ | ❌ | ✅ |
| `quality_score` | ✅ | ❌ | ✅ |
| `images` | ✅ | ❌ | ✅ |
| `primary_image` | ✅ | ❌ | ✅ |
| `city`, `address`, location fields | ✅ | ❌ | ✅ |
| `moderation_records` | ❌ | ❌ | ✅ |
| `reports` | ❌ | ❌ | ✅ |
| `offer_count` | ❌ | ❌ | ✅ |
| `whatsappOutreachUrl` | ❌ | ✅ (computed) | ❌ |

---

### Frontend constraints — enforced by this document

**Do:**
- Use `GET /v1/admin/properties/list` (or BFF `GET admin/properties`) and the `AdminPropertyListItem` shape for the properties management table and moderation queue
- Use `GET /v1/admin/offers/incoming` and the `AdminIncomingOffer` shape for the offer inbox and `AdminOfferCard`
- When a user clicks through from an offer card to view full property details, make a separate call to `GET /v1/admin/properties/get-property?propertyUuid=` — do not try to derive it from the offer shape
- TypeScript: define separate types for each shape (`AdminPropertyListItem`, `AdminIncomingOffer`, `AdminPropertyDetail`) — do not use a single merged type

**Do not:**
- Populate the properties management table from `GET /v1/admin/offers/incoming` — the slim shape is missing required columns (`status`, `completion_percentage`, `images`, etc.)
- Try to read `completion_percentage`, `status`, `is_flagged`, `images`, or location fields from within an `AdminIncomingOffer` — they are `undefined` by design
- Assume `external_contact` is always present — it is `null` on listings that have a real Nhost Auth landlord owner; only admin-managed listings populate it
- Merge the two response shapes client-side to avoid a second round-trip — the shapes serve different UI surfaces with different field requirements
- Use `id` (sequential integer) as an external reference — always use `property_uuid`

---

### Debugging the inconsistency

If the properties page is broken but the offers inbox works (or vice versa), the failure is almost always one of three things:

**1. Wrong endpoint called**
Check which URL the component is fetching. The properties page must call `/v1/admin/properties/list` (or BFF `admin/properties`), not `/v1/admin/offers/incoming`.

**2. Field read from wrong shape**
A component reading `item.status` or `item.completion_percentage` from an offer's `property_listing` context will get `undefined` because those fields are not in the slim shape. Check the field against the constraint table above.

**3. GraphQL query missing a column in Hasura**
If a field returns `null` for every row (not `undefined`), the column exists in the TypeScript type but is not selected in the GraphQL document. Check the `AdminListProperties` or `AdminGetProperty` document in the handler file and ensure the column is listed. New columns added to `real_estate_property_listing` (like `external_contact` or `completion_percentage`) must be explicitly added to both the GraphQL document and the TypeScript interface.

Confirm the column exists and is tracked in Hasura:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'real_estate'
  AND table_name   = 'property_listing'
ORDER BY ordinal_position;
```

If the column is missing from this result, it needs a database migration before the GraphQL document can select it.

---

### Upload routes (AWS S3 presigned PUT)

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/v1/admin/upload/presign` | `{ filename, mimeType }` | `{ uploadUrl, s3Key, publicUrl }` |
| `POST` | `/v1/admin/upload/batch` | `[{ filename, mimeType }]` max 20 | `[{ uploadUrl, s3Key, publicUrl, filename }]` |

The `uploadUrl` is an S3 presigned PUT URL. The client PUTs the file directly — the Function never proxies file bytes. S3 credentials live in `.secrets` only.

### Airwallex proxy routes

| Method | Path |
|---|---|
| `GET` | `/v1/admin/customers` |
| `GET` | `/v1/admin/customers/get-customer?id=` |
| `PUT` | `/v1/admin/customers/update-customer` |
| `DELETE` | `/v1/admin/customers/delete-customer` |
| `POST` | `/v1/admin/customers/client-secret` |
| `GET` | `/v1/admin/payment-intents` |
| `GET` | `/v1/admin/payment-intents/get-intent?id=` |
| `PUT` | `/v1/admin/payment-intents/update-intent` |
| `POST` | `/v1/admin/payments/cancel` |
| `POST` | `/v1/admin/payments/attach-method` |
| `GET` | `/v1/admin/beneficiaries` |
| `GET` | `/v1/admin/beneficiaries/get-beneficiary?id=` |
| `PUT` | `/v1/admin/beneficiaries/update-beneficiary` |
| `DELETE` | `/v1/admin/beneficiaries/delete-beneficiary` |
| `GET` | `/v1/admin/transfers` |
| `POST` | `/v1/admin/transfers/cancel` |

---

## 9. nhost.toml Constraints

```toml
[functions]
[functions.node]
version = 22          # must match functions/package.json engines.node
```

**JWT mode:** `HS256` — set in Hasura JWT Secret config in Nhost Dashboard. Must match `_lib/auth.ts` `jwtVerify` call. Do not change without updating both.

**`replaceConfig` null error:** If deploy fails with a config null-section error, run `nhost config pull` and merge the diff. Partial configs must not send `null` for required objects like `auth` or `storage`.

---

## 10. Environment Variables

### Nhost Functions `.secrets` (repo root — never committed)

```bash
# Hasura (auto-injected in cloud; needed in .secrets for local Nhost CLI)
HASURA_GRAPHQL_ADMIN_SECRET=...
HASURA_GRAPHQL_JWT_SECRET=...    # plain key string — NOT the full JSON object

# CORS
DROPITI_CLIENT_ORIGIN=https://dropiti.com   # exact frontend origin in production

# WhatsApp
WHATSAPP_PROVIDER=stub           # stub | meta | twilio
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
INVITATION_EXPIRY_DAYS=7

# Airwallex (server-only — never in frontend .env)
AIRWALLEX_API_KEY=
AIRWALLEX_CLIENT_ID=
AIRWALLEX_ENV=demo               # demo | prod

# AWS S3 (moved from admin console .env)
S3_BUCKET_ACCESS_KEY=AKIAUJJYJXEZ5DERETX6
S3_BUCKET_SECRET_KEY=...
S3_BUCKET_DOMAIN_URL=https://tastyplates-bucket.s3.ap-northeast-2.amazonaws.com
S3_BUCKET_AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=tastyplates-bucket

# Upstash Redis (moved from admin console .env)
UPSTASH_REDIS_REST_URL=https://selected-bear-31650.upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

### Admin console frontend `.env`

```bash
# Keep
NHOST_JWT_SECRET=...                              # middleware.ts JWT verify (jose)
NEXT_PUBLIC_NHOST_SUBDOMAIN=fcuycyemqprjrkbshlcj
NEXT_PUBLIC_NHOST_REGION=ap-southeast-1
NEXT_PUBLIC_SITE_URL=https://admin.dropiti.com
NEXT_PUBLIC_AIRWALLEX_ENV=demo
AIRWALLEX_CLIENT_ID=WyQ2_hk4TlaAnOuaOSV1FQ       # browser-safe Airwallex Elements

# Add
NEXT_PUBLIC_FUNCTIONS_URL=https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run

# Remove (all moved to Functions .secrets or obsolete)
# SDK_BACKEND_URL  HASURA_ADMIN_SECRET  HASURA_ENDPOINT
# S3_BUCKET_*  IMAGE_MAX_*
# UPSTASH_REDIS_*  AIRWALLEX_API_KEY
# JWT_SECRET  ROOT_EMAIL  ROOT_PASSWORD  NEXT_PUBLIC_API_URL
```

---

*Dropiti Unified Backend v5.0 — May 2026. §0 (the Nhost API Standard) is the must-check section and is authoritative over all prior versions. Maintain alongside `AI_Rules.md` and `api-guide.md` in the repo. Update version history on every structural change.*