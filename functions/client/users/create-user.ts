import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const CreateUserSchema = z.object({
  nhost_user_id: z.string().uuid(),
  display_name: z.string().min(1),
  email: z.string().email(),
  photo_url: z.string().optional(),
  auth_provider: z.string().optional(),
});

const CHECK_USER_EXISTS = `
  query CheckUserExists($nhost_user_id: uuid!) {
    real_estate_user(where: { nhost_user_id: { _eq: $nhost_user_id } }, limit: 1) {
      uuid
      nhost_user_id
      email
    }
  }
`;

const CREATE_USER = `
  mutation CreateUser($user: real_estate_user_insert_input!) {
    insert_real_estate_user_one(object: $user) {
      uuid
      nhost_user_id
      display_name
      email
      auth_provider
      photo_url
    }
  }
`;

export default async function createUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const jwtUserId = getUserId(payload);
    const body = validateBody(req, res, CreateUserSchema);
    if (!body) return;

    if (jwtUserId && body.nhost_user_id !== jwtUserId) {
      fail(res, "Forbidden", 403);
      return;
    }

    const existing = await hasuraQuery<{
      real_estate_user?: Array<{ uuid: string; nhost_user_id: string; email: string }>;
    }>(CHECK_USER_EXISTS, { nhost_user_id: body.nhost_user_id });

    if (existing.errors?.length) {
      fail(res, "Failed to check user", 500);
      return;
    }

    if (existing.data?.real_estate_user?.length) {
      fail(res, "User already exists with this Nhost user ID", 409);
      return;
    }

    const user = {
      nhost_user_id: body.nhost_user_id,
      display_name: body.display_name,
      email: body.email.toLowerCase(),
      photo_url: body.photo_url ?? null,
      auth_provider: body.auth_provider ?? "email",
    };

    const created = await hasuraQuery<{
      insert_real_estate_user_one?: Record<string, unknown>;
    }>(CREATE_USER, { user });

    if (created.errors?.length) {
      fail(res, "Failed to create user", 500);
      return;
    }

    if (!created.data?.insert_real_estate_user_one) {
      fail(res, "Failed to create user", 500);
      return;
    }

    ok(res, created.data.insert_real_estate_user_one, 201);
  } catch (error) {
    console.error("[client/users/create-user]", error);
    fail(res, "Internal server error", 500);
  }
}
