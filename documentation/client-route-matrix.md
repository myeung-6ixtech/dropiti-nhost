# Client route matrix (`dropiti-v3` → Nhost Functions)

Source: `dropiti-v3/src/app/api/v1/**/route.ts` cross-checked with [client-side-functions.md](./client-side-functions.md) and [dropiti-unified-backend.md](./dropiti-unified-backend.md) §6.

| v3 path | Nhost file | Methods | Auth |
|---------|------------|---------|------|
| `users/create-user` | `client/users/create-user.ts` | POST | JWT (body `nhost_user_id` must match JWT) |
| `users/get-user-by-id` | `client/users/get-user-by-id.ts` | GET | JWT |
| `users/get-user-by-uuid` | `client/users/get-user-by-uuid.ts` | GET | JWT |
| `users/update-user` | `client/users/update-user.ts` | PATCH | JWT (self only) |
| `properties/*` | `client/properties/*.ts` | various | JWT / optional JWT for reads |
| `offers/*` | `client/offers/*.ts` | various | JWT |
| `reviews/*` | `client/reviews/*.ts` | various | JWT |
| `tenants`, `tenants/profile` | `client/tenants/*.ts` | GET/PATCH | JWT |
| `transfer-ownership/*` | `client/transfer-ownership/*.ts` | POST | JWT |
| `upload`, `upload/s3` | `client/upload/presign.ts` | POST | JWT |
| `chat/*` | `client/chat/*.ts` | various | JWT |
| `notifications/*` | `client/notifications/*.ts` | various | JWT |

**Excluded:** `api/graphql/*`, `api/test-*`, `v1/reviews/test-review-schema`, `v1/admin/*` (use `functions/admin/`).
