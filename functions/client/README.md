# Client API routes (`/v1/client/*`)

Implemented Nhost Functions for the Dropiti v3 app. See [client-route-matrix.md](../../documentation/client-route-matrix.md) for the full v3 → Functions mapping.

## Layout

Handlers live at `functions/client/<domain>/<action>.ts` → `{FUNCTIONS_URL}/v1/client/<domain>/<action>`.

## Auth

- Protected routes: `requireAuth()` + `getUserId(payload)` (never trust body user ids for authorization).
- Public reads: `optionalAuth()` on `properties/get-listings`, `get-property`, `get-property-by-uuid`, review lists.

## v2 additions (unified backend)

- [x] `GET /v1/client/transfer-ownership/validate?token=` (public)
- [x] Admin transfer invite via `/v1/admin/transfer-ownership/invite|resend|status`
- [x] `_lib/whatsapp.ts`, `_lib/audit.ts`, `_lib/admin-offer-outreach.ts`

## Implemented checklist

- [x] `users/*` (4)
- [x] `properties/*` (9)
- [x] `offers/*` (11)
- [x] `reviews/*` (6)
- [x] `tenants/*` (2)
- [x] `transfer-ownership/*` (2)
- [x] `upload/presign` (validation stub; prefer `nhost.storage.upload()` in UI)
- [x] `chat/*` (4)
- [x] `notifications/*` (5)

## Frontend (dropiti-v3)

When `NEXT_PUBLIC_FUNCTIONS_URL` is set, `src/lib/api-client.ts` calls `/api/v1/bff/functions/client/...` which forwards Bearer auth to Functions.

## Real-time (Phase 4)

Prefer Hasura subscriptions for notification/chat **reads**; keep these Functions for mutations and initial loads (see [api-guide.md](../../documentation/api-guide.md)).
