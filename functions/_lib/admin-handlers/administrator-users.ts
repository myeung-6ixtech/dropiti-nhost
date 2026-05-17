import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../auth";
import { logAdminAction } from "../audit";
import { hasuraQuery } from "../hasura";
import { hashAdministratorPassword } from "../administrator-users";
import { validateBody } from "../validate";
import { ok, fail } from "../respond";

const GET_ADMIN = `
  query GetAdministratorUser($id: uuid!) {
    real_estate_administrator_users_by_pk(id: $id) {
      id email name phone avatar address business_type company_name description
      status role_id permissions created_at updated_at last_login_at email_verified_at
    }
  }
`;

const UpdateSchema = z.object({
  id: z.string().uuid().optional(),
  updates: z.record(z.string(), z.unknown()),
});

const UPDATE = `
  mutation UpdateAdministratorUser($id: uuid!, $updates: real_estate_administrator_users_set_input!) {
    update_real_estate_administrator_users_by_pk(pk_columns: { id: $id }, _set: $updates) {
      id email name phone avatar address business_type company_name description status role_id permissions updated_at
    }
  }
`;

const CHECK = `
  query CheckAdministratorUser($id: uuid!) {
    real_estate_administrator_users_by_pk(id: $id) {
      id role_id email name
    }
  }
`;

const DELETE = `
  mutation DeleteAdministratorUser($id: uuid!) {
    delete_real_estate_administrator_users_by_pk(id: $id) {
      id email name
    }
  }
`;

export async function handleGetAdministratorUser(
  req: Request,
  res: Response,
  id: string
): Promise<void> {
  if (req.method !== "GET") {
    fail(res, "Method not allowed", 405);
    return;
  }
  const payload = await requireAdminRole(req, res);
  if (!payload) return;

  const result = await hasuraQuery<{
    real_estate_administrator_users_by_pk?: Record<string, unknown>;
  }>(GET_ADMIN, { id });

  if (result.errors?.length) {
    fail(res, "Failed to load user", 500);
    return;
  }

  const user = result.data?.real_estate_administrator_users_by_pk;
  if (!user) {
    fail(res, "User not found", 404);
    return;
  }

  ok(res, { user });
}

export async function handleUpdateAdministratorUser(
  req: Request,
  res: Response,
  id: string
): Promise<void> {
  if (req.method !== "PUT" && req.method !== "PATCH") {
    fail(res, "Method not allowed", 405);
    return;
  }
  const payload = await requireAdminRole(req, res);
  if (!payload) return;

  const raw = req.body as { id?: string; updates?: Record<string, unknown> };
  const updatesInput = raw.updates ?? (raw as Record<string, unknown>);
  const body = UpdateSchema.safeParse({ id, updates: updatesInput });
  if (!body.success) {
    fail(res, "Validation failed", 422, body.error.flatten());
    return;
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const u = body.data.updates;
  if (u.name !== undefined) updates.name = u.name;
  if (u.email !== undefined) {
    const email = String(u.email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail(res, "Invalid email format", 400);
      return;
    }
    updates.email = email;
  }
  if (u.phone !== undefined) updates.phone = u.phone || null;
  if (u.avatar !== undefined) updates.avatar = u.avatar || null;
  if (u.address !== undefined) updates.address = u.address || null;
  if (u.business_type !== undefined) updates.business_type = u.business_type || null;
  if (u.company_name !== undefined) updates.company_name = u.company_name || null;
  if (u.description !== undefined) updates.description = u.description || null;
  if (u.status !== undefined) updates.status = u.status;
  if (u.role_id !== undefined) updates.role_id = u.role_id;
  if (u.permissions !== undefined) updates.permissions = u.permissions;

  if (u.password && typeof u.password === "string") {
    if (u.password.length < 8) {
      fail(res, "Password must be at least 8 characters", 400);
      return;
    }
    const { hash, salt } = hashAdministratorPassword(u.password);
    updates.password_hash = hash;
    updates.password_salt = salt;
  }

  const result = await hasuraQuery<{
    update_real_estate_administrator_users_by_pk?: Record<string, unknown>;
  }>(UPDATE, { id, updates });

  if (result.errors?.length) {
    fail(res, result.errors[0]?.message ?? "Update failed", 500);
    return;
  }

  await logAdminAction(payload, "administrator.update", "administrator_user", id, body.data, req);
  ok(res, { user: result.data?.update_real_estate_administrator_users_by_pk });
}

export async function handleDeleteAdministratorUser(
  req: Request,
  res: Response,
  id: string
): Promise<void> {
  if (req.method !== "DELETE") {
    fail(res, "Method not allowed", 405);
    return;
  }
  const payload = await requireAdminRole(req, res);
  if (!payload) return;

  const check = await hasuraQuery<{
    real_estate_administrator_users_by_pk?: { role_id?: string };
  }>(CHECK, { id });

  const user = check.data?.real_estate_administrator_users_by_pk;
  if (!user) {
    fail(res, "User not found", 404);
    return;
  }
  if (user.role_id === "super_admin") {
    fail(res, "Super Admin cannot be deleted", 403);
    return;
  }

  const result = await hasuraQuery<{
    delete_real_estate_administrator_users_by_pk?: Record<string, unknown>;
  }>(DELETE, { id });

  if (result.errors?.length) {
    fail(res, result.errors[0]?.message ?? "Delete failed", 500);
    return;
  }

  await logAdminAction(payload, "administrator.delete", "administrator_user", id, {}, req);
  ok(res, { deleted: result.data?.delete_real_estate_administrator_users_by_pk });
}
