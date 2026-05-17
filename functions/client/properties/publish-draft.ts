import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const PublishSchema = z.object({
  property_uuid: z.string().uuid(),
});

const PUBLISH_DRAFT = `
  mutation PublishDraft($property_uuid: uuid!, $landlord_user_id: uuid!) {
    update_real_estate_property_listing(
      where: {
        property_uuid: { _eq: $property_uuid }
        landlord_user_id: { _eq: $landlord_user_id }
      }
      _set: {
        status: "published"
        completion_percentage: 100
        last_saved_at: "now()"
        updated_at: "now()"
      }
    ) {
      affected_rows
      returning {
        id
        property_uuid
        title
        status
        updated_at
      }
    }
  }
`;

export default async function publishDraft(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
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

    const body = validateBody(req, res, PublishSchema);
    if (!body) return;

    const result = await hasuraQuery<{
      update_real_estate_property_listing?: { returning?: unknown[]; affected_rows: number };
    }>(PUBLISH_DRAFT, {
      property_uuid: body.property_uuid,
      landlord_user_id: userId,
    });

    if (result.errors?.length) {
      fail(res, "Failed to publish draft", 500);
      return;
    }

    const row = result.data?.update_real_estate_property_listing?.returning?.[0];
    if (!row) {
      fail(res, "Property not found", 404);
      return;
    }

    ok(res, row);
  } catch (error) {
    console.error("[client/properties/publish-draft]", error);
    fail(res, "Internal server error", 500);
  }
}
