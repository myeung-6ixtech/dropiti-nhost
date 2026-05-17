import type { Request, Response } from "express";
import { z } from "zod";
import { requireAdminRole, getUserId } from "../../_lib/auth";
import { logAdminAction } from "../../_lib/audit";
import { hasuraQuery } from "../../_lib/hasura";
import { getInvitationExpiryDays } from "../../_lib/env";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";
import { sendOwnershipInvitation } from "../../_lib/whatsapp";
import {
  buildInvitationUrl,
  CANCEL_PENDING_INVITATIONS,
  extractLocation,
  GET_PROPERTY_FOR_INVITE,
  INSERT_INVITATION,
  invitationInsertObject,
  UPDATE_MESSAGE_ID,
} from "../../_lib/transfer-ownership";

const InviteSchema = z.object({
  propertyUuid: z.string().uuid(),
  externalContact: z.string().optional(),
  offerId: z.string().optional(),
});

export default async function inviteTransferOwnership(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const adminId = getUserId(payload);
    if (!adminId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const body = validateBody(req, res, InviteSchema);
    if (!body) return;

    const propertyResult = await hasuraQuery<{
      real_estate_property_listing?: Array<{
        property_uuid: string;
        title: string;
        address: unknown;
        external_contact: string | null;
      }>;
    }>(GET_PROPERTY_FOR_INVITE, { propertyUuid: body.propertyUuid });

    const property = propertyResult.data?.real_estate_property_listing?.[0];
    if (!property) {
      fail(res, "Property not found", 404);
      return;
    }

    const phoneTarget = body.externalContact ?? property.external_contact;
    if (!phoneTarget) {
      fail(res, "No external_contact set for this property and none provided in request", 422);
      return;
    }

    await hasuraQuery(CANCEL_PENDING_INVITATIONS, {
      propertyUuid: body.propertyUuid,
      externalContact: phoneTarget,
    });

    const insertResult = await hasuraQuery<{
      insert_real_estate_property_transfer_invitation_one?: {
        id: number;
        token_uuid: string;
        expires_at: string;
        created_at: string;
      };
    }>(INSERT_INVITATION, {
      invitation: invitationInsertObject({
        propertyUuid: body.propertyUuid,
        externalContact: phoneTarget,
        sentByAdminId: adminId,
        offerId: body.offerId ?? null,
      }),
    });

    const invitation = insertResult.data?.insert_real_estate_property_transfer_invitation_one;
    if (!invitation) {
      fail(res, "Failed to create invitation record", 500);
      return;
    }

    const invitationUrl = buildInvitationUrl(invitation.token_uuid);
    const expiryDays = getInvitationExpiryDays();

    const waResult = await sendOwnershipInvitation(phoneTarget, {
      propertyTitle: property.title,
      invitationUrl,
      expiryDays,
    });

    if (waResult.messageId) {
      await hasuraQuery(UPDATE_MESSAGE_ID, {
        id: invitation.id,
        messageId: waResult.messageId,
      }).catch((err) => console.error("[admin/transfer-ownership/invite] message id", err));
    }

    await logAdminAction(payload, "transfer_ownership.invite", "property", body.propertyUuid, {
      invitationId: invitation.id,
      offerId: body.offerId,
      whatsappSent: waResult.success,
    }, req);

    ok(res, {
      invitationId: invitation.id,
      tokenUuid: invitation.token_uuid,
      invitationUrl,
      expiresAt: invitation.expires_at,
      whatsappSent: waResult.success,
      whatsappError: waResult.error ?? null,
      location: extractLocation(property.address),
    });
  } catch (error) {
    console.error("[admin/transfer-ownership/invite]", error);
    fail(res, "Internal server error", 500);
  }
}
