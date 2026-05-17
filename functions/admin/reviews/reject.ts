import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  reviewUuid: z.string().uuid(),
  reason: z.string().optional(),
});

const REJECT = `
  mutation RejectReview($reviewUuid: uuid!) {
    update_real_estate_review(
      where: { review_uuid: { _eq: $reviewUuid } }
      _set: { is_public: false }
    ) { affected_rows }
    delete_real_estate_review(where: { review_uuid: { _eq: $reviewUuid } }) {
      affected_rows
    }
  }
`;

export default async function rejectReview(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    const result = await hasuraQuery(REJECT, { reviewUuid: body.reviewUuid });
    if (result.errors?.length) { fail(res, "Reject failed", 500); return; }
    await logAdminAction(payload, "review.reject", "review", body.reviewUuid, body, req);
    ok(res, { rejected: true });
  } catch (e) {
    console.error("[admin/reviews/reject]", e);
    fail(res, "Internal server error", 500);
  }
}
