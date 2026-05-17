import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const TransferBodySchema = z.object({
  property_uuid: z.string().uuid(),
  new_owner_id: z.string().uuid(),
});

const UPDATE_OWNER_MUTATION = `
  mutation TransferOwnership($property_uuid: uuid!, $landlord_user_id: uuid!) {
    update_real_estate_property_listing(
      where: { property_uuid: { _eq: $property_uuid } }
      _set: { landlord_user_id: $landlord_user_id }
    ) {
      affected_rows
      returning {
        property_uuid
        landlord_user_id
      }
    }
  }
`;

/**
 * PUT /v1/admin/transfer-ownership/transfer
 */
export default async function transferOwnership(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.method !== "PUT") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const body = validateBody(req, res, TransferBodySchema);
    if (!body) return;

    const result = await hasuraQuery<{
      update_real_estate_property_listing?: {
        affected_rows: number;
        returning: Array<{ property_uuid: string; landlord_user_id: string | null }>;
      };
    }>(UPDATE_OWNER_MUTATION, {
      property_uuid: body.property_uuid,
      landlord_user_id: body.new_owner_id,
    });

    if (result.errors?.length) {
      fail(res, "Failed to transfer ownership", 500);
      return;
    }

    const updateResult = result.data?.update_real_estate_property_listing;
    if (!updateResult || updateResult.affected_rows === 0) {
      fail(res, "Property not found or transfer failed", 404);
      return;
    }

    await logAdminAction(
      payload,
      "transfer_ownership.direct",
      "property",
      body.property_uuid,
      { new_owner_id: body.new_owner_id },
      req
    );

    ok(res, {
      property_uuid: body.property_uuid,
      landlord_user_id: body.new_owner_id,
    });
  } catch (error) {
    console.error("[admin/transfer-ownership/transfer]", error);
    fail(res, "Failed to transfer ownership", 500);
  }
}
