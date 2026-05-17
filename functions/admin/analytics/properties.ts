import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const Q = `query {
  total: real_estate_property_listing_aggregate { aggregate { count } }
  published: real_estate_property_listing_aggregate(where: { status: { _eq: "published" } }) {
    aggregate { count }
  }
}`;

export default async function analyticsProperties(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const result = await hasuraQuery<{
      total?: { aggregate?: { count?: number } };
      published?: { aggregate?: { count?: number } };
    }>(Q);
    ok(res, {
      total: result.data?.total?.aggregate?.count ?? 0,
      published: result.data?.published?.aggregate?.count ?? 0,
    });
  } catch (e) {
    console.error("[admin/analytics/properties]", e);
    fail(res, "Internal server error", 500);
  }
}
