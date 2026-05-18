import type { Request, Response } from "express";
import { requireAdminRole } from "../../../_lib/auth";
import { hasuraQuery } from "../../../_lib/hasura";
import { parseListQuery, listEnvelope } from "../../../_lib/admin-pagination";
import { ok, fail } from "../../../_lib/respond";

const LIST = `
  query SupportTickets($limit: Int!, $offset: Int!) {
    real_estate_support_tickets(
      limit: $limit offset: $offset order_by: { created_at: desc }
    ) {
      id ticket_number subject status priority category created_at assigned_to
    }
    real_estate_support_tickets_aggregate { aggregate { count } }
  }
`;

export default async function supportTicketsIndex(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const { limit, offset } = parseListQuery(req);
    const result = await hasuraQuery<{
      real_estate_support_tickets?: unknown[];
      real_estate_support_tickets_aggregate?: { aggregate?: { count?: number } };
    }>(LIST, { limit, offset });
    if (result.errors?.length) {
      ok(res, listEnvelope([], 0, limit, offset));
      return;
    }
    const items = result.data?.real_estate_support_tickets ?? [];
    const total =
      result.data?.real_estate_support_tickets_aggregate?.aggregate?.count ?? items.length;
    ok(res, listEnvelope(items, total, limit, offset));
  } catch (e) {
    console.error("[admin/support/tickets/index]", e);
    fail(res, "Internal server error", 500);
  }
}
