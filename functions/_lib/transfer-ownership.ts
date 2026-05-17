import { getClientAppOrigin, getInvitationExpiryDays } from "./env";
import { hasuraQuery } from "./hasura";

export type InvitationStatus = "valid" | "expired" | "used" | "cancelled" | "invalid";

export function extractLocation(address: unknown): string {
  if (!address) return "";
  if (typeof address === "string") return address;
  if (typeof address === "object") {
    const a = address as Record<string, string | undefined>;
    return [a.buildingName, a.addressLine1, a.district, a.state, a.country]
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

export function buildInvitationUrl(tokenUuid: string): string {
  return `${getClientAppOrigin()}/transfer-ownership/${tokenUuid}`;
}

export const GET_PROPERTY_FOR_INVITE = `
  query GetPropertyForInvite($propertyUuid: uuid!) {
    real_estate_property_listing(where: { property_uuid: { _eq: $propertyUuid } }, limit: 1) {
      property_uuid
      title
      address
      external_contact
    }
  }
`;

export const CANCEL_PENDING_INVITATIONS = `
  mutation CancelPendingInvitations($propertyUuid: uuid!, $externalContact: String!) {
    update_real_estate_property_transfer_invitation(
      where: {
        property_uuid: { _eq: $propertyUuid }
        external_contact: { _eq: $externalContact }
        status: { _eq: "pending" }
      }
      _set: { status: "cancelled" }
    ) {
      affected_rows
    }
  }
`;

export const CANCEL_PENDING_OR_EXPIRED = `
  mutation CancelForResend($propertyUuid: uuid!, $externalContact: String!) {
    update_real_estate_property_transfer_invitation(
      where: {
        property_uuid: { _eq: $propertyUuid }
        external_contact: { _eq: $externalContact }
        status: { _in: ["pending", "expired"] }
      }
      _set: { status: "cancelled" }
    ) {
      affected_rows
    }
  }
`;

export const INSERT_INVITATION = `
  mutation InsertInvitation($invitation: real_estate_property_transfer_invitation_insert_input!) {
    insert_real_estate_property_transfer_invitation_one(object: $invitation) {
      id
      token_uuid
      expires_at
      created_at
    }
  }
`;

export const UPDATE_MESSAGE_ID = `
  mutation UpdateInvitationMessageId($id: Int!, $messageId: String!) {
    update_real_estate_property_transfer_invitation_by_pk(
      pk_columns: { id: $id }
      _set: { whatsapp_message_id: $messageId }
    ) {
      id
    }
  }
`;

export const GET_LATEST_INVITATION = `
  query GetLatestInvitation($propertyUuid: uuid!, $externalContact: String!) {
    real_estate_property_transfer_invitation(
      where: {
        property_uuid: { _eq: $propertyUuid }
        external_contact: { _eq: $externalContact }
      }
      order_by: { created_at: desc }
      limit: 1
    ) {
      id
      resend_count
      status
      created_at
    }
  }
`;

export const GET_INVITATION_STATUS = `
  query GetInvitationStatus($propertyUuid: uuid!) {
    real_estate_property_transfer_invitation(
      where: { property_uuid: { _eq: $propertyUuid } }
      order_by: { created_at: desc }
      limit: 1
    ) {
      id
      token_uuid
      status
      expires_at
      created_at
      used_at
      resend_count
      claimed_by_user_id
      external_contact
    }
  }
`;

export const GET_INVITATION_BY_TOKEN = `
  query GetInvitationByToken($tokenUuid: uuid!) {
    real_estate_property_transfer_invitation(
      where: { token_uuid: { _eq: $tokenUuid } }
      limit: 1
    ) {
      id
      token_uuid
      property_uuid
      status
      expires_at
      created_at
      used_at
      property_listing {
        property_uuid
        title
        address
        rental_price
        rental_price_currency
        property_type
        num_bedroom
        num_bathroom
        display_image
      }
    }
  }
`;

export const EXPIRE_INVITATION = `
  mutation ExpireInvitation($id: Int!) {
    update_real_estate_property_transfer_invitation_by_pk(
      pk_columns: { id: $id }
      _set: { status: "expired" }
    ) {
      id
      status
    }
  }
`;

export function invitationInsertObject(input: {
  propertyUuid: string;
  externalContact: string;
  sentByAdminId: string;
  offerId?: string | null;
  resendCount?: number;
}) {
  const days = getInvitationExpiryDays();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  return {
    property_uuid: input.propertyUuid,
    external_contact: input.externalContact,
    sent_by_admin_id: input.sentByAdminId,
    offer_id: input.offerId ?? null,
    status: "pending",
    resend_count: input.resendCount ?? 0,
    expires_at: expiresAt.toISOString(),
  };
}

export async function persistExpiredIfNeeded(
  id: number,
  status: string,
  expiresAt: string
): Promise<InvitationStatus> {
  if (status === "pending" && new Date(expiresAt) < new Date()) {
    await hasuraQuery(EXPIRE_INVITATION, { id }).catch((err) =>
      console.error("[transfer-ownership] expire invitation", err)
    );
    return "expired";
  }
  if (status === "pending") return "valid";
  if (status === "used" || status === "cancelled" || status === "expired") {
    return status as InvitationStatus;
  }
  return "invalid";
}
