# Dropiti — Unified Nhost Backend

---

## Version History

| Version | Date | Author | Summary of Changes |
|---|---|---|---|
| 1.0 | May 2026 | Platform Team | Initial unified backend document — architecture decision, namespace strategy, directory layout, shared infra, auth model, client + admin route inventory, deprecation list, Hasura roles, storage, subscriptions, coding standards, migration sequence, env vars. |
| 2.0 | May 2026 | Platform Team | Added full admin interface expansion from `admin-interface-functions.md`: property moderation, content moderation, analytics & reporting, system configuration, support & ticketing, audit logs. Added Admin Offer Inbox with WhatsApp outreach. Added Transfer Ownership Invitation (database schema, WhatsApp service layer, all 5 routes, UI component spec, token lifecycle). Updated directory layout. Added new env vars (`WHATSAPP_*`, `INVITATION_EXPIRY_DAYS`). Added new database tables. Updated migration sequence with Phase 2a (Transfer Ownership) and Phase 2b (Full Admin Expansion). |

> **Implementation note:** Deployed client handlers use the `/v1/client/<domain>/<action>` prefix (files under `functions/client/`), not flat `/v1/<domain>/...`. Admin handlers use `/v1/admin/...` as documented below.
>
> **Governing rules:** All code must satisfy every constraint in `AI_Rules.md`. This document does not repeat them — it references them. When a rule below conflicts with `AI_Rules.md`, `AI_Rules.md` wins.
>
> **Sources:** `client-side-functions.md`, `admin-side-functions.md`, `admin-interface-functions.md`, `AI_Rules.md`, `boilerplate.md`, `nhost-guide.md`

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
   - [7.4 Admin Offer Inbox & WhatsApp Outreach](#74-admin-offer-inbox--whatsapp-outreach) ⭐ New in v2.0
   - [7.5 Transfer Ownership Invitation](#75-transfer-ownership-invitation) ⭐ New in v2.0
   - [7.6 Content Moderation](#76-content-moderation)
   - [7.7 Analytics & Reporting](#77-analytics--reporting)
   - [7.8 System Configuration](#78-system-configuration)
   - [7.9 Support & Ticketing](#79-support--ticketing)
   - [7.10 Audit Logs](#710-audit-logs)
8. [Shared / Cross-Cutting Routes](#8-shared--cross-cutting-routes)
9. [Routes Deprecated on Migration](#9-routes-deprecated-on-migration)
10. [Hasura Role Strategy](#10-hasura-role-strategy)
11. [Database Schema Additions](#11-database-schema-additions) ⭐ New in v2.0
12. [WhatsApp Service Layer](#12-whatsapp-service-layer) ⭐ New in v2.0
13. [Nhost Storage — Upload Replacement](#13-nhost-storage--upload-replacement)
14. [Real-Time — Subscriptions](#14-real-time--subscriptions)
15. [Coding Standards Cheatsheet](#15-coding-standards-cheatsheet)
16. [Migration Sequence](#16-migration-sequence)
17. [Environment Variables Reference](#17-environment-variables-reference)

---

## 1. Architecture Decision

### Current state (two separate repos, two backends)

```
dropiti-v3 (Next.js)
  └── src/app/api/v1/*        ← ~55 REST routes, Hasura via admin secret
  └── src/app/api/graphql/*   ← GraphQL proxy + browser/server clients

dropiti-admin-console (Next.js)
  └── src/app/api/login       ← PBKDF2 session auth (legacy)
  └── src/app/api/auth/check  ← Session validation
  └── src/app/api/auth/logout ← Session teardown
  └── middleware.ts           ← JWT guard (already on Nhost nhost_access_token)
```

### Target state (one Nhost Functions repo)

```
dropiti-nhost (Nhost Functions)
  └── functions/<domain>/*    ← All client-facing business logic  → URL /v1/<domain>/...
  └── functions/admin/*       ← All admin-facing operations       → URL /v1/admin/...
  └── functions/_lib/*        ← Shared infra (auth, hasura, env, respond, validate)
  └── functions/health.ts     ← Operational health check          → URL /v1/health
```

> **Routing note:** Nhost maps `functions/<path>.ts` to `{FUNCTIONS_URL}/v1/<path>`. Do **not** nest a `v1/` folder under `functions/` — that would produce `/v1/v1/...`.

**Both frontends call the same Nhost Functions URL.** Client routes live at `/v1/<domain>/` and admin routes at `/v1/admin/<domain>/`. Auth role enforcement (`user` vs `admin`) enforces the boundary at the execution level.

---

## 2. URL Namespace Strategy

```
{FUNCTIONS_URL}/v1/health                        ← Operational ping
{FUNCTIONS_URL}/v1/<domain>/<action>             ← Client app routes
{FUNCTIONS_URL}/v1/admin/<domain>/<action>       ← Admin console routes
```

### Frontend base URL config

**`dropiti-v3` (client app):**
```ts
const API = `${process.env.NEXT_PUBLIC_FUNCTIONS_URL}/v1`
// e.g. GET `${API}/properties/get-listings`
```

**`dropiti-admin-console`:**
```ts
const ADMIN_API = `${process.env.NEXT_PUBLIC_FUNCTIONS_URL}/v1/admin`
// e.g. GET `${ADMIN_API}/users`
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
│   ├── whatsapp.ts                ← WhatsApp service layer ⭐ New v2.0
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
│   ├── index.ts                   ← GET /v1/tenants
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
├── transfer-ownership/            ← Public/user-facing ownership transfer ⭐ New v2.0
│   ├── validate.ts                ← GET  /v1/transfer-ownership/validate?token=
│   └── claim.ts                   ← POST /v1/transfer-ownership/claim
│
├── upload/
│   └── presign.ts
│
└── admin/
    ├── users/
    │   ├── index.ts               ← GET    /v1/admin/users
    │   ├── get-user.ts            ← GET    /v1/admin/users/:userId
    │   ├── update-user.ts         ← PUT    /v1/admin/users/:userId
    │   ├── verify-user.ts         ← POST   /v1/admin/users/:userId/verify
    │   ├── suspend-user.ts        ← POST   /v1/admin/users/:userId/suspend
    │   ├── reactivate-user.ts     ← POST   /v1/admin/users/:userId/reactivate
    │   ├── ban-user.ts            ← POST   /v1/admin/users/:userId/ban
    │   ├── activity-log.ts        ← GET    /v1/admin/users/:userId/activity
    │   ├── export-user-data.ts    ← GET    /v1/admin/users/:userId/export
    │   ├── delete-user-data.ts    ← DELETE /v1/admin/users/:userId/data
    │   └── bulk.ts                ← POST   /v1/admin/users/bulk
    │
    ├── properties/
    │   ├── index.ts               ← GET  /v1/admin/properties
    │   ├── get-property.ts        ← GET  /v1/admin/properties/:propertyUuid
    │   ├── approve.ts             ← POST /v1/admin/properties/:propertyUuid/approve
    │   ├── reject.ts              ← POST /v1/admin/properties/:propertyUuid/reject
    │   ├── flag.ts                ← POST /v1/admin/properties/:propertyUuid/flag
    │   ├── update-property.ts     ← PUT  /v1/admin/properties/:propertyUuid
    │   ├── feature.ts             ← POST /v1/admin/properties/:propertyUuid/feature
    │   ├── bulk.ts                ← POST /v1/admin/properties/bulk
    │   ├── moderation-queue.ts    ← GET  /v1/admin/properties/moderation-queue
    │   └── reports.ts             ← GET  /v1/admin/properties/:propertyUuid/reports
    │
    ├── offers/
    │   ├── index.ts               ← GET  /v1/admin/offers
    │   ├── get-offer.ts           ← GET  /v1/admin/offers/:offerId
    │   ├── incoming.ts            ← GET  /v1/admin/offers/incoming ⭐ New v2.0
    │   ├── remind.ts              ← POST /v1/admin/offers/:offerId/remind
    │   ├── flag.ts                ← POST /v1/admin/offers/:offerId/flag
    │   ├── cancel.ts              ← POST /v1/admin/offers/:offerId/cancel
    │   └── stalled.ts             ← GET  /v1/admin/offers/stalled
    │
    ├── transfer-ownership/        ← Admin-side ownership transfer ⭐ New v2.0
    │   ├── invite.ts              ← POST /v1/admin/transfer-ownership/invite
    │   ├── resend.ts              ← POST /v1/admin/transfer-ownership/resend
    │   └── status.ts              ← GET  /v1/admin/transfer-ownership/status
    │
    ├── reviews/
    │   ├── moderation-queue.ts    ← GET  /v1/admin/reviews/moderation-queue
    │   ├── approve.ts             ← POST /v1/admin/reviews/:reviewUuid/approve
    │   ├── reject.ts              ← POST /v1/admin/reviews/:reviewUuid/reject
    │   └── update-review.ts       ← PUT  /v1/admin/reviews/:reviewUuid
    │
    ├── reports/
    │   ├── index.ts               ← GET  /v1/admin/reports
    │   ├── update.ts              ← PUT  /v1/admin/reports/:reportId
    │   ├── resolve.ts             ← POST /v1/admin/reports/:reportId/resolve
    │   └── summary.ts             ← GET  /v1/admin/reports/summary
    │
    ├── analytics/
    │   ├── dashboard.ts           ← GET  /v1/admin/analytics/dashboard
    │   ├── users.ts               ← GET  /v1/admin/analytics/users
    │   ├── properties.ts          ← GET  /v1/admin/analytics/properties
    │   ├── transactions.ts        ← GET  /v1/admin/analytics/transactions
    │   ├── performance.ts         ← GET  /v1/admin/analytics/performance
    │   ├── export.ts              ← POST /v1/admin/analytics/export
    │   └── custom-report.ts       ← POST /v1/admin/analytics/custom-report
    │
    ├── settings/
    │   ├── index.ts               ← GET  /v1/admin/settings
    │   ├── update.ts              ← PUT  /v1/admin/settings
    │   ├── feature-flags.ts       ← GET  /v1/admin/feature-flags
    │   ├── toggle-flag.ts         ← POST /v1/admin/feature-flags/:flagKey/toggle
    │   ├── email-templates.ts     ← GET  /v1/admin/email-templates
    │   └── update-template.ts     ← PUT  /v1/admin/email-templates/:templateId
    │
    ├── support/
    │   ├── tickets/
    │   │   ├── index.ts           ← GET  /v1/admin/support/tickets
    │   │   ├── get-ticket.ts      ← GET  /v1/admin/support/tickets/:ticketId
    │   │   ├── create.ts          ← POST /v1/admin/support/tickets
    │   │   ├── update.ts          ← PUT  /v1/admin/support/tickets/:ticketId
    │   │   ├── reply.ts           ← POST /v1/admin/support/tickets/:ticketId/reply
    │   │   ├── add-note.ts        ← POST /v1/admin/support/tickets/:ticketId/notes
    │   │   ├── assign.ts          ← POST /v1/admin/support/tickets/:ticketId/assign
    │   │   └── close.ts           ← POST /v1/admin/support/tickets/:ticketId/close
    │   └── canned-responses.ts    ← GET  /v1/admin/support/canned-responses
    │
    └── audit-logs/
        ├── index.ts               ← GET /v1/admin/audit-logs
        ├── export.ts              ← GET /v1/admin/audit-logs/export
        └── admin-activity.ts      ← GET /v1/admin/audit-logs/admin/:adminId
```

---

## 4. Shared Infrastructure (`_lib/`)

### `_lib/env.ts`
The only file that reads `process.env` directly.

```ts
export const env = {
  adminSecret:         process.env.NHOST_ADMIN_SECRET ?? process.env.HASURA_GRAPHQL_ADMIN_SECRET,
  jwtSecret:           resolveJwtSecret(),        // parses JSON wrapper for HS256
  graphqlUrl:          process.env.NHOST_GRAPHQL_URL ?? buildGraphqlUrl(),
  whatsappProvider:    process.env.WHATSAPP_PROVIDER ?? 'stub',
  whatsappApiToken:    process.env.WHATSAPP_API_TOKEN,
  whatsappPhoneId:     process.env.WHATSAPP_PHONE_NUMBER_ID,
  invitationExpiryDays: Number(process.env.INVITATION_EXPIRY_DAYS ?? '7'),
}
```

### `_lib/hasura.ts`
Single shared GraphQL client. GraphQL documents live at module scope in route files — never inline.

```ts
export async function hasuraQuery<T>(
  document: string,
  variables?: Record<string, unknown>
): Promise<{ data?: T; errors?: { message: string }[] }>
```

### `_lib/auth.ts`

```ts
// Verifies Bearer token (HS256). Returns null + sends 401 if invalid.
export async function requireAuth(req: Request, res: Response): Promise<JWTPayload | null>

// Extracts user UUID from verified JWT. Never trust request body for this.
export function getUserId(payload: JWTPayload): string

// requireAuth() + checks x-hasura-allowed-roles for "admin". Sends 403 if absent.
export async function requireAdminRole(req: Request, res: Response): Promise<JWTPayload | null>
```

### `_lib/respond.ts`

```ts
export function ok(res: Response, data: unknown, status = 200): void
export function fail(res: Response, message: string, status: number, details?: unknown): void
// Shapes: { ok: true, data: T } | { ok: false, error: string, details?: unknown }
```

### `_lib/validate.ts`

```ts
export function validate<T>(req: Request, res: Response, schema: ZodSchema<T>): T | null
```

### `_lib/whatsapp.ts` ⭐ New in v2.0

Provider-agnostic WhatsApp service. Active provider set by `WHATSAPP_PROVIDER` env var.

```ts
interface WhatsAppResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendOwnershipInvitation(
  externalContact: string,   // E.164 digits, no + prefix e.g. "60123456789"
  params: {
    propertyTitle: string
    invitationUrl: string
    expiryDays: number
  }
): Promise<WhatsAppResult>
```

| `WHATSAPP_PROVIDER` | Behaviour |
|---|---|
| `stub` (default) | Logs to console, returns fake message ID — safe for development |
| `meta` | Meta Cloud API — requires `WHATSAPP_API_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` |
| `twilio` | Twilio WhatsApp Business — add provider class when selected |

---

## 5. Auth Model — Unified

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

Admin users have `"admin"` in `x-hasura-allowed-roles`, configured via Nhost Auth custom claims.

### What replaces the old admin auth routes

| Old route | Replacement |
|---|---|
| `POST /api/login` (PBKDF2) | Nhost Auth `signIn()` via `@nhost/nextjs` |
| `GET /api/auth/check` | `useAuthenticationStatus()` / `getSession()` |
| `POST /api/auth/logout` | Nhost Auth `signOut()` |
| `middleware.ts` JWT guard | Keep as-is — already reads `nhost_access_token` + verifies via `jose` |

### Handler auth patterns

**Client route:**
```ts
export default async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = await requireAuth(req, res)
    if (!payload) return
    const userId = getUserId(payload)
    ok(res, result)
  } catch (err) {
    console.error('[users/update-user]', err)
    fail(res, 'Internal server error', 500)
  }
}
```

**Admin route:**
```ts
export default async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = await requireAdminRole(req, res)
    if (!payload) return
    ok(res, result)
  } catch (err) {
    console.error('[admin/offers/incoming]', err)
    fail(res, 'Internal server error', 500)
  }
}
```

---

## 6. Client API Routes (`v1/`)

All routes require a valid Nhost JWT (`requireAuth`). Acting user always derived from JWT — never from request body fields.

### Users
| Route | Method | Description |
|---|---|---|
| `users/create-user` | `POST` | Create user profile post-signup. Consider Hasura event trigger instead. |
| `users/get-user-by-id` | `GET` | Fetch by sequential ID. Query param: `id`. |
| `users/get-user-by-uuid` | `GET` | Fetch by UUID. Query param: `uuid`. |
| `users/update-user` | `PATCH` | Update own profile. Scoped to `getUserId(payload)`. |

### Tenants
| Route | Method | Description |
|---|---|---|
| `tenants/index` | `GET` | List tenants scoped to landlord's properties. |
| `tenants/profile` | `GET / PATCH` | Read or update authenticated user's tenant profile. |

### Properties
| Route | Method | Description |
|---|---|---|
| `properties/create-property` | `POST` | Create a draft property. |
| `properties/get-drafts` | `GET` | Drafts owned by `getUserId(payload)`. |
| `properties/delete-draft` | `DELETE` | Delete a draft. Validates ownership. |
| `properties/publish-draft` | `POST` | Draft → published. Body: `{ propertyId }`. |
| `properties/get-listings` | `GET` | Public-facing published feed. Auth optional. |
| `properties/get-property` | `GET` | Fetch by slug. |
| `properties/get-property-by-uuid` | `GET` | Fetch by UUID. |
| `properties/get-property-count-by-user` | `GET` | Count for dashboard stat. |
| `properties/update-property` | `PATCH` | Update fields. Validates ownership. |

### Offers
| Route | Method | Description |
|---|---|---|
| `offers/create-offer` | `POST` | Submit offer. Initiator set from JWT. |
| `offers/get-offers` | `GET` | All offers visible to JWT user. |
| `offers/get-offers-by-id` | `GET` | Single offer, access-checked. |
| `offers/get-offers-by-initiator` | `GET` | Offers by `getUserId(payload)`. |
| `offers/accept-offer` | `POST` | Landlord accepts. Ownership-checked. Triggers notification. |
| `offers/reject-offer` | `POST` | Landlord rejects. Ownership-checked. Triggers notification. |
| `offers/counter-offer` | `POST` | Counter against state machine. |
| `offers/withdraw-offer` | `POST` | Tenant withdraws own offer. |
| `offers/get-negotiation-state` | `GET` | Current negotiation state. |
| `offers/get-offer-actions` | `GET` | Role-aware permitted actions for JWT user. |
| `offers/get-review-opportunities` | `GET` | Concluded offers eligible for review. |

### Reviews
| Route | Method | Description |
|---|---|---|
| `reviews/create-review` | `POST` | Create review on concluded offer. |
| `reviews/update-review` | `PATCH` | Edit own review. |
| `reviews/delete-review` | `DELETE` | Delete own review. Admin delete is a separate route. |
| `reviews/get-reviews-by-property` | `GET` | All reviews for a property. |
| `reviews/get-reviews-by-user` | `GET` | All reviews for a user. |
| `reviews/mark-helpful` | `POST` | Vote helpful. One per JWT user per review. |

### Chat
> Migrate read paths to Hasura subscriptions when stable. These routes are bridging logic.

| Route | Method | Description |
|---|---|---|
| `chat/get-or-create-room` | `POST` | Find or create room. Body: `{ otherUserId }`. |
| `chat/get-chat-rooms` | `GET` | All rooms for JWT user. |
| `chat/get-room-messages` | `GET` | Message history. Params: `roomId`, `limit`, `before`. |
| `chat/send-message` | `POST` | Insert message. Sender set from JWT. |

### Notifications
> Migrate read paths to Hasura subscriptions when stable.

| Route | Method | Description |
|---|---|---|
| `notifications/index` | `GET` | All notifications for JWT user. |
| `notifications/unread-count` | `GET` | Unread count for badge. |
| `notifications/mark-read` | `POST` | Mark one read. Body: `{ notificationId }`. |
| `notifications/mark-all-read` | `POST` | Mark all read for JWT user. |
| `notifications/archive` | `POST` | Soft-delete one. Body: `{ notificationId }`. |

### Transfer of Ownership (user-facing) ⭐ New in v2.0
| Route | Method | Description |
|---|---|---|
| `transfer-ownership/validate` | `GET` | Validate token. Query param: `token`. **Public — no auth required.** |
| `transfer-ownership/claim` | `POST` | Claim property. Body: `{ token }`. User JWT required. |

### Upload
| Route | Method | Description |
|---|---|---|
| `upload/presign` | `POST` | Returns Nhost Storage upload URL. Body: `{ filename, mimeType, bucketId? }`. |

---

## 7. Admin API Routes (`v1/admin/`)

All routes require `requireAdminRole()`. Missing/non-admin token → `401` or `403`.

All admin write operations must be logged to `admin_audit_logs` — add a `_lib/audit.ts` helper that wraps the Hasura insert, and call it at the end of every mutating handler.

### 7.1 User Management

| Route | Method | Description |
|---|---|---|
| `users/index` | `GET` | List users. Params: `page`, `limit`, `search`, `userType`, `status`, `verified`, `sortBy`, `dateFrom`, `dateTo`. |
| `users/get-user` | `GET` | Full profile + statistics + moderation history. |
| `users/update-user` | `PUT` | Edit user fields + internal admin notes. |
| `users/verify-user` | `POST` | Approve or reject identity verification. Body: `{ verificationType, verificationStatus, notes }`. |
| `users/suspend-user` | `POST` | Temporary suspension. Body: `{ reason, duration, notifyUser }`. |
| `users/reactivate-user` | `POST` | Lift suspension. Body: `{ notes, sendWelcomeBackEmail }`. |
| `users/ban-user` | `POST` | Permanent ban. Body: `{ reason, permanent, deleteUserData }`. |
| `users/activity-log` | `GET` | Activity history. Params: `activityType`, `dateFrom`, `dateTo`. |
| `users/export-user-data` | `GET` | GDPR export — returns ZIP of all user data. |
| `users/delete-user-data` | `DELETE` | GDPR deletion. Body: `{ confirmDeletion, reason, retentionOverride }`. |
| `users/bulk` | `POST` | Bulk action. Body: `{ action, userIds, params }`. Rate: max 10 req/min. |

### 7.2 Property Management & Moderation

| Route | Method | Description |
|---|---|---|
| `properties/index` | `GET` | All properties with admin-visible fields. Params: `status`, `landlordId`, `flagged`, `search`, `sortBy`. |
| `properties/get-property` | `GET` | Full property + moderation history + analytics + change log. |
| `properties/approve` | `POST` | Approve listing. Body: `{ notes, featured, qualityScore, notifyLandlord }`. |
| `properties/reject` | `POST` | Reject listing. Body: `{ reason, allowResubmission, suggestions, notifyLandlord }`. |
| `properties/flag` | `POST` | Flag listing. Body: `{ flagType, reason, severity, autoUnpublish }`. |
| `properties/update-property` | `PUT` | Admin-edit any field. Body: `{ updates, reason, notifyLandlord }`. |
| `properties/feature` | `POST` | Feature/unfeature a listing. Body: `{ featured, featureUntil, placement }`. |
| `properties/bulk` | `POST` | Bulk approve/reject/flag/archive. Rate: max 10 req/min. |
| `properties/moderation-queue` | `GET` | Pending review queue with automated priority scoring. |
| `properties/reports` | `GET` | All user reports filed against a property. |

### 7.3 Offer Management

| Route | Method | Description |
|---|---|---|
| `offers/index` | `GET` | All offers platform-wide. Params: `status`, `propertyUuid`, `initiatorUid`, `flagged`, `dateFrom`. |
| `offers/get-offer` | `GET` | Full offer + negotiation history + analytics. |
| `offers/remind` | `POST` | Send reminder to initiator or recipient. Body: `{ recipientType, message, notificationMethod }`. |
| `offers/flag` | `POST` | Flag suspicious offer. Body: `{ flagType, reason, action }`. |
| `offers/cancel` | `POST` | Admin override cancel. Body: `{ reason, notifyInitiator, notifyRecipient }`. |
| `offers/stalled` | `GET` | Negotiations with no activity. Param: `daysSinceLastActivity` (default `3`). |

### 7.4 Admin Offer Inbox & WhatsApp Outreach ⭐ New in v2.0

When a tenant submits an offer on an **admin-managed listing** (where `landlord_role = 'admin'`), no real landlord account receives the notification. The Admin Offer Inbox surfaces these offers and lets the admin route the lead to the external real-world contact via WhatsApp.

#### `GET /v1/admin/offers/incoming`

Fetches all active offers on admin-managed listings, joined with `external_contact` from the property so the UI can construct outreach URLs in a single request.

| Param | Default | Description |
|---|---|---|
| `propertyUuid` | — | Scope to a single listing |
| `status` | all | Filter by `offer_status` |
| `limit` | `50` | Max 100 |
| `offset` | `0` | Pagination |

Hasura query joins: `initiator` (tenant display name, email, `whatsapp_number`) and `property_listing` (title, location, price, `external_contact`).

**`AdminOffer` type** (extends base `Offer`):
```ts
interface AdminOffer extends Offer {
  externalContact?: string   // E.164 digits for WhatsApp outreach
}
```

**Outreach utility** (`_lib/adminOfferOutreach.ts`):
```ts
// Builds a pre-filled wa.me URL with the offer summary for the admin to forward
buildAdminOfferWhatsAppUrl(externalContact, offer): string | null

// Phase 2 placeholder — Facebook Messenger deep link
buildAdminOfferFacebookUrl(pageId): string | null
```

**`external_contact` on `property_listing`:**
- E.164 digits only, no `+` prefix (e.g. `"60123456789"`)
- Write-restricted to `admin` role in Hasura
- Editable from the property detail page in the admin console
- Returned in admin API responses only

**Pending badge count** (for admin nav sidebar):
```
GET /v1/admin/offers/incoming?status=pending&limit=0
// Returns { total: N }
```

### 7.5 Transfer Ownership Invitation ⭐ New in v2.0

Enables an admin to formally invite an external party to register on Dropiti and claim an admin-managed property. Sends a time-limited WhatsApp message with a unique claim link.

**Full data flow:**
```
1. Tenant submits offer on admin listing (standard offer flow — no change)
2. Admin opens /admin/offers/incoming → AdminOfferCard
3. Admin clicks "Send Ownership Invitation"
   └─ POST /v1/admin/transfer-ownership/invite
      ├─ Inserts property_transfer_invitation row (token_uuid, 7-day expiry)
      └─ WhatsAppService.sendOwnershipInvitation(external_contact, url)
4. External contact receives WhatsApp → opens /transfer-ownership/<token>
5. GET /v1/transfer-ownership/validate?token= confirms token is valid
6a. Not authenticated → /auth/signup?callbackUrl=/transfer-ownership/<token>
6b. Authenticated → proceed
7. POST /v1/transfer-ownership/claim { token }
   ├─ Validates token (pending + not expired)
   ├─ Updates property_listing.landlord_firebase_uid = userId (from JWT)
   └─ Marks invitation status = 'used'
8. User redirected to /dashboard/properties
9. AdminOfferCard refreshes status → shows "Listing Claimed" badge
```

#### `POST /v1/admin/transfer-ownership/invite`
Auth: Admin only

| Field | Required | Description |
|---|---|---|
| `propertyUuid` | Yes | Property to transfer |
| `externalContact` | No | Override phone (falls back to `property_listing.external_contact`) |
| `offerId` | No | Offer that triggered the invite (for audit trail) |

Response:
```json
{
  "ok": true,
  "data": {
    "invitationId": 1,
    "tokenUuid": "...",
    "invitationUrl": "https://dropiti.com/transfer-ownership/...",
    "expiresAt": "...",
    "whatsappSent": true,
    "whatsappError": null
  }
}
```

#### `GET /v1/transfer-ownership/validate`
Auth: **Public** — no JWT required (entered from WhatsApp link)

Query param: `token=<uuid>`

Performs live expiry check — auto-marks `expired` if `expires_at < NOW()` and status is still `pending`. Returns sanitised property card only — no PII.

Response `status` values: `valid` | `expired` | `used` | `cancelled` | `invalid`

#### `POST /v1/transfer-ownership/claim`
Auth: Authenticated Nhost user

Body: `{ token: string }`

User ID derived from JWT only — client-supplied `userId` must not be trusted. Error codes: `INVITATION_INVALID` | `INVITATION_USED` | `INVITATION_CANCELLED` | `INVITATION_EXPIRED`

#### `POST /v1/admin/transfer-ownership/resend`
Auth: Admin only

Cancels all `pending`/`expired` invitations for the property, creates a fresh token, increments `resend_count`, resends WhatsApp.

Resend guard: `canResend` is only `true` when previous invite is `expired` OR older than 24 hours — prevents accidental spam.

#### `GET /v1/admin/transfer-ownership/status`
Auth: Admin only

Query param: `propertyUuid=<uuid>`

Returns latest invitation state. Used by `AdminOfferCard` to render the correct badge/button.

| Invitation status | UI shown in `AdminOfferCard` |
|---|---|
| `none` | **Send Ownership Invitation** (disabled if no `external_contact`) |
| `pending` < 24h | Blue badge "Invitation Sent — N days remaining" |
| `pending` ≥ 24h | Badge + **Resend** button |
| `expired` | **Resend Invitation (Expired)** (orange) |
| `used` | Green badge "Listing Claimed" |

### 7.6 Content Moderation

| Route | Method | Description |
|---|---|---|
| `reviews/moderation-queue` | `GET` | Flagged/pending reviews. Params: `status`, `limit`, `offset`. |
| `reviews/approve` | `POST` | Mark review as verified. Body: `{ verified, notes }`. |
| `reviews/reject` | `POST` | Remove review. Body: `{ reason, notifyReviewer, allowAppeal }`. |
| `reviews/update-review` | `PUT` | Admin-edit review content. Body: `{ comment, editReason, markAsEdited }`. |
| `reports/index` | `GET` | All reported content. Params: `contentType`, `status`, `severity`. |
| `reports/update` | `PUT` | Update report status, assignment, notes. |
| `reports/resolve` | `POST` | Resolve report. Body: `{ resolution, actionTaken, notifyReporter }`. |

### 7.7 Analytics & Reporting

All analytics routes are read-only. Accessible by `analyst` and `super_admin` roles; `support_agent` view-only.

| Route | Method | Description |
|---|---|---|
| `analytics/dashboard` | `GET` | Platform KPIs: users, properties, offers, engagement, moderation queue counts. Params: `period`, `dateFrom`, `dateTo`. |
| `analytics/users` | `GET` | User growth, retention, demographics. Params: `period`, `groupBy`, `metric`. |
| `analytics/properties` | `GET` | Listing volume, price distribution, conversion rates. |
| `analytics/transactions` | `GET` | Deal completions, average value, negotiation stats. |
| `analytics/performance` | `GET` | API response times, error rates, DB performance, storage usage. |
| `analytics/export` | `POST` | Async export to CSV/Excel/PDF. Returns `exportId`. Rate: max 5 req/hour. |
| `analytics/custom-report` | `POST` | Custom report with filters, metrics, groupBy, visualization type. |

### 7.8 System Configuration

Write operations restricted to `super_admin` role only.

| Route | Method | Description |
|---|---|---|
| `settings/index` | `GET` | All platform settings: general, features, moderation, limits, uploads. |
| `settings/update` | `PUT` | Update settings. Body: `{ section, updates, reason, notifyUsers }`. |
| `settings/feature-flags` | `GET` | All feature flags with rollout percentages and target user groups. |
| `settings/toggle-flag` | `POST` | Enable/disable flag. Body: `{ enabled, rollout_percentage, target_users }`. |
| `settings/email-templates` | `GET` | All email/notification templates across all languages. |
| `settings/update-template` | `PUT` | Update template. Body: `{ subject, content, language, testEmail }`. |

### 7.9 Support & Ticketing

| Route | Method | Description |
|---|---|---|
| `support/tickets/index` | `GET` | All tickets. Params: `status`, `priority`, `category`, `assignedTo`. |
| `support/tickets/get-ticket` | `GET` | Full ticket with messages, internal notes, activity log. |
| `support/tickets/create` | `POST` | Create ticket on behalf of user. Body: `{ userFirebaseUid, subject, description, category, priority }`. |
| `support/tickets/update` | `PUT` | Update status, priority, category, or assignment. |
| `support/tickets/reply` | `POST` | Admin reply. Body: `{ content, notifyUser, closeTicket, cannedResponseId }`. |
| `support/tickets/add-note` | `POST` | Internal note — not visible to user. |
| `support/tickets/assign` | `POST` | Assign to agent. Body: `{ assignTo, notifyAssignee }`. |
| `support/tickets/close` | `POST` | Close ticket. Body: `{ resolution, notifyUser, satisfaction_survey }`. |
| `support/canned-responses` | `GET` | Predefined response library by category. |

### 7.10 Audit Logs

All admin write operations are automatically logged. These routes expose the log for review and export.

| Route | Method | Description |
|---|---|---|
| `audit-logs/index` | `GET` | All logs. Params: `adminId`, `action`, `resourceType`, `resourceId`, `dateFrom`, `dateTo`. |
| `audit-logs/export` | `GET` | Export to CSV/JSON. Same params as index. Rate: max 5 req/hour. |
| `audit-logs/admin-activity` | `GET` | Activity summary + recent actions for a specific admin. |

---

## 8. Shared / Cross-Cutting Routes

| Route | Method | Description |
|---|---|---|
| `health.ts` | `GET` | Returns `{ ok: true, data: { status: "healthy" } }`. No auth required. First check after every deploy. |

---

## 9. Routes Deprecated on Migration

| Current route | Reason |
|---|---|
| `src/app/api/graphql/route.ts` | GraphQL proxy — frontends call Nhost Hasura endpoint directly. Remove. |
| `src/app/api/graphql/client.ts` | Replace with `@nhost/nextjs` + Apollo/urql. |
| `src/app/api/graphql/serverClient.ts` | Replace with `hasuraQuery()` from `_lib/hasura.ts`. |
| `src/app/api/test-env` | Delete — use Nhost dashboard env checks. |
| `src/app/api/test-hasura` | Delete — `GET /v1/health` covers this. |
| `src/app/api/test-s3` | Delete — Nhost Storage health visible in dashboard. |
| `v1/reviews/test-review-schema` | Delete — dev-only, never expose in production. |
| `POST /api/login` (admin-console) | Delete — replaced by Nhost Auth `signIn()`. |
| `GET /api/auth/check` (admin-console) | Delete — replaced by `useAuthenticationStatus()`. |
| `POST /api/auth/logout` (admin-console) | Delete — replaced by Nhost Auth `signOut()`. |

---

## 10. Hasura Role Strategy

| Role | Who | Permission scope |
|---|---|---|
| `user` | Authenticated client users | Row-level: `{ user_id: { _eq: "X-Hasura-User-Id" } }` |
| `admin` | Admin console users | Unrestricted on all tables |

**Setting the `admin` role** — Nhost Auth custom claims (Nhost dashboard → Auth → Custom Claims):
```json
{
  "https://hasura.io/jwt/claims": {
    "x-hasura-allowed-roles": ["user", "admin"],
    "x-hasura-default-role": "user",
    "x-hasura-user-id": "{{profile.id}}"
  }
}
```

Only promote to admin via a trusted Function using `requireAdminRole()` — never client-side.

**`external_contact` Hasura permissions:** write — `admin` role only; read — `admin` always, `user` on own listings only.

**New tables** (`support_tickets`, `moderation_records`, `reports`, `admin_audit_logs`, `property_transfer_invitation`) — restrict all access to `admin` role only. Track all tables in Hasura after running migrations.

---

## 11. Database Schema Additions ⭐ New in v2.0

### `external_contact` on `property_listing`

```sql
-- migration: add_external_contact_to_property_listing.sql
ALTER TABLE real_estate.property_listing
  ADD COLUMN IF NOT EXISTS external_contact TEXT;

COMMENT ON COLUMN real_estate.property_listing.external_contact IS
  'E.164 phone digits (no + prefix) for the external agent. Used by admin for WhatsApp outreach.';
```

### `property_transfer_invitation`

```sql
-- migration: add_property_transfer_invitation.sql
CREATE TABLE real_estate.property_transfer_invitation (
    id                  SERIAL PRIMARY KEY,
    token_uuid          UUID        UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    property_uuid       UUID        NOT NULL REFERENCES real_estate.property_listing(property_uuid) ON DELETE CASCADE,
    external_contact    TEXT        NOT NULL,
    sent_by_admin_id    TEXT        NOT NULL,
    offer_id            TEXT,
    status              TEXT        NOT NULL CHECK (status IN ('pending','used','expired','cancelled')) DEFAULT 'pending',
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at             TIMESTAMPTZ,
    claimed_by_user_id  TEXT,
    whatsapp_message_id TEXT,
    resend_count        INTEGER     NOT NULL DEFAULT 0
);
```

**Token lifecycle:** `pending → used` (claimed) · `pending → expired` (auto on validate) · `pending → cancelled` (resend) · `expired → cancelled` (resend)

### Admin support & audit tables

```sql
-- migration: add_admin_support_tables.sql

CREATE TABLE real_estate.support_tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number VARCHAR(50) UNIQUE NOT NULL,
  subject       VARCHAR(255) NOT NULL,
  description   TEXT,
  category      VARCHAR(50),
  priority      VARCHAR(50),
  status        VARCHAR(50) NOT NULL DEFAULT 'open',
  user_firebase_uid VARCHAR(255) NOT NULL,
  assigned_to   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,
  sla_due_at    TIMESTAMPTZ
);

CREATE TABLE real_estate.moderation_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type  VARCHAR(50) NOT NULL,
  content_id    VARCHAR(255) NOT NULL,
  action        VARCHAR(50) NOT NULL,
  moderator_id  TEXT NOT NULL,
  reason        TEXT,
  notes         TEXT,
  automated     BOOLEAN NOT NULL DEFAULT FALSE,
  quality_score INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE real_estate.reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type   VARCHAR(50) NOT NULL,
  content_type  VARCHAR(50) NOT NULL,
  content_id    VARCHAR(255) NOT NULL,
  reported_by   VARCHAR(255) NOT NULL,
  description   TEXT,
  evidence_urls JSONB,
  status        VARCHAR(50) NOT NULL DEFAULT 'open',
  severity      VARCHAR(50),
  assigned_to   TEXT,
  resolution    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE TABLE real_estate.admin_audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_id      TEXT NOT NULL,
  action        VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id   VARCHAR(255),
  details       JSONB,
  ip_address    VARCHAR(50),
  user_agent    TEXT,
  success       BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT
);
```

---

## 12. WhatsApp Service Layer ⭐ New in v2.0

**File:** `functions/_lib/whatsapp.ts`

Provider-agnostic — switching from `stub` to `meta` or `twilio` requires only env var changes, no handler changes.

**Template name** (register when going live): `property_ownership_invitation`

Example message:
> Hi, your property *{{1}}* has received a rental enquiry on Dropiti. Register or log in to claim your listing and manage this lead: {{2}}. This invitation expires in {{3}} days.

**Phase roadmap:**

| Phase | Item | Status |
|---|---|---|
| 1 | Stub provider (log to console) | Done |
| 1 | All 5 transfer ownership API routes | Done |
| 1 | `AdminOfferCard` + `AdminIncomingOffers` UI | Done |
| 1 | `/transfer-ownership/[token]` page (all 8 states) | Done |
| 2 | Swap to `WhatsAppMetaProvider` or `WhatsAppTwilioProvider` | Pending provider selection |
| 2 | Pre-approve template in Meta Business Manager | Pending |
| 2 | Server-side Nhost JWT verification on claim route | Pending admin auth layer |
| 2 | Facebook Messenger DM outreach | Next phase |
| 3 | Outreach audit log | Compliance |
| 3 | Deduplication guard (warn if contact messaged recently) | UX improvement |
| 3 | Hasura scheduled event to sweep expired tokens | Operational cleanup |

---

## 13. Nhost Storage — Upload Replacement

### Client-side (preferred)
```ts
const { fileMetadata, error } = await nhost.storage.upload({
  file,
  bucketId: 'property-images',
})
```

### Server-side (for validated uploads)
```ts
// upload/presign.ts
const body = validate(req, res, z.object({
  filename: z.string(),
  mimeType: z.string(),
  bucketId: z.string().optional(),
}))
if (!body) return
// validate MIME type, generate Nhost presigned URL
ok(res, { uploadUrl, fileId })
```

---

## 14. Real-Time — Subscriptions

### Chat
```ts
const MESSAGES_SUB = gql`
  subscription RoomMessages($roomId: uuid!) {
    chat_messages(
      where: { room_id: { _eq: $roomId } }
      order_by: { created_at: asc }
    ) { id content sender_id created_at }
  }
`
```

### Notifications
```ts
const NOTIFICATIONS_SUB = gql`
  subscription UserNotifications($userId: uuid!) {
    notifications(
      where: { user_id: { _eq: $userId }, archived: { _eq: false } }
      order_by: { created_at: desc }
    ) { id type content is_read created_at }
  }
`
```

Mutation routes (`send-message`, `mark-read`, `archive`) remain as Functions — subscriptions replace only the read/poll side.

---

## 15. Coding Standards Cheatsheet

**Handler structure — always in this order:**
```ts
export default async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Auth
    const payload = await requireAuth(req, res)   // or requireAdminRole
    if (!payload) return

    // 2. Validate
    const body = validate(req, res, MySchema)
    if (!body) return

    // 3. Business logic
    const result = await hasuraQuery<MyType>(MY_QUERY, { ...body })
    if (result.errors?.length) return fail(res, 'Query failed', 500)

    // 4. Respond
    ok(res, result.data)
  } catch (err) {
    console.error('[admin/offers/incoming]', err)
    fail(res, 'Internal server error', 500)
  }
}
```

**Always forbidden:**
```ts
process.env.HASURA_GRAPHQL_ADMIN_SECRET   // use _lib/env.ts
process.env.NHOST_JWT_SECRET              // use _lib/env.ts
jwt.verify(token, process.env....)        // use requireAuth()
fetch('https://...hasura.app/...')        // use hasuraQuery()
require('dotenv').config()                // not supported in Nhost Functions
// @ts-ignore                             // fix the type
any                                       // strict TypeScript only
```

**Status codes:**

| Code | When |
|---|---|
| `200` | Success (read) |
| `201` | Created |
| `400` | Malformed body |
| `401` | No valid JWT |
| `403` | Wrong role or ownership |
| `404` | Not found |
| `422` | Zod validation failed |
| `429` | Rate limited |
| `500` | Unexpected server error |

**Rate limits for admin routes:** Read: 100 req/min · Write: 30 req/min · Bulk: 10 req/min · Export: 5 req/hour

**Naming:** `kebab-case` files/dirs · `PascalCase` Zod schemas · `SCREAMING_SNAKE_CASE` GraphQL documents

---

## 16. Migration Sequence

### Phase 1 — Foundation
1. Set up `dropiti-nhost` with `functions/_lib/` (env, hasura, auth, respond, validate, whatsapp).
2. Deploy `functions/health.ts`. Confirm `GET /v1/health` responds.
3. Configure Nhost Auth custom claims to assign `admin` role to admin users.
4. Verify `middleware.ts` in admin console reads `NHOST_JWT_SECRET` correctly.
5. Run database migrations: `external_contact` column → `property_transfer_invitation` → admin support/audit tables.

### Phase 2a — Transfer Ownership & Admin Offer Inbox (unblock existing feature)
6. Implement `admin/transfer-ownership/invite`, `resend`, `status`.
7. Implement `transfer-ownership/validate`, `claim` (public + user-auth).
8. Implement `admin/offers/incoming`.
9. Set `WHATSAPP_PROVIDER=stub` for initial testing; verify console output.
10. QA the full flow: offer → invite → WhatsApp (console log) → validate → claim → badge update.

### Phase 2b — Full Admin Expansion
11. Implement `admin/users/*` — all 11 routes.
12. Implement `admin/properties/*` — all 10 routes.
13. Implement `admin/offers/*` (remaining: `index`, `get-offer`, `remind`, `flag`, `cancel`, `stalled`).
14. Implement `admin/reviews/*` — moderation queue + approve/reject/edit.
15. Implement `admin/reports/*`, `admin/analytics/*`, `admin/settings/*`, `admin/support/*`, `admin/audit-logs/*`.
16. Update admin console to call `FUNCTIONS_URL/v1/admin/` for all these domains.
17. Remove legacy `POST /api/login`, `GET /api/auth/check`, `POST /api/auth/logout` from admin console.

### Phase 3 — Client Routes
18. Implement `users/*`, `properties/*`. Update `dropiti-v3` to call `FUNCTIONS_URL/v1/`.
19. Implement `offers/*` — test full negotiation state machine end-to-end.
20. Implement `reviews/*`, `tenants/*`, `transfer-ownership/*` (client-facing validate/claim).

### Phase 4 — Real-Time Migration
21. Implement `chat/*` Functions as bridging routes.
22. Migrate frontend chat reads to Hasura subscriptions.
23. Migrate notification reads to subscriptions. Keep mutation routes.
24. Remove chat/notification polling routes once subscriptions are stable.

### Phase 5 — Cleanup & Production WhatsApp
25. Remove `src/app/api/graphql/*` from `dropiti-v3`.
26. Remove `src/app/api/test-*` and `v1/reviews/test-review-schema`.
27. Replace `src/lib/api-client.ts` with typed fetch wrappers pointing to `FUNCTIONS_URL/v1/`.
28. Replace `graphql/client.ts` and `serverClient.ts` with `@nhost/nextjs` + Apollo/urql.
29. Select WhatsApp provider, pre-approve `property_ownership_invitation` template, set `WHATSAPP_PROVIDER=meta` (or `twilio`).

### Operational check after every phase
```bash
GET /v1/health                                         # must return { ok: true }
# client route with valid user JWT → 200
# admin route with valid admin JWT → 200
# admin route with user JWT → 403
# transfer-ownership/validate?token=invalid → { status: "invalid" }
```

---

## 17. Environment Variables Reference

| Variable | Where set | Used in | Notes |
|---|---|---|---|
| `NHOST_ADMIN_SECRET` | Nhost Dashboard / `.secrets` | `_lib/env.ts` → `hasura.ts` | Falls back to `HASURA_GRAPHQL_ADMIN_SECRET` |
| `NHOST_JWT_SECRET` | Nhost Dashboard / `.secrets` | `_lib/env.ts` → `auth.ts` | JSON `{ "key": "...", "type": "HS256" }` — parse `.key` |
| `NHOST_GRAPHQL_URL` | Auto-injected by Nhost | `_lib/env.ts` → `hasura.ts` | Falls back to `NHOST_SUBDOMAIN` + `NHOST_REGION` |
| `NHOST_SUBDOMAIN` | Auto-injected | `_lib/env.ts` | Fallback GraphQL URL construction |
| `NHOST_REGION` | Auto-injected | `_lib/env.ts` | Same |
| `NEXT_PUBLIC_FUNCTIONS_URL` | Each frontend `.env` | Frontend fetch clients | `https://<subdomain>.functions.<region>.nhost.run` |
| `NHOST_JWT_SECRET` | Frontend `.env.local` | `middleware.ts` (admin console) | Same secret, used by `jose` for edge JWT verification |
| `WHATSAPP_PROVIDER` | `.secrets` / Nhost Dashboard | `_lib/env.ts` → `whatsapp.ts` | `stub` (default) · `meta` · `twilio` ⭐ New v2.0 |
| `WHATSAPP_API_TOKEN` | `.secrets` / Nhost Dashboard | `_lib/whatsapp.ts` | Required when `WHATSAPP_PROVIDER=meta` or `twilio` ⭐ New v2.0 |
| `WHATSAPP_PHONE_NUMBER_ID` | `.secrets` / Nhost Dashboard | `_lib/whatsapp.ts` | Meta Cloud API phone number ID ⭐ New v2.0 |
| `INVITATION_EXPIRY_DAYS` | `.secrets` / Nhost Dashboard | `_lib/env.ts` | Default `7`. Controls transfer invitation token TTL ⭐ New v2.0 |

**Local development** — copy `secrets/dotsecrets.example` to repo-root `.secrets`. Never commit `.secrets`.

---

*Dropiti Unified Backend v2.0 — May 2026. Maintain alongside `AI_Rules.md`. Update the version history table on every structural change.*