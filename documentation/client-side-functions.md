# Client-Side Functions Reference

> **Purpose:** This document summarises every server-side API route currently living in `src/app/api/` for the Dropiti v3 Next.js build. It is intended to guide the decoupling of the frontend from this monorepo and the migration of backend logic to **Nhost** (Hasura GraphQL + Auth + Storage).
>
> **Status:** Structural summary based on file paths. Code-level detail (params, return shapes, auth guards) to be filled in once source files are reviewed.

---

## Table of Contents

1. [Infrastructure & GraphQL Layer](#1-infrastructure--graphql-layer)
2. [Users](#2-users)
3. [Tenants](#3-tenants)
4. [Properties](#4-properties)
5. [Offers](#5-offers)
6. [Reviews](#6-reviews)
7. [Chat](#7-chat)
8. [Notifications](#8-notifications)
9. [Transfer of Ownership](#9-transfer-of-ownership)
10. [Admin](#10-admin)
11. [Upload](#11-upload)
12. [Shared Types & Enums](#12-shared-types--enums)
13. [Test / Debug Routes](#13-test--debug-routes)
14. [Nhost Migration Notes](#14-nhost-migration-notes)

---

## 1. Infrastructure & GraphQL Layer

These files form the backbone of how the app communicates with Hasura/GraphQL today.

| File | Role |
|------|------|
| `src/app/api/graphql/client.ts` | **Browser-side GraphQL client** — instantiates the GraphQL client used by frontend components to query Hasura directly. |
| `src/app/api/graphql/serverClient.ts` | **Server-side GraphQL client** — a separate instance used inside Next.js API routes / server components with elevated privileges (likely uses an admin secret). |
| `src/app/api/graphql/index.ts` | Barrel export — re-exports client utilities and query helpers for use across the codebase. |
| `src/app/api/graphql/route.ts` | Next.js route handler that proxies or forwards GraphQL requests — acts as a middleware layer between the frontend and Hasura. |
| `src/app/api/graphql/types.ts` | Shared TypeScript types for GraphQL request/response shapes used across API routes. |
| `src/app/api/graphql/services/propertyService.ts` | **Property service layer** — encapsulates all GraphQL queries and mutations related to properties, called by the property route handlers. |
| `src/app/api/route.ts` | Root API route — likely a health check or entry point for the `/api` namespace. |
| `src/lib/api-client.ts` | **Frontend HTTP client** — the Axios/fetch wrapper used by the UI to call the Next.js API routes (i.e., the client-side half of the API bridge). |
| `src/types/api.ts` | Global TypeScript types for API request/response contracts shared across the whole app. |

---

## 2. Users

Handles user identity, creation, and retrieval. Maps to the `users` table in Hasura.

| Route | Method | Summary |
|-------|--------|---------|
| `v1/users/create-user` | `POST` | Creates a new user record in the database after signup (called post-auth). |
| `v1/users/get-user-by-id` | `GET` | Fetches a user by their internal numeric/sequential ID. |
| `v1/users/get-user-by-uuid` | `GET` | Fetches a user by their UUID (preferred identifier for external references). |
| `v1/users/update-user` | `PATCH/PUT` | Updates user profile fields (name, avatar, contact info, etc.). |

---

## 3. Tenants

Manages tenant-specific profile data, separate from the base user record.

| Route | Method | Summary |
|-------|--------|---------|
| `v1/tenants` | `GET` | Lists tenants — likely scoped to a landlord's properties or an admin view. |
| `v1/tenants/profile` | `GET / PATCH` | Gets or updates the extended tenant profile (preferences, history, verification status). |

---

## 4. Properties

The core domain of the app — covers the full lifecycle of a property listing from draft to published.

| Route | Method | Summary |
|-------|--------|---------|
| `v1/properties/create-property` | `POST` | Creates a new property record (initially as a draft). |
| `v1/properties/get-drafts` | `GET` | Returns all draft (unpublished) properties for the authenticated landlord. |
| `v1/properties/delete-draft` | `DELETE` | Deletes a property that is still in draft state. |
| `v1/properties/publish-draft` | `POST` | Transitions a draft property to published/live status. |
| `v1/properties/get-listings` | `GET` | Returns all published property listings — the public-facing search feed. |
| `v1/properties/get-property` | `GET` | Fetches a single property by a slug or short identifier. |
| `v1/properties/get-property-by-uuid` | `GET` | Fetches a single property by UUID — used for canonical references. |
| `v1/properties/get-property-count-by-user` | `GET` | Returns the count of properties owned by a given user — used for dashboard stats. |
| `v1/properties/update-property` | `PATCH/PUT` | Updates property details (description, price, images, availability, etc.). |

---

## 5. Offers

Manages the full negotiation lifecycle between tenants and landlords.

| Route | Method | Summary |
|-------|--------|---------|
| `v1/offers/create-offer` | `POST` | Submits a new offer from a tenant on a property. |
| `v1/offers/get-offers` | `GET` | Returns all offers visible to the authenticated user (tenant or landlord). |
| `v1/offers/get-offers-by-id` | `GET` | Fetches a specific offer by its ID. |
| `v1/offers/get-offers-by-initiator` | `GET` | Returns all offers created by a specific user (the tenant who initiated). |
| `v1/offers/accept-offer` | `POST` | Landlord accepts an incoming offer — triggers status change and likely notifications. |
| `v1/offers/reject-offer` | `POST` | Landlord rejects an offer — triggers status change and notification. |
| `v1/offers/counter-offer` | `POST` | Landlord or tenant responds with a counter-offer, continuing the negotiation. |
| `v1/offers/withdraw-offer` | `POST` | Tenant withdraws their own offer before a decision is made. |
| `v1/offers/get-negotiation-state` | `GET` | Returns the current state of a negotiation thread (e.g. pending, countered, accepted). |
| `v1/offers/get-offer-actions` | `GET` | Returns the available actions for the current user on a given offer (role-aware). |
| `v1/offers/get-review-opportunities` | `GET` | Returns offers that have concluded and are eligible for the user to leave a review. |

### Offer Enums

| File | Summary |
|------|---------|
| `src/app/api/enums/real_estate_offer_by_actions.ts` | Defines the enum of possible actions on an offer (e.g. `ACCEPT`, `REJECT`, `COUNTER`, `WITHDRAW`) — used to drive the offer action UI and server-side validation. |

---

## 6. Reviews

Allows users to leave, manage, and interact with reviews on properties and/or other users.

| Route | Method | Summary |
|-------|--------|---------|
| `v1/reviews/create-review` | `POST` | Creates a new review following a concluded tenancy or offer. |
| `v1/reviews/update-review` | `PATCH/PUT` | Allows the reviewer to edit their review within an allowed window. |
| `v1/reviews/delete-review` | `DELETE` | Removes a review — likely restricted to the author or an admin. |
| `v1/reviews/get-reviews-by-property` | `GET` | Fetches all reviews associated with a specific property. |
| `v1/reviews/get-reviews-by-user` | `GET` | Fetches all reviews associated with a specific user (as reviewee). |
| `v1/reviews/mark-helpful` | `POST` | Marks a review as helpful — a community voting mechanism. |

---

## 7. Chat

Real-time-ready messaging system between tenants and landlords, scoped to a room/conversation model.

| Route | Method | Summary |
|-------|--------|---------|
| `v1/chat/get-or-create-room` | `POST` | Finds an existing chat room between two users or creates one if none exists. |
| `v1/chat/get-chat-rooms` | `GET` | Returns all chat rooms the authenticated user is a participant of. |
| `v1/chat/get-room-messages` | `GET` | Fetches the message history for a specific chat room (paginated). |
| `v1/chat/send-message` | `POST` | Sends a new message into a chat room. |

---

## 8. Notifications

In-app notification system with read/archive state management.

| Route | Method | Summary |
|-------|--------|---------|
| `v1/notifications` | `GET` | Returns all notifications for the authenticated user. |
| `v1/notifications/unread-count` | `GET` | Returns the count of unread notifications — used for the badge/indicator in the UI. |
| `v1/notifications/mark-read` | `POST` | Marks a specific notification as read. |
| `v1/notifications/mark-all-read` | `POST` | Marks all of the user's notifications as read in one operation. |
| `v1/notifications/archive` | `POST` | Archives (soft-deletes) a notification so it no longer appears in the main feed. |

---

## 9. Transfer of Ownership

Handles the flow for transferring a property listing from one landlord to another via an invite/claim mechanism.

| Route | Method | Summary |
|-------|--------|---------|
| `v1/transfer-ownership/validate` | `POST` | Validates a transfer token/invite before allowing the claim step. |
| `v1/transfer-ownership/claim` | `POST` | The new owner claims the property using a validated transfer token. |

---

## 10. Admin

Admin-only routes for elevated operations — managing offers and orchestrating ownership transfers.

| Route | Method | Summary |
|-------|--------|---------|
| `v1/admin/offers/incoming` | `GET` | Returns all incoming offers across the platform — admin-level view not scoped to a single landlord. |
| `v1/admin/transfer-ownership/invite` | `POST` | Admin initiates a transfer-of-ownership by sending an invite to a new owner. |
| `v1/admin/transfer-ownership/resend` | `POST` | Resends the ownership transfer invite email if the original was missed. |
| `v1/admin/transfer-ownership/status` | `GET` | Returns the current status of a pending ownership transfer. |

---

## 11. Upload

Handles file/media uploads — currently appears to support both a direct route and an S3-backed route.

| Route | Method | Summary |
|-------|--------|---------|
| `v1/upload` | `POST` | General-purpose file upload handler — likely validates and stores files. |
| `v1/upload/s3` | `POST` | S3-specific upload route — generates a presigned URL or streams the file directly to an AWS S3 bucket. |

---

## 12. Shared Types & Enums

| File | Summary |
|------|---------|
| `src/types/api.ts` | Global API type definitions — request/response interfaces shared across routes and the frontend. |
| `src/app/api/graphql/types.ts` | GraphQL-specific types (query variables, response shapes). |
| `src/app/api/enums/real_estate_offer_by_actions.ts` | Offer action enum values used server- and client-side. |
| `src/lib/api-client.ts` | Axios/fetch wrapper — the frontend's interface for calling all `/api/v1/*` routes. |

---

## 13. Test / Debug Routes

These routes exist for development/integration testing and **should not be migrated or exposed in production**.

| Route | Summary |
|-------|---------|
| `api/test-env` | Checks that required environment variables are present and readable by the server. |
| `api/test-hasura` | Smoke-tests the connection to Hasura (GraphQL endpoint reachability + auth). |
| `api/test-s3` | Smoke-tests the S3 connection (bucket access, credentials). |
| `v1/reviews/test-review-schema` | Tests the review data schema against the database — likely a dev-time validation route. |

---

## 14. Nhost Migration Notes

When decoupling the frontend and moving to Nhost, the following mappings apply:

| Current Pattern | Nhost Replacement |
|----------------|-------------------|
| `graphql/client.ts` — browser GraphQL client | Replace with `@nhost/nhost-js` or Apollo Client pointed at Nhost's Hasura endpoint |
| `graphql/serverClient.ts` — admin secret client | Use Nhost service-role token for server-side calls |
| `graphql/route.ts` — GraphQL proxy route | Remove — frontend can call Nhost's Hasura endpoint directly with JWT from `nhost.auth` |
| `v1/users/create-user` | Replace with Nhost's `signUp` hook + a Hasura event trigger or `on_insert` action to create the user record |
| `v1/upload` & `v1/upload/s3` | Replace with `nhost.storage.upload()` — Nhost Storage wraps S3 natively |
| `v1/notifications/*` | Migrate to Hasura subscriptions (`useSubscription`) for real-time delivery |
| `v1/chat/*` | Migrate to Hasura subscriptions for live message streaming |
| `v1/admin/*` | Protect via Hasura role-based permissions (`x-hasura-role: admin`) instead of Next.js middleware |
| `api/test-hasura`, `api/test-s3`, `api/test-env` | Delete — replaced by Nhost dashboard health checks |
| `src/lib/api-client.ts` | Refactor — direct Hasura queries replace most REST calls; keep only for non-GraphQL external services |

---

*Document generated: May 2026 — to be updated with code-level detail (parameters, return types, auth requirements) once source files are fully reviewed.*