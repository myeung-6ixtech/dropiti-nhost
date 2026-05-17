import type { Request, Response } from "express";
import { requireAuth } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parsePagination, queryString } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

const LIST_TENANTS = `
  query ListTenantProfiles($limit: Int!, $offset: Int!, $status: String!) {
    real_estate_tenant_profile(
      where: { tenant_listing_status: { _eq: $status } }
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
    ) {
      id
      tenant_uuid
      user_id
      tenant_listing_title
      tenant_listing_status
      budget_min
      budget_max
      created_at
    }
  }
`;

export default async function tenantsIndex(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const { limit, offset } = parsePagination(req);
    const status = queryString(req, "status") ?? "active";

    const result = await hasuraQuery<{ real_estate_tenant_profile?: unknown[] }>(
      LIST_TENANTS,
      { limit, offset, status }
    );

    if (result.errors?.length) {
      fail(res, "Failed to list tenants", 500);
      return;
    }

    ok(res, { items: result.data?.real_estate_tenant_profile ?? [] });
  } catch (error) {
    console.error("[client/tenants/index]", error);
    fail(res, "Internal server error", 500);
  }
}
