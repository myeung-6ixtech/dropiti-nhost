# Dropiti Nhost — Functions API (local & cloud)

Base URL pattern:

- **Local (Nhost CLI):** `https://local.functions.local.nhost.run/v1/...`
- **Cloud:** `https://<subdomain>.functions.<region>.nhost.run/v1/...`

All function routes use the **`/v1/`** prefix plus the path derived from the file under `functions/` (see [AI_Rules.md](./AI_Rules.md) §3). Files live at `functions/client/...` and `functions/admin/...` — **not** `functions/v1/...` (that would double the `/v1` segment).

## Unified backend (client + admin)

See [dropiti-unified-backend-v2.md](./dropiti-unified-backend-v2.md) (v2 spec) and [schema-v2-notes.md](./schema-v2-notes.md) (Hasura prerequisites).

| Namespace | On-disk | Example URL |
|-----------|---------|-------------|
| Client | `functions/client/<domain>/<action>.ts` | `GET /v1/client/properties/get-listings` |
| Admin | `functions/admin/<domain>/<action>.ts` | `GET /v1/admin/offers/incoming` |
| Ops | `functions/health.ts` | `GET /v1/health` |

**Auth:** Protected routes require `Authorization: Bearer <nhost_access_token>`. Admin routes also require `"admin"` in JWT `x-hasura-allowed-roles` (see `_lib/auth.ts` `requireAdminRole`). Frontends must send the Bearer header when calling Functions on another origin — cookies are not forwarded automatically.

**Frontend env:** `NEXT_PUBLIC_FUNCTIONS_URL` — e.g. `https://<subdomain>.functions.<region>.nhost.run` (no trailing slash).

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
| `GET` | `/v1/admin/offers/incoming-detail?id=` |
| `GET` | `/v1/admin/offers/index` |
| `GET` | `/v1/admin/offers/get-offer?offerId=` |
| `GET` | `/v1/admin/offers/stalled?daysSinceLastActivity=` |
| `POST` | `/v1/admin/offers/remind`, `flag`, `cancel` |

**Users**

| Method | Path |
|--------|------|
| `GET` | `/v1/admin/users/index` (search via `?search=`) |
| `GET` | `/v1/admin/users/get-all-users` (legacy alias) |
| `GET` | `/v1/admin/users/get-user?userId=` |
| `PUT`/`PATCH` | `/v1/admin/users/update-user` |
| `POST` | `/v1/admin/users/verify-user`, `suspend-user`, `reactivate-user`, `ban-user`, `bulk` |
| `GET` | `/v1/admin/users/export-user-data?userId=` |
| `DELETE` | `/v1/admin/users/delete-user-data` |
| `GET` | `/v1/admin/users/activity-log?userId=` |

**Properties**

| Method | Path |
|--------|------|
| `GET` | `/v1/admin/properties/index` |
| `GET` | `/v1/admin/properties/get-property?propertyUuid=` |
| `GET` | `/v1/admin/properties/moderation-queue` |
| `GET` | `/v1/admin/properties/reports?propertyUuid=` |
| `POST` | `/v1/admin/properties/approve`, `reject`, `flag`, `feature`, `bulk` |
| `PUT` | `/v1/admin/properties/update-property` |

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

**v2 additions** (see `secrets/dotsecrets.example`): `DROPITI_CLIENT_ORIGIN`, `WHATSAPP_PROVIDER` (`stub`|`meta`|`twilio`), `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `INVITATION_EXPIRY_DAYS`.

## Related

- [Nhost Functions — Getting started](https://docs.nhost.io/products/functions/guides/getting-started/)
- [JWT verification in Functions](https://docs.nhost.io/products/functions/guides/jwt-verification/)
