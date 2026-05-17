import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const UpdateReviewSchema = z.object({
  reviewId: z.number().int().positive(),
  rating: z.number().min(1).max(5).optional(),
  comment: z.string().min(1).optional(),
});

const UPDATE_REVIEW = `
  mutation UpdateReview($id: Int!, $reviewer_user_id: uuid!, $updates: real_estate_review_set_input!) {
    update_real_estate_review(
      where: { id: { _eq: $id }, reviewer_user_id: { _eq: $reviewer_user_id } }
      _set: $updates
    ) {
      returning { id review_uuid rating comment updated_at }
    }
  }
`;

export default async function updateReview(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "PATCH" && req.method !== "PUT") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const body = validateBody(req, res, UpdateReviewSchema);
    if (!body) return;

    const { reviewId, ...updates } = body;
    const result = await hasuraQuery<{
      update_real_estate_review?: { returning?: unknown[] };
    }>(UPDATE_REVIEW, {
      id: reviewId,
      reviewer_user_id: userId,
      updates: { ...updates, updated_at: new Date().toISOString() },
    });

    const row = result.data?.update_real_estate_review?.returning?.[0];
    if (result.errors?.length || !row) {
      fail(res, "Review not found", 404);
      return;
    }

    ok(res, row);
  } catch (error) {
    console.error("[client/reviews/update-review]", error);
    fail(res, "Internal server error", 500);
  }
}
