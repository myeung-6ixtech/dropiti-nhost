import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const MarkHelpfulSchema = z.object({
  reviewId: z.number().int().positive(),
});

const INCREMENT_HELPFUL = `
  mutation IncrementHelpful($id: Int!) {
    update_real_estate_review_by_pk(
      pk_columns: { id: $id }
      _inc: { helpful_count: 1 }
    ) {
      id
      helpful_count
    }
  }
`;

export default async function markHelpful(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const body = validateBody(req, res, MarkHelpfulSchema);
    if (!body) return;

    const result = await hasuraQuery<{
      update_real_estate_review_by_pk?: { id: number; helpful_count: number };
    }>(INCREMENT_HELPFUL, { id: body.reviewId });

    if (!result.data?.update_real_estate_review_by_pk) {
      fail(res, "Review not found", 404);
      return;
    }

    ok(res, result.data.update_real_estate_review_by_pk);
  } catch (error) {
    console.error("[client/reviews/mark-helpful]", error);
    fail(res, "Internal server error", 500);
  }
}
