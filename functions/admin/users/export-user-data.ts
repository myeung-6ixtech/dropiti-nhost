import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryParam } from "../../_lib/admin-pagination";
import { UUID_RE } from "../../_lib/admin-offers-incoming";
import { ok, fail } from "../../_lib/respond";

const EXPORT = `
  query ExportUser($userId: uuid!) {
    real_estate_user(
      where: { _or: [{ nhost_user_id: { _eq: $userId } }, { uuid: { _eq: $userId } }] }
      limit: 1
    ) { nhost_user_id uuid email display_name first_name last_name phone_number created_at }
    properties: real_estate_property_listing(
      where: { landlord_user_id: { _eq: $userId } }
    ) { property_uuid title status created_at }
    offers: real_estate_offer(
      where: { _or: [{ initiator_user_id: { _eq: $userId } }, { recipient_user_id: { _eq: $userId } }] }
      limit: 500
    ) { id offer_key offer_status created_at }
  }
`;

export default async function exportUserData(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const userId = queryParam(req, "userId");
    if (!userId || !UUID_RE.test(userId)) { fail(res, "userId required", 400); return; }
    const result = await hasuraQuery(EXPORT, { userId });
    if (result.errors?.length) { fail(res, "Export failed", 500); return; }
    ok(res, result.data);
  } catch (e) {
    console.error("[admin/users/export-user-data]", e);
    fail(res, "Internal server error", 500);
  }
}
