import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const CreateReviewSchema = z.object({
  offerId: z.number().int().positive(),
  offerUuid: z.string().uuid(),
  reviewType: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string().min(1),
  reviewedUserId: z.string().uuid(),
  propertyUuid: z.string().uuid().optional(),
});

const CREATE_REVIEW = `
  mutation CreateReview($review: real_estate_review_insert_input!) {
    insert_real_estate_review_one(object: $review) {
      id
      review_uuid
      rating
      comment
      created_at
    }
  }
`;

export default async function createReview(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const reviewerId = getUserId(payload);
    if (!reviewerId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const body = validateBody(req, res, CreateReviewSchema);
    if (!body) return;

    const review = {
      review_uuid: randomUUID(),
      offer_uuid: body.offerUuid,
      review_type: body.reviewType,
      rating: body.rating,
      comment: body.comment,
      reviewer_user_id: reviewerId,
      reviewee_user_id: body.reviewedUserId,
      property_uuid: body.propertyUuid ?? null,
      is_public: true,
      is_verified: false,
      helpful_count: 0,
    };

    const result = await hasuraQuery<{ insert_real_estate_review_one?: Record<string, unknown> }>(
      CREATE_REVIEW,
      { review }
    );

    if (result.errors?.length || !result.data?.insert_real_estate_review_one) {
      fail(res, "Failed to create review", 500);
      return;
    }

    ok(res, result.data.insert_real_estate_review_one, 201);
  } catch (error) {
    console.error("[client/reviews/create-review]", error);
    fail(res, "Internal server error", 500);
  }
}
