import type { Request, Response } from "express";
import { optionalAuth } from "../../_lib/optional-auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryString, UUID_RE } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

const GET_REVIEWS = `
  query ReviewsByProperty($property_uuid: uuid!) {
    real_estate_review(
      where: { property_uuid: { _eq: $property_uuid }, is_public: { _eq: true } }
      order_by: { created_at: desc }
    ) {
      id
      review_uuid
      rating
      comment
      reviewer_user_id
      reviewee_user_id
      created_at
    }
  }
`;

export default async function getReviewsByProperty(
  req: Request,
  res: Response
): Promise<void> {
  try {
    await optionalAuth(req, res);

    const propertyUuid = queryString(req, "propertyUuid") ?? queryString(req, "property_uuid");
    if (!propertyUuid || !UUID_RE.test(propertyUuid)) {
      fail(res, "propertyUuid is required", 400);
      return;
    }

    const result = await hasuraQuery<{ real_estate_review?: unknown[] }>(GET_REVIEWS, {
      property_uuid: propertyUuid,
    });

    if (result.errors?.length) {
      fail(res, "Failed to fetch reviews", 500);
      return;
    }

    ok(res, { items: result.data?.real_estate_review ?? [] });
  } catch (error) {
    console.error("[client/reviews/get-reviews-by-property]", error);
    fail(res, "Internal server error", 500);
  }
}
