import type { Request, Response } from "express";
import { requireAuth } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryString, UUID_RE } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

const GET_BY_UUID = `
  query GetUserByUuid($uuid: uuid!) {
    real_estate_user(where: { uuid: { _eq: $uuid } }, limit: 1) {
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
    }
  }
`;

export default async function getUserByUuid(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const uuid = queryString(req, "uuid");
    if (!uuid || !UUID_RE.test(uuid)) {
      fail(res, "uuid is required", 400);
      return;
    }

    const result = await hasuraQuery<{ real_estate_user?: unknown[] }>(GET_BY_UUID, { uuid });
    if (result.errors?.length) {
      fail(res, "Failed to fetch user", 500);
      return;
    }

    const user = result.data?.real_estate_user?.[0];
    if (!user) {
      fail(res, "User not found", 404);
      return;
    }

    ok(res, user);
  } catch (error) {
    console.error("[client/users/get-user-by-uuid]", error);
    fail(res, "Internal server error", 500);
  }
}
