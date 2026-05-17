# Decouple Plan — Dropiti Admin Console → Nhost Unified Backend

> **Repo:** `myeung-6ixtech/dropiti-admin-console` (main branch)
> **Target backend:** `dropiti-nhost` Nhost Functions as documented in `dropiti-unified-backend-v2.md`
> **Goal:** Remove all local Next.js API routes from the admin console. The frontend becomes a pure UI shell that calls Nhost Functions and Nhost services directly.
> **Date:** May 2026

---

## Table of Contents

1. [Current State Inventory](#1-current-state-inventory)
2. [Dependency Map](#2-dependency-map)
3. [Auth Decoupling](#3-auth-decoupling)
4. [API Route Mapping — Current → Nhost](#4-api-route-mapping--current--nhost)
5. [Upload & Batch Upload Decoupling](#5-upload--batch-upload-decoupling)
6. [Airwallex Integration](#6-airwallex-integration)
7. [S3 Bucket Migration to Nhost Storage](#7-s3-bucket-migration-to-nhost-storage)
8. [Redis / Upstash Rate Limiting](#8-redis--upstash-rate-limiting)
9. [Middleware — What Changes, What Stays](#9-middleware--what-changes-what-stays)
10. [Frontend API Client Refactor](#10-frontend-api-client-refactor)
11. [Environment Variable Changes](#11-environment-variable-changes)
12. [Files to Delete](#12-files-to-delete)
13. [Files to Create / Modify](#13-files-to-create--modify)
14. [Gaps Identified — Missing Nhost Functions](#14-gaps-identified--missing-nhost-functions)
15. [Decoupling Execution Order](#15-decoupling-execution-order)
16. [Verification Checklist](#16-verification-checklist)

---

## 1. Current State Inventory

### Protected pages in the admin console (from `middleware.ts`)

| Route prefix | Purpose | Backend needs |
|---|---|---|
| `/dashboard` | Platform KPIs + activity feed | `GET /v1/admin/analytics/dashboard` |
| `/customers` | User management | `GET /v1/admin/users` + sub-routes |
| `/payments` | Payment records | Airwallex API (via Nhost Function) |
| `/transfers` | Fund/ownership transfers | `GET/POST /v1/admin/transfer-ownership/*` |
| `/beneficiaries` | Beneficiary records | Airwallex API |
| `/settings` | Platform configuration | `GET/PUT /v1/admin/settings` |
| `/reports` | Analytics exports | `GET /v1/admin/analytics/*` |
| `/properties` | Property management + moderation | `GET/POST /v1/admin/properties/*` |
| `/payment-intents` | Payment intent lifecycle | Airwallex API |
| `/user-management` | Admin user & role management | `GET/POST /v1/admin/users/*` |
| `/media-library` | File/image management | Nhost Storage + `GET /v1/admin/upload/*` |

### Local Next.js API routes currently in the build

| Route | Method | Current behaviour | Status |
|---|---|---|---|
| `src/app/api/login/route.ts` | `POST` | PBKDF2 auth → session token in DB cookie | **Replace with Nhost Auth** |
| `src/app/api/auth/check/route.ts` | `GET` | Session DB lookup → user + permissions | **Replace with Nhost Auth** |
| `src/app/api/auth/logout/route.ts` | `POST` | Invalidate session in DB + clear cookie | **Replace with Nhost Auth** |

> These are the **only** API routes confirmed in the current build. All other data fetching happens via direct Hasura GraphQL calls (using `graphql-request` + `SDK_BACKEND_URL` + `SDK_HASURA_ADMIN_SECRET`).

### External services currently wired in

| Service | SDK / package | Env vars | Used for |
|---|---|---|---|
| **Hasura** | `graphql-request` | `SDK_BACKEND_URL`, `HASURA_ADMIN_SECRET`, `HASURA_ENDPOINT` | All data reads/writes |
| **Nhost Auth** | `jose` (JWT verify only) | `NHOST_JWT_SECRET`, `NEXT_PUBLIC_NHOST_SUBDOMAIN`, `NEXT_PUBLIC_NHOST_REGION` | Middleware JWT check |
| **Airwallex** | `@airwallex/components-sdk` | `AIRWALLEX_API_KEY`, `AIRWALLEX_CLIENT_ID`, `NEXT_PUBLIC_AIRWALLEX_ENV` | Payments, transfers, beneficiaries |
| **AWS S3** | `@aws-sdk/client-s3` | `S3_BUCKET_*` (5 vars) | File uploads |
| **Upstash Redis** | (env-only, no SDK in pkg.json — likely via REST API) | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting on login |
| **react-dropzone** | `react-dropzone` | — | Drag-and-drop file upload UI |

---

## 2. Dependency Map

How each dependency is currently used and what replaces it after decoupling:

| Package | Current use | After decoupling |
|---|---|---|
| `graphql-request` | Direct Hasura queries from server components + API routes | **Keep** — admin console can continue querying Hasura directly with the Nhost JWT in the `Authorization` header. Remove admin secret usage from client. |
| `jose` | JWT verify in `middleware.ts` | **Keep** — middleware is correct and stays unchanged |
| `@airwallex/components-sdk` | Payments/transfers UI SDK | **Keep in frontend** — Airwallex calls go to a new Nhost Function (`admin/payments/*`) that proxies to Airwallex API server-side, keeping the API key off the client |
| `@aws-sdk/client-s3` | S3 uploads from API routes | **Remove** — replaced by Nhost Storage SDK |
| `react-dropzone` | Upload UI | **Keep** — UI component only, wire to new upload function |
| `axios` | HTTP calls | **Keep** — used for Nhost Function calls |

---

## 3. Auth Decoupling

### Current auth flow (to be removed)

```
SignInForm → POST /api/login (PBKDF2 + session token + DB write)
           → GET /api/auth/check (session DB query)
           → POST /api/auth/logout (session invalidate)
           → admin_session cookie (HTTP-only)
```

### Target auth flow (Nhost Auth)

```
SignInForm → nhost.auth.signIn({ email, password })
           → Nhost sets nhost_access_token cookie automatically
           → middleware.ts reads nhost_access_token (already correct — NO CHANGE)
           → useAuthenticationStatus() / useUserData() replaces GET /api/auth/check
           → nhost.auth.signOut() replaces POST /api/auth/logout
```

### Steps

**1. Install `@nhost/nextjs`**
```bash
yarn add @nhost/nextjs @nhost/react
```

**2. Create `src/lib/nhost.ts`**
```ts
import { NhostClient } from '@nhost/nextjs'

export const nhost = new NhostClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN!,
  region:    process.env.NEXT_PUBLIC_NHOST_REGION!,
})
```

**3. Wrap the app in `NhostProvider` (`src/app/layout.tsx`)**
```tsx
import { NhostProvider } from '@nhost/nextjs'
import { nhost } from '@/lib/nhost'

export default function RootLayout({ children }) {
  return (
    <NhostProvider nhost={nhost}>
      {children}
    </NhostProvider>
  )
}
```

**4. Update `src/context/AuthContext.tsx`**

Replace session cookie logic with Nhost hooks:

```ts
import { useAuthenticationStatus, useUserData } from '@nhost/react'

// Replace:  GET /api/auth/check
// With:     useAuthenticationStatus() + useUserData()

// Replace:  POST /api/auth/logout
// With:     nhost.auth.signOut()

// Replace:  POST /api/login
// With:     nhost.auth.signIn({ email, password })
```

The `hasPermission()` utility stays — wire it to Nhost's JWT claims (`x-hasura-allowed-roles`) or a custom claims field that lists permission strings.

**5. Admin users must have `"admin"` in `x-hasura-allowed-roles`**

Configure in Nhost Dashboard → Auth → Custom Claims:
```json
{
  "https://hasura.io/jwt/claims": {
    "x-hasura-allowed-roles": ["user", "admin"],
    "x-hasura-default-role": "user",
    "x-hasura-user-id": "{{profile.id}}"
  }
}
```

**6. Middleware stays unchanged** — it already reads `nhost_access_token` and checks `x-hasura-allowed-roles` for `"admin"`.

---

## 4. API Route Mapping — Current → Nhost

| Current local route | Method | Maps to Nhost Function | Notes |
|---|---|---|---|
| `/api/login` | `POST` | Nhost Auth `signIn()` | Delete local route |
| `/api/auth/check` | `GET` | `useAuthenticationStatus()` hook | Delete local route |
| `/api/auth/logout` | `POST` | Nhost Auth `signOut()` | Delete local route |

No other local API routes exist. **All other data currently comes from direct Hasura GraphQL calls**, which will be replaced by calling Nhost Functions at `FUNCTIONS_URL/v1/admin/*`.

### Hasura direct calls → Nhost Functions

The admin console currently queries Hasura directly using the admin secret. After decoupling, it calls Nhost Functions which run queries server-side with the admin secret. The frontend sends its Nhost JWT as a Bearer token.

**Before (direct Hasura, admin secret exposed in server component):**
```ts
import { GraphQLClient } from 'graphql-request'
const client = new GraphQLClient(process.env.SDK_BACKEND_URL!, {
  headers: { 'x-hasura-admin-secret': process.env.HASURA_ADMIN_SECRET! }
})
const data = await client.request(GET_USERS_QUERY)
```

**After (call Nhost Function with JWT):**
```ts
const res = await fetch(`${process.env.NEXT_PUBLIC_FUNCTIONS_URL}/v1/admin/users`, {
  headers: { Authorization: `Bearer ${nhost.auth.getAccessToken()}` }
})
const { data } = await res.json()
```

---

## 5. Upload & Batch Upload Decoupling

### Current state

The admin console has `@aws-sdk/client-s3` in dependencies and `S3_BUCKET_*` env vars. The `react-dropzone` UI component is used for the media library drag-and-drop. Upload handling currently goes through a server component or API route that uses the AWS SDK directly.

### Target state — two scenarios

#### Scenario A: Single file upload (media library, property images)

Replace with Nhost Storage directly from the client:

```ts
import { useNhostClient } from '@nhost/nextjs'

function MediaUploader() {
  const nhost = useNhostClient()

  const handleDrop = async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      const { fileMetadata, error } = await nhost.storage.upload({
        file,
        bucketId: 'admin-media',   // create this bucket in Nhost dashboard
      })
      if (error) console.error('Upload failed', error)
      else console.log('Uploaded:', fileMetadata?.id)
    }
  }
  // wire handleDrop to react-dropzone's onDrop prop
}
```

#### Scenario B: Batch upload (multiple files, e.g. bulk property images)

For validated or rate-limited batch uploads, call the new Nhost Function:

**New Nhost Function required:** `functions/admin/upload/batch.ts`

```
POST /v1/admin/upload/batch
Auth: requireAdminRole()
Body: multipart or array of { filename, mimeType, bucketId }
Returns: [{ fileId, uploadUrl }] — client uploads to each URL
```

The client then iterates the returned presigned URLs and PUTs each file directly to Nhost Storage:

```ts
const res = await fetch(`${ADMIN_API}/upload/batch`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(files.map(f => ({ filename: f.name, mimeType: f.type, bucketId: 'admin-media' })))
})
const { data: presignedUrls } = await res.json()

await Promise.all(
  presignedUrls.map(({ uploadUrl }, i) =>
    fetch(uploadUrl, { method: 'PUT', body: files[i] })
  )
)
```

#### Media library URL pattern after migration

```ts
// Current: S3 URL
`https://tastyplates-bucket.s3.ap-northeast-2.amazonaws.com/${key}`

// After: Nhost Storage URL
`https://fcuycyemqprjrkbshlcj.storage.ap-southeast-1.nhost.run/v1/files/${fileId}`
// or via nhost SDK:
nhost.storage.getPublicUrl({ fileId })
```

### S3 bucket migration checklist

- [ ] Create `admin-media` bucket in Nhost Storage (Nhost Dashboard → Storage)
- [ ] Set bucket access policy (public read or signed URL — match existing S3 policy)
- [ ] Migrate existing S3 files to Nhost Storage (one-time: download + re-upload or use `aws s3 sync` → then bulk upload to Nhost)
- [ ] Update any stored S3 URLs in the database to Nhost Storage file IDs
- [ ] Remove `@aws-sdk/client-s3` from `package.json`
- [ ] Remove all `S3_BUCKET_*` env vars

---

## 6. Airwallex Integration

### Current state

`@airwallex/components-sdk` is installed. Env vars `AIRWALLEX_API_KEY`, `AIRWALLEX_CLIENT_ID`, `NEXT_PUBLIC_AIRWALLEX_ENV` are present. The SDK is used for the `/payments`, `/payment-intents`, and `/beneficiaries` pages.

### Problem with current approach

`AIRWALLEX_API_KEY` is a **server-side secret** — it must never reach the browser. In the current build it's likely used in server components or API routes. After decoupling (no local API routes), all Airwallex API calls that use the API key must go through Nhost Functions.

### New Nhost Functions required (added to v3 gap list)

| Function | Method | Description |
|---|---|---|
| `admin/payments/index.ts` | `GET` | List payments — proxies to Airwallex `/api/v1/pa/payment_intents` |
| `admin/payments/get-payment.ts` | `GET` | Single payment detail |
| `admin/payments/capture.ts` | `POST` | Capture a payment intent |
| `admin/payments/cancel.ts` | `POST` | Cancel a payment intent |
| `admin/beneficiaries/index.ts` | `GET` | List beneficiaries from Airwallex |
| `admin/beneficiaries/create.ts` | `POST` | Create beneficiary |
| `admin/beneficiaries/delete.ts` | `DELETE` | Remove beneficiary |
| `admin/transfers/index.ts` | `GET` | List transfer records |
| `admin/transfers/create.ts` | `POST` | Initiate a transfer |
| `admin/transfers/status.ts` | `GET` | Transfer status |

All these Functions use `requireAdminRole()` and make server-side calls to Airwallex using `AIRWALLEX_API_KEY` from `_lib/env.ts`.

### Airwallex client SDK (public, browser-safe)

`NEXT_PUBLIC_AIRWALLEX_ENV` and `NEXT_PUBLIC_CLIENT_SECRET` are already `NEXT_PUBLIC_*` — these stay in the frontend for the Airwallex Elements UI (payment form rendering). Only the API key moves to the Function layer.

---

## 7. S3 Bucket Migration to Nhost Storage

Already covered in §5. Summary:

| Item | Action |
|---|---|
| `@aws-sdk/client-s3` | Remove from `package.json` |
| `S3_BUCKET_ACCESS_KEY` | Remove env var |
| `S3_BUCKET_SECRET_KEY` | Remove env var |
| `S3_BUCKET_DOMAIN_URL` | Remove env var |
| `S3_BUCKET_AWS_REGION` | Remove env var |
| `S3_BUCKET_NAME` | Remove env var |
| `IMAGE_MAX_WIDTH`, `IMAGE_MAX_HEIGHT`, `IMAGE_WEBP_QUALITY` | Move to Nhost Function `admin/upload/batch.ts` as server-side constants |
| Nhost Storage bucket `admin-media` | Create in Nhost dashboard |

---

## 8. Redis / Upstash Rate Limiting

### Current state

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are present. Upstash is likely used for login rate limiting (max 5 attempts per 15 minutes) in the `/api/login` route.

### After decoupling

The `/api/login` route is deleted (Nhost Auth handles login). Nhost Auth has built-in brute-force protection. The Upstash dependency can be removed from the admin console frontend entirely.

If rate limiting is still needed for other Nhost Functions (e.g. the Airwallex proxy endpoints), move the Upstash calls to `_lib/ratelimit.ts` in the `dropiti-nhost` Functions repo:

```ts
// functions/_lib/ratelimit.ts
export async function checkRateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const url  = process.env.UPSTASH_REDIS_REST_URL!
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!
  // Use Upstash REST API for sliding window counter
}
```

Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to the Nhost Functions `.secrets` file.

**Result:** Remove Upstash env vars from admin console frontend entirely.

---

## 9. Middleware — What Changes, What Stays

`middleware.ts` is **already correct** and requires **zero changes** for the decoupling. It:

- Reads `nhost_access_token` cookie ✅
- Verifies JWT with `NHOST_JWT_SECRET` via `jose` ✅
- Checks `x-hasura-allowed-roles` for `"admin"` ✅
- Skips `/api/*` paths ✅
- Redirects to `/signin` on failure ✅
- Redirects authenticated admins away from `/signin` ✅

The only thing that changes is how the `nhost_access_token` gets **set** — it will now be set by Nhost Auth's `signIn()` instead of the local `/api/login` route.

---

## 10. Frontend API Client Refactor

### Create `src/lib/admin-api.ts`

A typed fetch wrapper for all Nhost Function calls from the admin console. Replaces direct Hasura GraphQL calls and the three local API routes.

```ts
const FUNCTIONS_URL = process.env.NEXT_PUBLIC_FUNCTIONS_URL!
const ADMIN_BASE    = `${FUNCTIONS_URL}/v1/admin`

async function adminFetch<T>(
  path: string,
  options: RequestInit = {},
  token: string
): Promise<T> {
  const res = await fetch(`${ADMIN_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(`Admin API error: ${res.status}`)
  return res.json()
}

// Typed helpers — one per domain
export const adminUsersApi = {
  list:        (params, token) => adminFetch(`/users?${new URLSearchParams(params)}`, {}, token),
  get:         (userId, token) => adminFetch(`/users/${userId}`, {}, token),
  suspend:     (userId, body, token) => adminFetch(`/users/${userId}/suspend`, { method: 'POST', body: JSON.stringify(body) }, token),
  reactivate:  (userId, body, token) => adminFetch(`/users/${userId}/reactivate`, { method: 'POST', body: JSON.stringify(body) }, token),
  ban:         (userId, body, token) => adminFetch(`/users/${userId}/ban`, { method: 'POST', body: JSON.stringify(body) }, token),
  bulk:        (body, token) => adminFetch(`/users/bulk`, { method: 'POST', body: JSON.stringify(body) }, token),
}

export const adminPropertiesApi = {
  list:             (params, token) => adminFetch(`/properties?${new URLSearchParams(params)}`, {}, token),
  get:              (uuid, token)   => adminFetch(`/properties/${uuid}`, {}, token),
  approve:          (uuid, body, token) => adminFetch(`/properties/${uuid}/approve`, { method: 'POST', body: JSON.stringify(body) }, token),
  reject:           (uuid, body, token) => adminFetch(`/properties/${uuid}/reject`, { method: 'POST', body: JSON.stringify(body) }, token),
  flag:             (uuid, body, token) => adminFetch(`/properties/${uuid}/flag`, { method: 'POST', body: JSON.stringify(body) }, token),
  moderationQueue:  (params, token) => adminFetch(`/properties/moderation-queue?${new URLSearchParams(params)}`, {}, token),
}

export const adminOffersApi = {
  incoming:    (params, token) => adminFetch(`/offers/incoming?${new URLSearchParams(params)}`, {}, token),
  list:        (params, token) => adminFetch(`/offers?${new URLSearchParams(params)}`, {}, token),
}

export const adminTransferApi = {
  invite:  (body, token) => adminFetch(`/transfer-ownership/invite`, { method: 'POST', body: JSON.stringify(body) }, token),
  resend:  (body, token) => adminFetch(`/transfer-ownership/resend`, { method: 'POST', body: JSON.stringify(body) }, token),
  status:  (propertyUuid, token) => adminFetch(`/transfer-ownership/status?propertyUuid=${propertyUuid}`, {}, token),
}

export const adminAnalyticsApi = {
  dashboard:    (params, token) => adminFetch(`/analytics/dashboard?${new URLSearchParams(params)}`, {}, token),
  users:        (params, token) => adminFetch(`/analytics/users?${new URLSearchParams(params)}`, {}, token),
  properties:   (params, token) => adminFetch(`/analytics/properties?${new URLSearchParams(params)}`, {}, token),
  export:       (body, token)   => adminFetch(`/analytics/export`, { method: 'POST', body: JSON.stringify(body) }, token),
}

export const adminPaymentsApi = {
  list:   (params, token) => adminFetch(`/payments?${new URLSearchParams(params)}`, {}, token),
  capture: (id, token)    => adminFetch(`/payments/${id}/capture`, { method: 'POST' }, token),
  cancel:  (id, token)    => adminFetch(`/payments/${id}/cancel`, { method: 'POST' }, token),
}

export const adminUploadApi = {
  presign: (files: { filename: string; mimeType: string }[], token: string) =>
    adminFetch(`/upload/batch`, { method: 'POST', body: JSON.stringify(files) }, token),
}
```

### Get the token in components

```ts
import { useAccessToken } from '@nhost/react'

function MyAdminPage() {
  const token = useAccessToken()
  // pass token to adminFetch calls
}
```

---

## 11. Environment Variable Changes

### Variables to REMOVE from admin console

| Variable | Reason |
|---|---|
| `SDK_BACKEND_URL` | Direct Hasura calls replaced by Nhost Functions |
| `HASURA_ADMIN_SECRET` | Must not be in frontend — move to Nhost Functions `.secrets` |
| `HASURA_ENDPOINT` | Same — server-only |
| `S3_BUCKET_ACCESS_KEY` | AWS S3 removed |
| `S3_BUCKET_SECRET_KEY` | AWS S3 removed |
| `S3_BUCKET_DOMAIN_URL` | AWS S3 removed |
| `S3_BUCKET_AWS_REGION` | AWS S3 removed |
| `S3_BUCKET_NAME` | AWS S3 removed |
| `IMAGE_MAX_WIDTH` | Move to Nhost Function server-side constant |
| `IMAGE_MAX_HEIGHT` | Move to Nhost Function server-side constant |
| `IMAGE_WEBP_QUALITY` | Move to Nhost Function server-side constant |
| `UPSTASH_REDIS_REST_URL` | Move to Nhost Functions `.secrets` |
| `UPSTASH_REDIS_REST_TOKEN` | Move to Nhost Functions `.secrets` |
| `JWT_SECRET` | Replaced by `NHOST_JWT_SECRET` |
| `ROOT_EMAIL` | Legacy seed credential — not needed in frontend |
| `ROOT_PASSWORD` | Same |
| `NEXT_PUBLIC_API_URL` | Was pointing to old local API server |
| `NEXT_PUBLIC_CLIENT_SECRET` | Review — if Airwallex-specific, keep; otherwise remove |
| `AIRWALLEX_API_KEY` | **Move to Nhost Functions `.secrets`** — must not be in browser |

### Variables to KEEP in admin console

| Variable | Why kept |
|---|---|
| `NHOST_JWT_SECRET` | Used by `middleware.ts` for JWT verification |
| `NEXT_PUBLIC_NHOST_SUBDOMAIN` | Used by `@nhost/nextjs` client |
| `NEXT_PUBLIC_NHOST_REGION` | Used by `@nhost/nextjs` client |
| `NEXT_PUBLIC_SITE_URL` | Redirect URLs for auth |
| `NEXT_PUBLIC_AIRWALLEX_ENV` | Airwallex Elements (browser SDK) |
| `AIRWALLEX_CLIENT_ID` | Airwallex Elements auth (browser-safe) |
| `NEXT_PUBLIC_FUNCTIONS_URL` | **NEW** — base URL for all Nhost Function calls |

### New variables to ADD to admin console `.env`

```bash
NEXT_PUBLIC_FUNCTIONS_URL=https://fcuycyemqprjrkbshlcj.functions.ap-southeast-1.nhost.run
```

---

## 12. Files to Delete

These files are entirely replaced by Nhost Auth and Nhost Functions:

```
src/app/api/login/route.ts          ← replaced by nhost.auth.signIn()
src/app/api/auth/check/route.ts     ← replaced by useAuthenticationStatus()
src/app/api/auth/logout/route.ts    ← replaced by nhost.auth.signOut()
```

If any other server-side data fetching files are found during the full source audit (server components using `graphql-request` + admin secret), those must also be refactored to call Nhost Functions via `admin-api.ts`.

---

## 13. Files to Create / Modify

### Create

| File | Purpose |
|---|---|
| `src/lib/nhost.ts` | Nhost client instance |
| `src/lib/admin-api.ts` | Typed fetch wrappers for all Nhost Function domains |

### Modify

| File | Change |
|---|---|
| `src/app/layout.tsx` | Add `NhostProvider` wrapping |
| `src/context/AuthContext.tsx` | Replace session cookie logic with `useAuthenticationStatus()`, `useUserData()`, `nhost.auth.signIn()`, `nhost.auth.signOut()` |
| `src/app/(auth)/signin/page.tsx` | Call `nhost.auth.signIn()` instead of `POST /api/login` |
| All pages using direct Hasura queries | Replace `graphql-request` + admin secret with `adminFetch()` calls to Nhost Functions |
| All pages using S3 upload | Replace with `nhost.storage.upload()` or `adminUploadApi.presign()` |
| `package.json` | Add `@nhost/nextjs @nhost/react`; remove `@aws-sdk/client-s3` |
| `.env` | Remove vars listed in §11; add `NEXT_PUBLIC_FUNCTIONS_URL` |

---

## 14. Gaps Identified — Missing Nhost Functions

The following functions are needed by the admin console but are **not in `dropiti-unified-backend-v2.md`**. These must be added in v3:

| Missing Function | Route | Why needed |
|---|---|---|
| Airwallex payments list | `GET /v1/admin/payments` | `/payments` page |
| Airwallex payment detail | `GET /v1/admin/payments/:id` | Payment detail view |
| Airwallex payment capture | `POST /v1/admin/payments/:id/capture` | Payment action |
| Airwallex payment cancel | `POST /v1/admin/payments/:id/cancel` | Payment action |
| Airwallex payment intents list | `GET /v1/admin/payment-intents` | `/payment-intents` page |
| Airwallex payment intent detail | `GET /v1/admin/payment-intents/:id` | Detail view |
| Airwallex beneficiaries list | `GET /v1/admin/beneficiaries` | `/beneficiaries` page |
| Airwallex beneficiary create | `POST /v1/admin/beneficiaries` | Create beneficiary |
| Airwallex beneficiary delete | `DELETE /v1/admin/beneficiaries/:id` | Remove beneficiary |
| Airwallex transfers list | `GET /v1/admin/transfers` | `/transfers` page |
| Airwallex transfer create | `POST /v1/admin/transfers` | Initiate transfer |
| Airwallex transfer status | `GET /v1/admin/transfers/:id` | Status polling |
| Admin batch upload | `POST /v1/admin/upload/batch` | Media library bulk upload |
| Admin single upload presign | `POST /v1/admin/upload/presign` | Single file validated upload |
| Upstash rate limit helper | `functions/_lib/ratelimit.ts` | Rate limiting for Airwallex proxy routes |
| Airwallex env helper | `functions/_lib/airwallex.ts` | Shared Airwallex API client using server-side key |

---

## 15. Decoupling Execution Order

### Step 1 — Install Nhost packages
```bash
yarn add @nhost/nextjs @nhost/react
yarn remove @aws-sdk/client-s3   # remove S3 SDK
```

### Step 2 — Create shared infra files
- `src/lib/nhost.ts` — Nhost client
- `src/lib/admin-api.ts` — typed fetch wrappers (stub all methods first)

### Step 3 — Auth replacement (highest risk, do first in isolation)
- Add `NhostProvider` to `src/app/layout.tsx`
- Rewrite `AuthContext.tsx` to use Nhost hooks
- Update `/signin` page to call `nhost.auth.signIn()`
- Test login → dashboard redirect via existing `middleware.ts`
- Test logout
- **Delete** `src/app/api/login/route.ts`, `auth/check/route.ts`, `auth/logout/route.ts`

### Step 4 — Deploy Nhost Functions (in parallel, different repo)
- Ensure `GET /v1/health` is live
- Deploy `admin/users/*` routes
- Deploy `admin/properties/*` routes
- Deploy `admin/offers/incoming` + `admin/transfer-ownership/*`
- Deploy `admin/analytics/*`

### Step 5 — Migrate pages one by one
Order by dependency / risk:

1. `/dashboard` → wire to `adminAnalyticsApi.dashboard()`
2. `/properties` → wire to `adminPropertiesApi.list()` + `.moderationQueue()`
3. `/customers` → wire to `adminUsersApi.list()` + `.get()`
4. `/user-management` → wire to `adminUsersApi.*`
5. `/transfers` → wire to `adminTransferApi.*`
6. `/media-library` → wire to `nhost.storage.upload()` + `adminUploadApi.presign()`
7. `/settings` → wire to `admin/settings/*` Nhost Functions
8. `/reports` → wire to `adminAnalyticsApi.*`
9. `/payments`, `/payment-intents`, `/beneficiaries` → wire to new Airwallex proxy Functions (requires Step 6)

### Step 6 — Deploy Airwallex proxy Nhost Functions
- Implement `_lib/airwallex.ts` in Nhost Functions repo
- Deploy `admin/payments/*`, `admin/payment-intents/*`, `admin/beneficiaries/*`, `admin/transfers/*`
- Wire admin console pages

### Step 7 — Upload migration
- Create `admin-media` bucket in Nhost Storage
- Migrate existing S3 files (one-time)
- Wire media library upload UI to `nhost.storage.upload()`
- Update stored S3 URLs in DB to Nhost Storage file IDs

### Step 8 — Env cleanup
- Remove all deprecated env vars from `.env`
- Add `NEXT_PUBLIC_FUNCTIONS_URL`
- Move secrets (`AIRWALLEX_API_KEY`, `HASURA_ADMIN_SECRET`, Upstash) to Nhost Functions `.secrets`

### Step 9 — Final audit
- `grep -r "SDK_BACKEND_URL\|HASURA_ADMIN_SECRET\|S3_BUCKET\|/api/login\|/api/auth" src/` — must return 0 results
- `grep -r "graphql-request" src/` — should return 0 results (or only non-admin-secret usage)
- Run full E2E test of all 11 protected routes

---

## 16. Verification Checklist

After all steps are complete:

- [ ] `GET /v1/health` returns `{ ok: true }` on Nhost Functions
- [ ] Admin can log in via Nhost Auth; `nhost_access_token` cookie is set
- [ ] `middleware.ts` correctly redirects unauthenticated users to `/signin`
- [ ] `middleware.ts` correctly redirects authenticated users away from `/signin`
- [ ] Non-admin JWT returns `403` on all `/v1/admin/*` Functions
- [ ] `/dashboard` loads KPI data from `adminAnalyticsApi.dashboard()`
- [ ] `/customers` lists users from `adminUsersApi.list()`
- [ ] User suspend/reactivate/ban works
- [ ] `/properties` moderation queue loads and approve/reject works
- [ ] `/transfers` shows transfer list and invite flow works end-to-end
- [ ] `/media-library` single upload works via Nhost Storage
- [ ] `/media-library` batch upload works via `adminUploadApi.presign()`
- [ ] `/payments` loads via Airwallex proxy Function
- [ ] `/payment-intents` loads via Airwallex proxy Function
- [ ] `/beneficiaries` loads via Airwallex proxy Function
- [ ] No `HASURA_ADMIN_SECRET` or `AIRWALLEX_API_KEY` visible in browser network tab
- [ ] No `S3_BUCKET_*` env vars remain in `.env`
- [ ] `src/app/api/` directory is empty or deleted
- [ ] `@aws-sdk/client-s3` is not in `package.json`
- [ ] `upstash` rate limiting is working from Nhost Functions, not from admin console

---

*Decouple plan authored: May 2026. Review against final source audit before executing each step.*