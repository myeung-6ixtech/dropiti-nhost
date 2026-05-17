import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const DeleteReviewQuerySchema = z.object({
  reviewId: z.coerce.number().int().positive(),
});

const DELETE_REVIEW = `
  mutation DeleteReview($reviewId: Int!) {
    delete_real_estate_review_by_pk(id: $reviewId) {
      id
      review_uuid
    }
  }
`;

/**
 * DELETE /v1/admin/reviews/delete-review?reviewId=
 */
export default async function deleteReview(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "DELETE") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const parsed = DeleteReviewQuerySchema.safeParse({
      reviewId: req.query.reviewId,
    });
    if (!parsed.success) {
      fail(res, "reviewId is required", 400, parsed.error.flatten());
      return;
    }

    const result = await hasuraQuery<{
      delete_real_estate_review_by_pk?: { id: number; review_uuid: string } | null;
    }>(DELETE_REVIEW, { reviewId: parsed.data.reviewId });

    if (result.errors?.length) {
      fail(res, "Failed to delete review", 500);
      return;
    }

    if (!result.data?.delete_real_estate_review_by_pk) {
      fail(res, "Review not found", 404);
      return;
    }

    ok(res, { deleted: true, review: result.data.delete_real_estate_review_by_pk });
  } catch (error) {
    console.error("[admin/reviews/delete-review]", error);
    fail(res, "Failed to delete review", 500);
  }
}
