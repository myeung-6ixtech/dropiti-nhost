import type { Request, Response } from "express";
import { requireAuth } from "../../_lib/auth";
import { optionalAuth } from "../../_lib/optional-auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryInt, queryString, UUID_RE } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

const FULL_USER_FIELDS = `
  uuid
  nhost_user_id
  display_name
  first_name
  last_name
  email
  photo_url
  auth_provider
  phone_number
  location
  about
  education
  occupation
  marital_status
  languages
  verified
  rating
  review_count
  response_rate
  response_time
  avg_response_time
  total_properties
  total_guests
  onboarding_complete
  preferences
  notification_settings
  privacy_settings
  created_at
  updated_at
`;

const GET_BY_NUMERIC_ID = `
  query GetUserByNumericId($id: Int!) {
    real_estate_user(where: { id: { _eq: $id } }, limit: 1) {
      ${FULL_USER_FIELDS}
    }
  }
`;

const GET_BY_NHOST_USER_ID = `
  query GetUserByNhostUserId($nhost_user_id: uuid!) {
    real_estate_user(where: { nhost_user_id: { _eq: $nhost_user_id } }, limit: 1) {
      ${FULL_USER_FIELDS}
    }
  }
`;

const GET_BY_NHOST_UUID = `
  query GetUserByNhostUuid($uuid: uuid!) {
    real_estate_user(where: { uuid: { _eq: $uuid } }, limit: 1) {
      ${FULL_USER_FIELDS}
    }
  }
`;

const GET_AUTH_USER_BY_ID = `
  query GetAuthUserById($id: uuid!) {
    users(where: { id: { _eq: $id } }, limit: 1) {
      id
      email
      avatarUrl
      displayName
    }
  }
`;

type AuthUserRow = {
  id: string;
  email?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
};

function authUserToProfile(auth: AuthUserRow): Record<string, unknown> {
  const email = auth.email?.trim() || "";
  return {
    uuid: auth.id,
    nhost_user_id: auth.id,
    display_name: auth.displayName?.trim() || email.split("@")[0] || "User",
    email,
    photo_url: auth.avatarUrl ?? null,
  };
}

export default async function getUserById(req: Request, res: Response): Promise<void> {
  try {
    const nhostUserId = queryString(req, "nhost_user_id");
    const numericId = queryInt(req, "id");

    if (!nhostUserId && numericId === null) {
      fail(res, "nhost_user_id or id is required", 400);
      return;
    }

    let user: unknown;

    if (nhostUserId) {
      if (!UUID_RE.test(nhostUserId)) {
        fail(res, "nhost_user_id must be a valid UUID", 400);
        return;
      }

      await optionalAuth(req, res);

      const result = await hasuraQuery<{ real_estate_user?: unknown[] }>(
        GET_BY_NHOST_USER_ID,
        { nhost_user_id: nhostUserId }
      );
      if (result.errors?.length) {
        fail(res, "Failed to fetch user", 500);
        return;
      }
      user = result.data?.real_estate_user?.[0];

      if (!user) {
        const byUuid = await hasuraQuery<{ real_estate_user?: unknown[] }>(
          GET_BY_NHOST_UUID,
          { uuid: nhostUserId }
        );
        if (!byUuid.errors?.length) {
          user = byUuid.data?.real_estate_user?.[0];
        }
      }

      if (!user) {
        const authResult = await hasuraQuery<{ users?: AuthUserRow[] }>(
          GET_AUTH_USER_BY_ID,
          { id: nhostUserId }
        );
        if (!authResult.errors?.length && authResult.data?.users?.[0]) {
          user = authUserToProfile(authResult.data.users[0]);
        }
      }
    } else {
      const payload = await requireAuth(req, res);
      if (!payload) return;

      const result = await hasuraQuery<{ real_estate_user?: unknown[] }>(
        GET_BY_NUMERIC_ID,
        { id: numericId }
      );
      if (result.errors?.length) {
        fail(res, "Failed to fetch user", 500);
        return;
      }
      user = result.data?.real_estate_user?.[0];
    }

    if (!user) {
      fail(res, "User not found", 404);
      return;
    }

    ok(res, user);
  } catch (error) {
    console.error("[client/users/get-user-by-id]", error);
    fail(res, "Internal server error", 500);
  }
}
