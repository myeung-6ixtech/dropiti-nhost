import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parseListQuery, listEnvelope } from "../../_lib/admin-pagination";
import { ok, fail } from "../../_lib/respond";

const LIST_USERS = `
  query AdminUsersIndex($limit: Int!, $offset: Int!, $search: String) {
    real_estate_user(
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
      where: {
        _or: [
          { email: { _ilike: $search } }
          { display_name: { _ilike: $search } }
          { first_name: { _ilike: $search } }
          { last_name: { _ilike: $search } }
        ]
      }
    ) {
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
    }
    real_estate_user_aggregate(
      where: {
        _or: [
          { email: { _ilike: $search } }
          { display_name: { _ilike: $search } }
          { first_name: { _ilike: $search } }
          { last_name: { _ilike: $search } }
        ]
      }
    ) {
      aggregate { count }
    }
  }
`;

const LIST_USERS_NO_SEARCH = `
  query AdminUsersIndex($limit: Int!, $offset: Int!) {
    real_estate_user(limit: $limit, offset: $offset, order_by: { created_at: desc }) {
      nhost_user_id uuid email display_name first_name last_name phone_number created_at updated_at
      user_profile { defaultRole }
    }
    real_estate_user_aggregate { aggregate { count } }
  }
`;

export default async function adminUsersIndex(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const { limit, offset, search } = parseListQuery(req);
    const variables: Record<string, unknown> = { limit, offset };
    let query = LIST_USERS_NO_SEARCH;
    if (search) {
      query = LIST_USERS;
      variables.search = `%${search}%`;
    }
    const result = await hasuraQuery<{
      real_estate_user?: unknown[];
      real_estate_user_aggregate?: { aggregate?: { count?: number } };
    }>(query, variables);
    if (result.errors?.length) { fail(res, "Failed to list users", 500); return; }
    const items = result.data?.real_estate_user ?? [];
    const total = result.data?.real_estate_user_aggregate?.aggregate?.count ?? items.length;
    ok(res, listEnvelope(items, total, limit, offset));
  } catch (e) {
    console.error("[admin/users/index]", e);
    fail(res, "Internal server error", 500);
  }
}
