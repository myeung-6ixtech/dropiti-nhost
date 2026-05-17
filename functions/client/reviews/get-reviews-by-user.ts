import type { Request, Response } from "express";
import { optionalAuth } from "../../_lib/optional-auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryString, UUID_RE } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

const GET_REVIEWS = `
  query ReviewsByUser($userId: uuid!) {
    real_estate_review(
      where: { reviewee_user_id: { _eq: $userId }, is_public: { _eq: true } }
      order_by: { created_at: desc }
    ) {
      id
      review_uuid
      rating
      comment
      property_uuid
      created_at
    }
  }
`;

export default async function getReviewsByUser(req: Request, res: Response): Promise<void> {
  try {
    await optionalAuth(req, res);

    const userId = queryString(req, "userId") ?? queryString(req, "user_id");
    if (!userId || !UUID_RE.test(userId)) {
      fail(res, "userId is required", 400);
      return;
    }

    const result = await hasuraQuery<{ real_estate_review?: unknown[] }>(GET_REVIEWS, {
      userId,
    });

    if (result.errors?.length) {
      fail(res, "Failed to fetch reviews", 500);
      return;
    }

    ok(res, { items: result.data?.real_estate_review ?? [] });
  } catch (error) {
    console.error("[client/reviews/get-reviews-by-user]", error);
    fail(res, "Internal server error", 500);
  }
}
