import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const LIST_USERS = `
  query ListRealEstateUsers($limit: Int!, $offset: Int!) {
    real_estate_user(
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
    ) {
      nhost_user_id
      uuid
      email
      display_name
      first_name
      last_name
      phone_number
      photo_url
      location
      created_at
      updated_at
      user_profile {
        defaultRole
      }
    }
    real_estate_user_aggregate {
      aggregate {
        count
      }
    }
  }
`;

type UserListRow = {
  nhost_user_id?: string;
  uuid?: string;
  email?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  photo_url?: string;
  location?: string;
  created_at?: string;
  updated_at?: string;
  user_profile?: { defaultRole?: string } | null;
};

/**
 * GET /v1/admin/users/get-all-users
 */
export default async function getAllUsers(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 100);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

    const result = await hasuraQuery<{
      real_estate_user?: UserListRow[];
      real_estate_user_aggregate?: { aggregate?: { count?: number } };
    }>(LIST_USERS, { limit, offset });

    if (result.errors?.length) {
      fail(res, "Failed to list users", 500);
      return;
    }

    const list = result.data?.real_estate_user ?? [];
    const total =
      result.data?.real_estate_user_aggregate?.aggregate?.count ?? list.length;

    const mapped = list.map((u) => {
      const name =
        u.display_name?.trim() ||
        [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
        null;
      return {
        id: u.nhost_user_id ?? u.uuid,
        email: u.email ?? null,
        name,
        default_role: u.user_profile?.defaultRole ?? null,
        avatar: u.photo_url ?? null,
        phone: u.phone_number ?? null,
        address: u.location ?? null,
        created_at: u.created_at ?? null,
        updated_at: u.updated_at ?? null,
        status: null,
      };
    });

    ok(res, {
      items: mapped,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("[admin/users/get-all-users]", error);
    fail(res, "Failed to list users", 500);
  }
}
