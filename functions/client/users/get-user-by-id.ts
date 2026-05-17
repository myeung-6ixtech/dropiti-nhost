import type { Request, Response } from "express";
import { requireAuth } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryInt } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

const GET_BY_ID = `
  query GetUserById($id: Int!) {
    real_estate_user(where: { id: { _eq: $id } }, limit: 1) {
      uuid
      nhost_user_id
      display_name
      first_name
      last_name
      email
      phone_number
      photo_url
      created_at
      updated_at
    }
  }
`;

export default async function getUserById(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const id = queryInt(req, "id");
    if (id === null) {
      fail(res, "id is required", 400);
      return;
    }

    const result = await hasuraQuery<{ real_estate_user?: unknown[] }>(GET_BY_ID, { id });
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
    console.error("[client/users/get-user-by-id]", error);
    fail(res, "Internal server error", 500);
  }
}
