import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { UUID_RE } from "../../_lib/admin-offers-incoming";
import { ok, fail } from "../../_lib/respond";
import { buildInvitationUrl, GET_INVITATION_STATUS } from "../../_lib/transfer-ownership";

export default async function transferOwnershipStatus(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.method !== "GET") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const propertyUuid =
      typeof req.query.propertyUuid === "string" ? req.query.propertyUuid.trim() : "";

    if (!propertyUuid) {
      fail(res, "propertyUuid is required", 400);
      return;
    }

    if (!UUID_RE.test(propertyUuid)) {
      fail(res, "propertyUuid must be a valid UUID", 400);
      return;
    }

    const result = await hasuraQuery<{
      real_estate_property_transfer_invitation?: Array<{
        id: number;
        token_uuid: string;
        status: string;
        expires_at: string;
        created_at: string;
        used_at: string | null;
        resend_count: number;
        claimed_by_user_id: string | null;
        external_contact: string;
      }>;
    }>(GET_INVITATION_STATUS, { propertyUuid });

    const latest = result.data?.real_estate_property_transfer_invitation?.[0];

    if (!latest) {
      ok(res, { hasInvitation: false, data: null });
      return;
    }

    const isLiveExpired =
      latest.status === "pending" && new Date(latest.expires_at) < new Date();
    const resolvedStatus = isLiveExpired ? "expired" : latest.status;

    const now = Date.now();
    const expiresMs = new Date(latest.expires_at).getTime();
    const daysRemaining = Math.max(0, Math.ceil((expiresMs - now) / (1000 * 60 * 60 * 24)));
    const createdMs = new Date(latest.created_at).getTime();
    const hoursSinceSent = Math.floor((now - createdMs) / (1000 * 60 * 60));

    ok(res, {
      hasInvitation: true,
      data: {
        invitationId: latest.id,
        tokenUuid: latest.token_uuid,
        invitationUrl: buildInvitationUrl(latest.token_uuid),
        status: resolvedStatus,
        expiresAt: latest.expires_at,
        createdAt: latest.created_at,
        usedAt: latest.used_at,
        resendCount: latest.resend_count,
        claimedByUserId: latest.claimed_by_user_id,
        externalContact: latest.external_contact,
        daysRemaining: resolvedStatus === "pending" ? daysRemaining : 0,
        hoursSinceSent,
        canResend:
          resolvedStatus === "expired" ||
          (resolvedStatus === "pending" && hoursSinceSent >= 24),
      },
    });
  } catch (error) {
    console.error("[admin/transfer-ownership/status]", error);
    fail(res, "Internal server error", 500);
  }
}
