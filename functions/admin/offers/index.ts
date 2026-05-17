import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { parseListQuery, listEnvelope, queryParam } from "../../_lib/admin-pagination";
import { ok, fail } from "../../_lib/respond";

const LIST_OFFERS = `
  query AdminOffers($limit: Int!, $offset: Int!, $status: String) {
    real_estate_offer(
      where: { is_active: { _eq: true }, offer_status: { _eq: $status } }
      limit: $limit offset: $offset order_by: { created_at: desc }
    ) {
      id offer_key property_uuid initiator_user_id recipient_user_id
      proposing_rent_price proposing_rent_price_currency offer_status created_at updated_at
    }
    real_estate_offer_aggregate(
      where: { is_active: { _eq: true }, offer_status: { _eq: $status } }
    ) { aggregate { count } }
  }
`;

const LIST_ALL = `
  query AdminOffersAll($limit: Int!, $offset: Int!) {
    real_estate_offer(
      where: { is_active: { _eq: true } }
      limit: $limit offset: $offset order_by: { created_at: desc }
    ) {
      id offer_key property_uuid initiator_user_id recipient_user_id
      proposing_rent_price offer_status created_at updated_at
    }
    real_estate_offer_aggregate(where: { is_active: { _eq: true } }) {
      aggregate { count }
    }
  }
`;

export default async function adminOffersIndex(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const { limit, offset } = parseListQuery(req);
    const status = queryParam(req, "status");
    const variables: Record<string, unknown> = { limit, offset };
    const query = status ? LIST_OFFERS : LIST_ALL;
    if (status) variables.status = status;
    const result = await hasuraQuery<{
      real_estate_offer?: unknown[];
      real_estate_offer_aggregate?: { aggregate?: { count?: number } };
    }>(query, variables);
    if (result.errors?.length) { fail(res, "Failed to list offers", 500); return; }
    const items = result.data?.real_estate_offer ?? [];
    const total = result.data?.real_estate_offer_aggregate?.aggregate?.count ?? items.length;
    ok(res, listEnvelope(items, total, limit, offset));
  } catch (e) {
    console.error("[admin/offers/index]", e);
    fail(res, "Internal server error", 500);
  }
}
