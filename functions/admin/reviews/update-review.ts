import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const Schema = z.object({
  reviewUuid: z.string().uuid(),
  comment: z.string().optional(),
  editReason: z.string().optional(),
});

const UPDATE = `
  mutation AdminUpdateReview($reviewUuid: uuid!, $comment: String) {
    update_real_estate_review(
      where: { review_uuid: { _eq: $reviewUuid } }
      _set: { comment: $comment }
    ) { returning { id review_uuid comment } }
  }
`;

export default async function adminUpdateReview(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "PUT") { fail(res, "Method not allowed", 405); return; }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;
    const body = validateBody(req, res, Schema);
    if (!body) return;
    const result = await hasuraQuery(UPDATE, {
      reviewUuid: body.reviewUuid,
      comment: body.comment ?? null,
    });
    if (result.errors?.length) { fail(res, "Update failed", 500); return; }
    await logAdminAction(payload, "review.update", "review", body.reviewUuid, body, req);
    ok(res, { review: result.data });
  } catch (e) {
    console.error("[admin/reviews/update-review]", e);
    fail(res, "Internal server error", 500);
  }
}
