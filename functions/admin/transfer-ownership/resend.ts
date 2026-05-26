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
  CANCEL_PENDING_OR_EXPIRED,
  GET_LATEST_INVITATION,
  GET_PROPERTY_FOR_INVITE,
  INSERT_INVITATION,
  invitationInsertObject,
  UPDATE_MESSAGE_ID,
} from "../../_lib/transfer-ownership";

const ResendSchema = z.object({
  propertyUuid: z.string().uuid(),
  externalContact: z.string().optional(),
  /** When true, skip Meta template WhatsApp (admin sends link manually via wa.me). */
  skipWhatsApp: z.boolean().optional(),
});

export default async function resendTransferOwnership(
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

    const body = validateBody(req, res, ResendSchema);
    if (!body) return;

    const propertyResult = await hasuraQuery<{
      real_estate_property_listing?: Array<{
        property_uuid: string;
        title: string;
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
      fail(res, "No external_contact set for this property", 422);
      return;
    }

    const prevResult = await hasuraQuery<{
      real_estate_property_transfer_invitation?: Array<{
        resend_count: number;
        status: string;
        created_at: string;
      }>;
    }>(GET_LATEST_INVITATION, {
      propertyUuid: body.propertyUuid,
      externalContact: phoneTarget,
    });

    const prev = prevResult.data?.real_estate_property_transfer_invitation?.[0];
    const newResendCount = prev ? prev.resend_count + 1 : 0;

    if (prev) {
      const statusResult = await hasuraQuery<{
        real_estate_property_transfer_invitation?: Array<{
          status: string;
          expires_at: string;
          created_at: string;
        }>;
      }>(
        `query GetLatestForResendGuard($propertyUuid: uuid!) {
          real_estate_property_transfer_invitation(
            where: { property_uuid: { _eq: $propertyUuid } }
            order_by: { created_at: desc }
            limit: 1
          ) {
            status
            expires_at
            created_at
          }
        }`,
        { propertyUuid: body.propertyUuid }
      );
      const latest = statusResult.data?.real_estate_property_transfer_invitation?.[0];
      if (latest) {
        const isLiveExpired =
          latest.status === "pending" && new Date(latest.expires_at) < new Date();
        const resolvedStatus = isLiveExpired ? "expired" : latest.status;
        const hoursSinceSent =
          (Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60);
        const canResend =
          resolvedStatus === "expired" ||
          (resolvedStatus === "pending" && hoursSinceSent >= 24);
        if (!canResend) {
          fail(res, "Resend not allowed until 24 hours after send or invitation has expired", 429);
          return;
        }
      }
    }

    await hasuraQuery(CANCEL_PENDING_OR_EXPIRED, {
      propertyUuid: body.propertyUuid,
      externalContact: phoneTarget,
    });

    const insertResult = await hasuraQuery<{
      insert_real_estate_property_transfer_invitation_one?: {
        id: number;
        token_uuid: string;
        expires_at: string;
      };
    }>(INSERT_INVITATION, {
      invitation: invitationInsertObject({
        propertyUuid: body.propertyUuid,
        externalContact: phoneTarget,
        sentByAdminId: adminId,
        resendCount: newResendCount,
      }),
    });

    const invitation = insertResult.data?.insert_real_estate_property_transfer_invitation_one;
    if (!invitation) {
      fail(res, "Failed to create resend invitation", 500);
      return;
    }

    const invitationUrl = buildInvitationUrl(invitation.token_uuid);
    const skipWhatsApp = body.skipWhatsApp === true;

    let waResult: { success: boolean; messageId?: string; error?: string };
    if (skipWhatsApp) {
      waResult = { success: false };
    } else {
      waResult = await sendOwnershipInvitation(phoneTarget, {
        propertyTitle: property.title,
        invitationUrl,
        expiryDays: getInvitationExpiryDays(),
      });

      if (waResult.messageId) {
        await hasuraQuery(UPDATE_MESSAGE_ID, {
          id: invitation.id,
          messageId: waResult.messageId,
        }).catch((err) => console.error("[admin/transfer-ownership/resend] message id", err));
      }
    }

    await logAdminAction(payload, "transfer_ownership.resend", "property", body.propertyUuid, {
      resendCount: newResendCount,
      skipWhatsApp,
    }, req);

    ok(res, {
      invitationId: invitation.id,
      tokenUuid: invitation.token_uuid,
      invitationUrl,
      expiresAt: invitation.expires_at,
      resendCount: newResendCount,
      whatsappSent: waResult.success,
      whatsappSkipped: skipWhatsApp,
      whatsappError: skipWhatsApp ? null : (waResult.error ?? null),
    });
  } catch (error) {
    console.error("[admin/transfer-ownership/resend]", error);
    fail(res, "Internal server error", 500);
  }
}
