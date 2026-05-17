import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryInt } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

const DELETE_REVIEW = `
  mutation DeleteOwnReview($id: Int!, $reviewer_user_id: uuid!) {
    delete_real_estate_review(
      where: { id: { _eq: $id }, reviewer_user_id: { _eq: $reviewer_user_id } }
    ) {
      affected_rows
    }
  }
`;

export default async function deleteReview(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "DELETE") {
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

    const reviewId = queryInt(req, "reviewId");
    if (reviewId === null) {
      fail(res, "reviewId is required", 400);
      return;
    }

    const result = await hasuraQuery<{
      delete_real_estate_review?: { affected_rows: number };
    }>(DELETE_REVIEW, { id: reviewId, reviewer_user_id: userId });

    if ((result.data?.delete_real_estate_review?.affected_rows ?? 0) === 0) {
      fail(res, "Review not found", 404);
      return;
    }

    ok(res, { deleted: true });
  } catch (error) {
    console.error("[client/reviews/delete-review]", error);
    fail(res, "Internal server error", 500);
  }
}
