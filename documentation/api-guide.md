# Dropiti Nhost — Functions API (local & cloud)

Base URL pattern:

- **Local (Nhost CLI):** `https://local.functions.local.nhost.run/v1/...`
- **Cloud:** `https://<subdomain>.functions.<region>.nhost.run/v1/...`

All function routes use the **`/v1/`** prefix plus the path derived from the file under `functions/` (see [AI_Rules.md](./AI_Rules.md) §3). Files live at `functions/client/...` and `functions/admin/...` — **not** `functions/v1/...` (that would double the `/v1` segment).

## Unified backend (client + admin)

**Canonical spec:** [dropiti-unified-backend-v5.md](./dropiti-unified-backend-v5.md) (Nhost API standard §0, route tables §7–§8). Older v2/v3 docs are historical.

| Namespace | On-disk | Example URL |
|-----------|---------|-------------|
| Client | `functions/client/<domain>/<action>.ts` | `GET /v1/client/properties/get-listings` |
| Admin | `functions/admin/<domain>/<action>.ts` | `GET /v1/admin/offers/incoming` |
| Ops | `functions/health.ts` | `GET /v1/health` |

**Nhost static routing:** A file `functions/admin/users/index.ts` is served at **`GET /v1/admin/users/index`**, not `/v1/admin/users`. The properties **list** is `functions/admin/properties/list.ts` → **`GET /v1/admin/properties/list`**. The admin console BFF maps **`GET admin/properties`** → **`admin/properties/list`**. Other property actions stay under `functions/admin/properties/<action>.ts`. The admin console uses REST-style paths (`admin/users`, `admin/properties/:uuid`, …) and the Next.js BFF rewrites them when needed (see [Admin console BFF](#admin-console-bff-nextjs)).

**Auth:** Protected routes require `Authorization: Bearer <nhost_access_token>`. Admin routes also require `"admin"` in JWT `x-hasura-allowed-roles` (see `_lib/auth.ts` `requireAdminRole`). Frontends must send the Bearer header when calling Functions on another origin — cookies are not forwarded automatically.

**Frontend env:** `NEXT_PUBLIC_FUNCTIONS_URL` — e.g. `https://<subdomain>.functions.<region>.nhost.run` (no trailing slash).

### Admin console BFF (Next.js)

Source: [dropiti-admin-console-2/src/lib/bff-route-rewrite.ts](../dropiti-admin-console-2/src/lib/bff-route-rewrite.ts). The browser calls `/api/v1/bff/functions/<path>`; the BFF proxies to `NEXT_PUBLIC_FUNCTIONS_URL/v1/<rewritten-path>`.

**Collection `GET` (BFF adds `/index` for Nhost `…/index.ts` handlers; **`GET admin/properties`** is rewritten to **`admin/properties/list`**):**

| Incoming path | Upstream `v1/…` path |
|---------------|----------------------|
| `GET admin/users` | `admin/users/index` |
| `GET admin/properties` | `admin/properties/list` |
| `GET admin/customers` | `admin/customers/index` |
| `GET admin/beneficiaries` | `admin/beneficiaries/index` |
| `GET admin/transfers` | `admin/transfers/index` |
| `GET admin/payment-intents` | `admin/payment-intents/index` |
| `GET admin/media` | `admin/media/index` |

**Resource IDs and actions (examples):**

| Incoming | Upstream |
|----------|----------|
| `GET admin/users/:userId` | `admin/users/get-user?userId=` |
| `GET` / `PUT admin/properties/:uuid` | `get-property` / `update-property` |
| `POST admin/properties` | `admin/properties/create-property` |
| `GET admin/offers/incoming/:offerId` | `admin/offers/incoming-detail?id=` |
| Airwallex REST paths | Legacy action segments (`get-customer`, `payments/cancel`, …) |

The full matrix lives in `bff-route-rewrite.ts`.

### v5 template compliance (audit notes)

Automated §0.12 checks and smoke notes: [v5-audit-results.log](./v5-audit-results.log).

**Intentional / known gaps vs [§0 templates](./dropiti-unified-backend-v5.md):**

- **JWT:** Handlers use `jsonwebtoken` in `_lib/auth.ts` with HS256; v5 prose often cites `jose` — behavior is equivalent if secret parsing in `_lib/env.ts` stays aligned with Nhost-injected secrets.
- **CORS / OPTIONS:** Most handlers rely on Nhost default CORS headers; v5 recommends explicit `OPTIONS` handling and `Access-Control-Allow-Methods` for non-GET. Consider a shared `_lib/cors.ts` when browsers call Functions directly from another origin.
- **`req.invocationId` in logs:** Not yet used uniformly; v5 recommends including it in `console.error` for Nhost log correlation.
- **Large exports:** `export-user-data` can return substantial JSON (e.g. nested lists); monitor size against the 6 MB Functions cap (§0.5).

**List pagination defaults:** Shared helper `_lib/admin-pagination.ts` and individual list handlers use **default `limit` 20**, max **100**, per §0.5.

**Bulk caps:** `admin/users/bulk` and `admin/properties/bulk` enforce **max 20** items per request; `admin/upload/batch` uses `_lib/upload-policy` **max 20** files.

## Routes (baseline)

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/v1/health` | None |
| `GET` | `/v1/echo` | Bearer |

### Client (`/v1/client/*`) — dropiti-v3

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/v1/client/users/create-user` | Bearer |
| `GET` | `/v1/client/users/get-user-by-id?id=` | Bearer |
| `GET` | `/v1/client/users/get-user-by-uuid?uuid=` | Bearer |
| `PATCH` | `/v1/client/users/update-user` | Bearer |
| `POST` | `/v1/client/properties/create-property` | Bearer |
| `GET` | `/v1/client/properties/get-drafts` | Bearer |
| `DELETE` | `/v1/client/properties/delete-draft?property_uuid=` | Bearer |
| `POST` | `/v1/client/properties/publish-draft` | Bearer |
| `GET` | `/v1/client/properties/get-listings` | Optional Bearer |
| `GET` | `/v1/client/properties/get-property?id=` | Optional Bearer |
| `GET` | `/v1/client/properties/get-property-by-uuid?uuid=` | Optional Bearer |
| `GET` | `/v1/client/properties/get-property-count-by-user` | Bearer |
| `PATCH` | `/v1/client/properties/update-property` | Bearer |
| `POST` | `/v1/client/offers/create-offer` | Bearer |
| `GET` | `/v1/client/offers/get-offers` | Bearer |
| `GET` | `/v1/client/offers/get-offers-by-id?offerId=` | Bearer |
| `GET` | `/v1/client/offers/get-offers-by-initiator` | Bearer |
| `POST` | `/v1/client/offers/accept-offer` | Bearer |
| `POST` | `/v1/client/offers/reject-offer` | Bearer |
| `POST` | `/v1/client/offers/counter-offer` | Bearer |
| `POST` | `/v1/client/offers/withdraw-offer` | Bearer |
| `GET` | `/v1/client/offers/get-negotiation-state?offerId=` | Bearer |
| `GET` | `/v1/client/offers/get-offer-actions?offerId=` | Bearer |
| `GET` | `/v1/client/offers/get-review-opportunities` | Bearer |
| `POST` | `/v1/client/reviews/create-review` | Bearer |
| `PATCH` | `/v1/client/reviews/update-review` | Bearer |
| `DELETE` | `/v1/client/reviews/delete-review?reviewId=` | Bearer |
| `GET` | `/v1/client/reviews/get-reviews-by-property?propertyUuid=` | Optional Bearer |
| `GET` | `/v1/client/reviews/get-reviews-by-user?userId=` | Optional Bearer |
| `POST` | `/v1/client/reviews/mark-helpful` | Bearer |
| `GET` | `/v1/client/tenants/index` | Bearer |
| `GET`/`PATCH` | `/v1/client/tenants/profile` | Bearer |
| `GET` | `/v1/client/transfer-ownership/validate?token=` | **Public** (no Bearer) |
| `POST` | `/v1/client/transfer-ownership/validate` | **Public** (legacy body `{ token }`) |
| `POST` | `/v1/client/transfer-ownership/claim` | Bearer (`token` in body; user id from JWT) |
| `POST` | `/v1/client/upload/presign` | Bearer |
| `GET` | `/v1/client/chat/get-chat-rooms` | Bearer |
| `POST` | `/v1/client/chat/get-or-create-room` | Bearer |
| `GET` | `/v1/client/chat/get-room-messages?roomId=` | Bearer |
| `POST` | `/v1/client/chat/send-message` | Bearer |
| `GET` | `/v1/client/notifications/index` | Bearer |
| `GET` | `/v1/client/notifications/unread-count` | Bearer |
| `POST` | `/v1/client/notifications/mark-read` | Bearer |
| `POST` | `/v1/client/notifications/mark-all-read` | Bearer |
| `POST` | `/v1/client/notifications/archive` | Bearer |

List endpoints return `{ ok: true, data: { items, pagination? } }`.

### Admin (`/v1/admin/*`)

All admin routes use `requireAdminRole()`. Mutating routes log to `admin_audit_logs` when the table is tracked in Hasura.

**Transfer ownership (v2)**

| Method | Path |
|--------|------|
| `POST` | `/v1/admin/transfer-ownership/invite` |
| `POST` | `/v1/admin/transfer-ownership/resend` |
| `GET` | `/v1/admin/transfer-ownership/status?propertyUuid=` |
| `PUT` | `/v1/admin/transfer-ownership/transfer` (direct reassignment) |

**Offers**

| Method | Path |
|--------|------|
| `GET` | `/v1/admin/offers/incoming` (+ `whatsappOutreachUrl` on items when `external_contact` set) |
| `GET` | `/v1/admin/offers/incoming/:offerId` |
| `GET` | `/v1/admin/offers/incoming-detail?id=` (legacy) |
| `GET` | `/v1/admin/offers/index` |
| `GET` | `/v1/admin/offers/get-offer?offerId=` |
| `GET` | `/v1/admin/offers/stalled?daysSinceLastActivity=` |
| `POST` | `/v1/admin/offers/remind`, `flag`, `cancel` |

**Users** (REST + legacy action aliases)

| Method | Path |
|--------|------|
| `GET` | `/v1/admin/users` (`?search=`, `?limit=`, `?offset=`) |
| `GET` | `/v1/admin/users/:userId` |
| `GET` | `/v1/admin/users/get-user?userId=` (legacy) |
| `POST` | `/v1/admin/users/verify-user`, `suspend-user`, `reactivate-user`, `ban-user`, `bulk` (max **20** user IDs) |
| `GET` | `/v1/admin/users/export-user-data?userId=` |
| `DELETE` | `/v1/admin/users/delete-user-data` |
| `GET` | `/v1/admin/users/activity-log?userId=` |

**Properties**

| Method | Path |
|--------|------|
| `GET` | `/v1/admin/properties/list` |
| `POST` | `/v1/admin/properties/create-property` (create; BFF may accept `POST admin/properties`) |
| `GET` | `/v1/admin/properties/:propertyUuid` |
| `PUT` | `/v1/admin/properties/:propertyUuid` |
| `GET` | `/v1/admin/properties/get-property?propertyUuid=` (legacy) |
| `PUT` | `/v1/admin/properties/update-property` (legacy) |
| `GET` | `/v1/admin/properties/moderation-queue` |
| `POST` | `/v1/admin/properties/approve`, `reject`, `flag`, `feature`, `bulk` (max **20** property UUIDs) |

**Administrator users**

| Method | Path |
|--------|------|
| `GET` | `/v1/admin/administrator-users/:id` |
| `PUT` | `/v1/admin/administrator-users/:id` |
| `DELETE` | `/v1/admin/administrator-users/:id` |
| `GET` | `/v1/admin/administrator-users/get?id=` (legacy) |

**Airwallex proxy (v3)** — server-side only; responses include `stub: true` when `AIRWALLEX_*` env is unset

| Method | Path |
|--------|------|
| `GET` | `/v1/admin/customers`, `/v1/admin/customers/:id` |
| `PUT` | `/v1/admin/customers/:id` |
| `DELETE` | `/v1/admin/customers/:id` |
| `POST` | `/v1/admin/customers/:id/client-secret` |
| `GET` | `/v1/admin/payment-intents`, `/v1/admin/payment-intents/:id` |
| `PUT` | `/v1/admin/payment-intents/:id` |
| `POST` | `/v1/admin/payments/:id/cancel` |
| `POST` | `/v1/admin/payments/:id/attach-method` |
| `GET` | `/v1/admin/beneficiaries`, `/v1/admin/beneficiaries/:id` |
| `PUT` | `/v1/admin/beneficiaries/:id` |
| `DELETE` | `/v1/admin/beneficiaries/:id` |
| `GET` | `/v1/admin/transfers` |
| `POST` | `/v1/admin/transfers/:id/cancel` |

Legacy action paths (`get-customer`, `payments/cancel`, etc.) remain as aliases during rollout.

**Admin upload (v3)** — AWS S3 presigned PUT (`S3_BUCKET_*` in Functions secrets)

| Method | Path |
|--------|------|
| `POST` | `/v1/admin/upload/presign` — body `{ filename, mimeType }` → `{ uploadUrl, s3Key, publicUrl, fileId }` |
| `POST` | `/v1/admin/upload/batch` — array of `{ filename, mimeType }`, max 20 |

**Reviews, reports, analytics, settings, support, audit**

| Domain | Paths |
|--------|-------|
| Reviews | `moderation-queue`, `approve`, `reject`, `update-review`, `delete-review` |
| Reports | `index`, `update`, `resolve`, `summary` |
| Analytics | `dashboard`, `users`, `properties`, `transactions`, `performance`, `export`, `custom-report` |
| Settings | `index`, `update`, `feature-flags`, `toggle-flag`, `email-templates`, `update-template` |
| Support | `support/tickets/*`, `support/canned-responses` |
| Audit | `audit-logs/index`, `export`, `admin-activity` |

### Real-time (Phase 4)

For **chat** and **notifications**, prefer Hasura subscriptions in the client for live updates; keep these Functions for mutations and cold loads.

### Deploy config

If `replaceConfig` fails with `null` for a section (`auth`, `storage`, etc.), run `nhost config pull` and merge into `nhost/nhost.toml` — partial configs must not send `null` for required objects (see [nhost-guide.md](./nhost-guide.md) → AI_Rules / this doc).

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

**Secrets** (see `secrets/dotsecrets.example`):

- v2: `DROPITI_CLIENT_ORIGIN`, `WHATSAPP_*`, `INVITATION_EXPIRY_DAYS`
- v3: `AIRWALLEX_API_KEY`, `AIRWALLEX_CLIENT_ID`, `AIRWALLEX_ENV` (`demo`|`prod`), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Upload: `S3_BUCKET_ACCESS_KEY`, `S3_BUCKET_SECRET_KEY`, `S3_BUCKET_NAME`, `S3_BUCKET_AWS_REGION`, `S3_BUCKET_DOMAIN_URL`

## Related

- [Nhost Functions — Getting started](https://docs.nhost.io/products/functions/guides/getting-started/)
- [JWT verification in Functions](https://docs.nhost.io/products/functions/guides/jwt-verification/)
