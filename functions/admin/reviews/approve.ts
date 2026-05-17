import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({ reviewUuid: z.string().uuid() });

const APPROVE = `
  mutation ApproveReview($reviewUuid: uuid!) {
    update_real_estate_review(
      where: { review_uuid: { _eq: $reviewUuid } }
      _set: { is_public: true }
    ) { affected_rows returning { id review_uuid is_public } }
  }
`;

export default async function approveReview(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    const result = await hasuraQuery(APPROVE, body);
    if (result.errors?.length) { fail(res, "Approve failed", 500); return; }
    await logAdminAction(payload, "review.approve", "review", body.reviewUuid, {}, req);
    ok(res, { review: result.data });
  } catch (e) {
    console.error("[admin/reviews/approve]", e);
    fail(res, "Internal server error", 500);
  }
}
