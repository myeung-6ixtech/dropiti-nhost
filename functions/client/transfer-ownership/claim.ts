import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const ClaimSchema = z.object({
  token: z.string().uuid(),
});

const GET_INVITATION = `
  query GetInvitationForClaim($token_uuid: uuid!) {
    real_estate_property_transfer_invitation(
      where: { token_uuid: { _eq: $token_uuid } }
      limit: 1
    ) {
      id
      property_uuid
      status
      expires_at
      property_listing {
        title
      }
    }
  }
`;

const TRANSFER = `
  mutation TransferOwnership($property_uuid: uuid!, $landlord_user_id: uuid!) {
    update_real_estate_property_listing(
      where: { property_uuid: { _eq: $property_uuid } }
      _set: { landlord_user_id: $landlord_user_id }
    ) {
      affected_rows
      returning {
        property_uuid
        title
      }
    }
  }
`;

const MARK_USED = `
  mutation MarkInvitationUsed($id: Int!, $claimed_by_user_id: uuid!) {
    update_real_estate_property_transfer_invitation_by_pk(
      pk_columns: { id: $id }
      _set: { status: "used", used_at: "now()", claimed_by_user_id: $claimed_by_user_id }
    ) {
      id
      status
    }
  }
`;

export default async function claimTransfer(req: Request, res: Response): Promise<void> {
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

    const body = validateBody(req, res, ClaimSchema);
    if (!body) return;

    const inv = await hasuraQuery<{
      real_estate_property_transfer_invitation?: Array<{
        id: number;
        property_uuid: string;
        status: string;
        expires_at: string;
        property_listing?: { title: string } | null;
      }>;
    }>(GET_INVITATION, { token_uuid: body.token });

    const row = inv.data?.real_estate_property_transfer_invitation?.[0];
    if (!row) {
      fail(res, "Invitation not found", 404, { code: "INVITATION_INVALID" });
      return;
    }

    if (row.status === "used") {
      fail(res, "This invitation has already been used", 409, { code: "INVITATION_USED" });
      return;
    }

    if (row.status === "cancelled") {
      fail(res, "This invitation has been cancelled", 410, { code: "INVITATION_CANCELLED" });
      return;
    }

    if (row.status === "expired" || new Date(row.expires_at) < new Date()) {
      fail(res, "This invitation has expired", 410, { code: "INVITATION_EXPIRED" });
      return;
    }

    if (row.status !== "pending") {
      fail(res, "Invalid invitation state", 400, { code: "INVITATION_INVALID" });
      return;
    }

    const transfer = await hasuraQuery<{
      update_real_estate_property_listing?: {
        affected_rows: number;
        returning: Array<{ property_uuid: string; title: string }>;
      };
    }>(TRANSFER, { property_uuid: row.property_uuid, landlord_user_id: userId });

    const updated = transfer.data?.update_real_estate_property_listing?.returning?.[0];
    if ((transfer.data?.update_real_estate_property_listing?.affected_rows ?? 0) === 0) {
      fail(res, "Transfer failed", 500);
      return;
    }

    await hasuraQuery(MARK_USED, { id: row.id, claimed_by_user_id: userId });

    ok(res, {
      propertyUuid: updated?.property_uuid ?? row.property_uuid,
      propertyTitle: updated?.title ?? row.property_listing?.title ?? null,
      claimedByUserId: userId,
    });
  } catch (error) {
    console.error("[client/transfer-ownership/claim]", error);
    fail(res, "Internal server error", 500);
  }
}
