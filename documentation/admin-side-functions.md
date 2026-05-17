# Admin Console — API Functions Reference

> **Repo:** `myeung-6ixtech/dropiti-admin-console`
> **Stack:** Next.js 15 · React 19 · TypeScript · Hasura GraphQL · Nhost Auth (JWT)
> **Auth model:** Nhost JWT (`nhost_access_token` cookie) verified via `jose` in middleware. All protected routes enforce `x-hasura-allowed-roles` containing `"admin"`.
> **Status:** Sourced from live code — `middleware.ts`, `IMPLEMENTATION_SUMMARY.md`, `ADMIN_AUTH_IMPLEMENTATION.md`, `ADMIN_AUTH_SETUP.md`.

---

## Table of Contents

1. [Middleware — Route Guard](#1-middleware--route-guard)
2. [Authentication APIs](#2-authentication-apis)
   - [POST `/api/login`](#post-apilogin)
   - [GET `/api/auth/check`](#get-apiauthcheck)
   - [POST `/api/auth/logout`](#post-apiauthlogout)
3. [Permission Utility — `src/lib/permissions.ts`](#3-permission-utility--srclibpermissionsts)
4. [Auth Context — `src/context/AuthContext.tsx`](#4-auth-context--srccontextauthcontexttsx)
5. [Protected Routes](#5-protected-routes)
6. [Database Tables in Use](#6-database-tables-in-use)
7. [Role Definitions](#7-role-definitions)

---

## 1. Middleware — Route Guard

**File:** `middleware.ts` (root)

The middleware runs on every non-static, non-API request. It is the primary enforcement layer for authentication.

**Cookie read:** `nhost_access_token`

**Logic:**

1. Skips all `/api/*` paths entirely (no auth enforcement, avoids redirect loops).
2. For protected routes: checks for the `nhost_access_token` cookie, verifies it as a JWT using `NHOST_JWT_SECRET`, and confirms the decoded `x-hasura-allowed-roles` array contains `"admin"`. Fails → redirect to `/signin` + delete cookie.
3. For `/signin` and `/`: if a valid admin token is already present, redirects to `/dashboard`.

**Environment variable required:** `NHOST_JWT_SECRET`

**Protected route list** (exact prefix match):

| Path prefix | Purpose |
|---|---|
| `/dashboard` | Main admin dashboard |
| `/customers` | Customer management |
| `/payments` | Payment records |
| `/transfers` | Transfer management |
| `/beneficiaries` | Beneficiary records |
| `/settings` | System settings |
| `/reports` | Reporting |
| `/properties` | Property management |
| `/payment-intents` | Payment intent management |
| `/user-management` | Admin user management |
| `/media-library` | Media/file library |

**Matcher config:** Excludes `api`, `_next/static`, `_next/image`, `favicon.ico`, `images`, `public`.

---

## 2. Authentication APIs

### POST `/api/login`

**File:** `src/app/api/login/route.ts`

Authenticates an admin user against `real_estate.administrator_users`, creates a database-backed session, and sets an HTTP-only cookie.

**Request body:**
```json
{
  "email": "admin@dropiti.com",
  "password": "Admin@123"
}
```

**Internal steps:**
1. Queries Hasura for the administrator record by email.
2. Verifies the password using PBKDF2 (SHA-512, 100,000 iterations, 64-byte key, per-user salt).
3. Checks account status (`active` / `inactive` / `suspended`).
4. Enforces rate limiting — max **5 failed attempts** per **15-minute** window per email.
5. Generates a 32-byte cryptographically random session token.
6. Inserts session record into `real_estate.user_sessions` with a **24-hour** expiry.
7. Logs the attempt (success or failure) to `real_estate.user_login_history` with IP and user-agent.
8. Sets `admin_session` HTTP-only cookie (`SameSite: Strict`, `Secure` in production).
9. Returns user object with merged role + user-level permissions.

**Success response `200`:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "admin@dropiti.com",
    "name": "System Administrator",
    "phone": "+1234567890",
    "role": "super_admin",
    "permissions": ["*"],
    "avatar": null
  }
}
```

**Error responses:**
```json
{ "error": "Invalid email or password" }         // 401 — bad credentials
{ "error": "Account is inactive" }               // 403 — account status
{ "error": "Too many failed login attempts" }    // 429 — rate limited
```

**Config constants (in route file):**

| Constant | Default |
|---|---|
| `SESSION_EXPIRY_HOURS` | `24` |
| `MAX_FAILED_ATTEMPTS` | `5` |
| `LOCKOUT_DURATION_MINUTES` | `15` |
| `PBKDF2_ITERATIONS` | `100000` |
| `PBKDF2_KEYLEN` | `64` |
| `PBKDF2_DIGEST` | `sha512` |

---

### GET `/api/auth/check`

**File:** `src/app/api/auth/check/route.ts`

Validates the current session on every page load. Called by `AuthContext` on mount to restore session state without requiring re-login.

**Auth input:** Reads `admin_session` cookie from the request.

**Internal steps:**
1. Reads session token from cookie.
2. Queries `real_estate.user_sessions` in Hasura — checks `is_active = true` and `expires_at > NOW()`.
3. Loads the linked administrator record and verifies account status is still `active`.
4. Aggregates permissions: role-level permissions merged with any user-level permission overrides.
5. Returns authenticated state and full user object.

**Authenticated response `200`:**
```json
{
  "isAuthenticated": true,
  "user": {
    "id": "uuid",
    "email": "admin@dropiti.com",
    "name": "System Administrator",
    "role": "super_admin",
    "permissions": ["*"]
  }
}
```

**Unauthenticated response `200`:**
```json
{
  "isAuthenticated": false,
  "user": null
}
```

> Note: Returns `200` in both cases — the `isAuthenticated` boolean is the signal, not the HTTP status.

---

### POST `/api/auth/logout`

**File:** `src/app/api/auth/logout/route.ts`

Invalidates the active session in the database and clears the auth cookie.

**Auth input:** Reads `admin_session` cookie from the request.

**Internal steps:**
1. Reads session token from cookie.
2. Updates `real_estate.user_sessions` — sets `is_active = false` for the matching token.
3. Clears the `admin_session` cookie from the response.

**Response `200`:**
```json
{ "success": true }
```

---

## 3. Permission Utility — `src/lib/permissions.ts`

A stateless helper module used by both API routes and UI components to evaluate whether a user holds a given permission.

### `hasPermission(userPermissions: string[], required: string): boolean`

Returns `true` if the user's permission array satisfies the required permission. Supports three match modes:

| Pattern | Example | Meaning |
|---|---|---|
| Wildcard all | `"*"` | Super admin — grants everything |
| Category wildcard | `"users:*"` | All actions within `users` |
| Exact | `"users:view"` | That specific permission only |

### `PERMISSIONS` constants

Pre-defined permission strings used across the codebase to avoid magic strings. Categories observed in role definitions:

| Category | Permissions |
|---|---|
| `system` | `system:*`, `system:view` |
| `users` | `users:*`, `users:view`, `users:create`, `users:edit`, `users:delete` |
| `roles` | `roles:*` |
| `content` | `content:*`, `content:view` |
| `media` | `media:*` |
| `analytics` | `analytics:*` |
| `reports` | `reports:*` |
| `support` | `support:*` |
| `settings` | `settings:*` |

### Usage in components:
```ts
import { useAuth } from '@/context/AuthContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

const { user } = useAuth();
const canEdit = hasPermission(user?.permissions ?? [], PERMISSIONS.USERS_EDIT);
```

### Usage in API routes:
```ts
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

if (!hasPermission(user.permissions, PERMISSIONS.USERS_CREATE)) {
  return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
}
```

---

## 4. Auth Context — `src/context/AuthContext.tsx`

React context that maintains the authenticated admin user state across the app. Wraps the three auth API calls into a single interface.

### Interface

```ts
interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  permissions: string[];
  avatar: string | null;
}

interface AuthContext {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
}
```

### `hasPermission(permission: string): boolean`

Convenience wrapper around the `permissions.ts` utility — pre-bound to `user.permissions` so components don't need to pass the array manually.

```ts
const { hasPermission } = useAuth();

if (hasPermission('users:create')) {
  // render create button
}
```

### Lifecycle

On mount, `AuthContext` calls `GET /api/auth/check` to restore session state. This is the only auto-call made — all other auth operations (login, logout) are triggered explicitly by user action.

---

## 5. Protected Routes

All routes below require a valid `nhost_access_token` JWT cookie with `"admin"` in `x-hasura-allowed-roles`. Enforced entirely at the middleware layer — no per-page auth checks needed.

| Route | Admin Purpose |
|---|---|
| `/dashboard` | Overview metrics and system status |
| `/customers` | View and manage customer accounts |
| `/payments` | Payment record management |
| `/transfers` | Transfer of ownership and fund transfers |
| `/beneficiaries` | Beneficiary record management |
| `/settings` | System and platform configuration |
| `/reports` | Analytics and reporting views |
| `/properties` | Property listing management |
| `/payment-intents` | Payment intent lifecycle management |
| `/user-management` | Admin user and role management |
| `/media-library` | Uploaded files and media assets |

**Public routes** (no auth required): `/signin`, static assets.

---

## 6. Database Tables in Use

All tables live in the `real_estate` PostgreSQL schema, tracked in Hasura.

| Table | Purpose |
|---|---|
| `real_estate.administrator_users` | Admin user records — credentials, status, role assignment |
| `real_estate.user_sessions` | Active session tokens with expiry and `is_active` flag |
| `real_estate.user_login_history` | Audit log of all login attempts (success + failure) |
| `real_estate.admin_roles` | Role definitions with permission arrays |
| `real_estate.user_roles` | User-to-role assignments (junction table) |

### Key fields — `administrator_users`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `email` | text | Unique, case-sensitive |
| `password_hash` | text | PBKDF2 hash |
| `password_salt` | text | Unique per user |
| `status` | enum | `active` / `inactive` / `suspended` |
| `role_id` | text | FK → `admin_roles.id` |
| `permissions` | text[] | User-level permission overrides |
| `last_login_at` | timestamptz | Updated on successful login |
| `email_verified_at` | timestamptz | Nullable |

### Key fields — `user_sessions`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → `administrator_users.id` |
| `token` | text | 32-byte random hex |
| `expires_at` | timestamptz | 24h from creation |
| `is_active` | boolean | Set to `false` on logout |
| `ip_address` | text | Recorded at login |
| `user_agent` | text | Recorded at login |

---

## 7. Role Definitions

Seven roles are pre-seeded in `real_estate.admin_roles`.

| Role ID | Display Name | Default Permissions |
|---|---|---|
| `super_admin` | Super Administrator | `["*"]` — full access |
| `system_admin` | System Administrator | `["system:*", "users:*", "settings:*"]` |
| `user_admin` | User Administrator | `["users:*", "roles:*"]` |
| `content_admin` | Content Administrator | `["content:*", "media:*"]` |
| `analytics_admin` | Analytics Administrator | `["analytics:*", "reports:*"]` |
| `support_admin` | Support Administrator | `["support:*", "users:view"]` |
| `viewer` | Viewer | `["system:view", "users:view", "content:view"]` |

User-level `permissions` overrides on `administrator_users` are merged with the role permissions at session check time, allowing per-user permission extensions without changing the role definition.

---

*Document generated: May 2026. Based on `middleware.ts` source and `IMPLEMENTATION_SUMMARY.md`, `ADMIN_AUTH_IMPLEMENTATION.md`, `ADMIN_AUTH_SETUP.md` from the `dropiti-admin-console` repo at commit HEAD on `main`.*