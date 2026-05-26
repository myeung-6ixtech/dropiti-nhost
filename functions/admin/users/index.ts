import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parseListQuery, listEnvelope } from "../../_lib/admin-pagination";
import { ok, fail } from "../../_lib/respond";

/** Escape `%` and `_` for Postgres ILIKE via Hasura. */
function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseDefaultRoleFilter(req: Request): string | null {
  const raw =
    typeof req.query.defaultRole === "string"
      ? req.query.defaultRole.trim()
      : typeof req.query.role === "string"
        ? req.query.role.trim()
        : "";
  return raw.length > 0 ? raw : null;
}

function parseExcludeDefaultRoleFilter(req: Request): string | null {
  const raw =
    typeof req.query.excludeDefaultRole === "string"
      ? req.query.excludeDefaultRole.trim()
      : typeof req.query.excludeRole === "string"
        ? req.query.excludeRole.trim()
        : "";
  return raw.length > 0 ? raw : null;
}

/** Build Hasura `where` for user list (search + user_profile.defaultRole filters). */
function buildUsersWhere(
  search: string,
  defaultRole: string | null,
  excludeDefaultRole: string | null
): Record<string, unknown> | null {
  const and: Record<string, unknown>[] = [];

  if (defaultRole) {
    and.push({ user_profile: { defaultRole: { _eq: defaultRole } } });
  }

  if (excludeDefaultRole) {
    and.push({
      _not: { user_profile: { defaultRole: { _eq: excludeDefaultRole } } },
    });
  }

  if (search) {
    const pattern = `%${escapeIlikePattern(search)}%`;
    and.push({
      _or: [
        { email: { _ilike: pattern } },
        { display_name: { _ilike: pattern } },
        { first_name: { _ilike: pattern } },
        { last_name: { _ilike: pattern } },
      ],
    });
  }

  if (and.length === 0) return null;
  if (and.length === 1) return and[0] as Record<string, unknown>;
  return { _and: and };
}

const USER_LIST_FIELDS = `
  nhost_user_id
  uuid
  email
  display_name
  first_name
  last_name
  phone_number
  created_at
  updated_at
  user_profile { defaultRole }
`;

const LIST_USERS = `
  query AdminUsersIndex(
    $limit: Int!
    $offset: Int!
    $where: real_estate_user_bool_exp
    $order_by: [real_estate_user_order_by!]!
  ) {
    real_estate_user(
      limit: $limit
      offset: $offset
      where: $where
      order_by: $order_by
    ) {
      ${USER_LIST_FIELDS}
    }
    real_estate_user_aggregate(where: $where) {
      aggregate { count }
    }
  }
`;

/**
 * GET /v1/admin/users — list users (file: admin/users/index.ts).
 * Query: `limit`, `offset`, `search`, optional `defaultRole` / `excludeDefaultRole` on `user_profile.defaultRole`.
 */
export default async function adminUsersIndex(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") {
      fail(res, "Method not allowed", 405);
      return;
    }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const { limit, offset, search } = parseListQuery(req);
    const defaultRole = parseDefaultRoleFilter(req);
    const excludeDefaultRole = parseExcludeDefaultRoleFilter(req);
    const where = buildUsersWhere(search, defaultRole, excludeDefaultRole);

    const result = await hasuraQuery<{
      real_estate_user?: unknown[];
      real_estate_user_aggregate?: { aggregate?: { count?: number } };
    }>(LIST_USERS, {
      limit,
      offset,
      where,
      order_by: [{ created_at: "desc" }],
    });

    if (result.errors?.length) {
      const first = result.errors[0]?.message ?? "unknown";
      console.error("[admin/users/index] Hasura:", first, result.errors);
      fail(res, "Failed to list users", 500);
      return;
    }

    const items = result.data?.real_estate_user ?? [];
    const total =
      result.data?.real_estate_user_aggregate?.aggregate?.count ?? items.length;
    ok(res, listEnvelope(items, total, limit, offset));
  } catch (e) {
    console.error("[admin/users/index]", e);
    fail(res, "Internal server error", 500);
  }
}
