import { hasuraQuery } from "./hasura";

export type OfferRow = {
  id: number;
  offer_key: string;
  property_uuid: string;
  initiator_user_id: string;
  recipient_user_id: string;
  proposing_rent_price: number;
  proposing_rent_price_currency: string;
  num_leasing_months: number;
  payment_frequency: string;
  move_in_date: string | null;
  offer_status: string;
  is_active: boolean;
  negotiation_round?: number | null;
  last_action_by?: string | null;
  last_action_type?: string | null;
  current_rent_price?: number | null;
  current_rent_price_currency?: string | null;
  current_num_leasing_months?: number | null;
  current_payment_frequency?: string | null;
  current_move_in_date?: string | null;
  last_action_at?: string | null;
  final_rent_price?: number | null;
  final_rent_price_currency?: string | null;
  final_num_leasing_months?: number | null;
  final_payment_frequency?: string | null;
  final_move_in_date?: string | null;
  final_accepted_at?: string | null;
  final_accepted_by?: string | null;
  created_at: string;
  updated_at: string;
};

export const OFFER_FIELDS = `
  id
  offer_key
  property_uuid
  initiator_user_id
  recipient_user_id
  proposing_rent_price
  proposing_rent_price_currency
  num_leasing_months
  payment_frequency
  move_in_date
  offer_status
  is_active
  negotiation_round
  last_action_by
  last_action_type
  last_action_at
  current_rent_price
  current_rent_price_currency
  current_num_leasing_months
  current_payment_frequency
  current_move_in_date
  final_rent_price
  final_rent_price_currency
  final_num_leasing_months
  final_payment_frequency
  final_move_in_date
  final_accepted_at
  final_accepted_by
  created_at
  updated_at
`;

const GET_OFFER_BY_PK = `
  query GetOfferByPk($id: Int!) {
    real_estate_offer_by_pk(id: $id) {
      ${OFFER_FIELDS}
    }
  }
`;

export async function loadOfferById(offerId: number): Promise<OfferRow | null> {
  const result = await hasuraQuery<{ real_estate_offer_by_pk: OfferRow | null }>(
    GET_OFFER_BY_PK,
    { id: offerId }
  );
  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to load offer");
  }
  return result.data?.real_estate_offer_by_pk ?? null;
}

export function isOfferParticipant(offer: OfferRow, userId: string): boolean {
  return offer.initiator_user_id === userId || offer.recipient_user_id === userId;
}

export function basicAvailableActions(
  offer: OfferRow,
  userId: string
): string[] {
  if (!offer.is_active || ["accepted", "rejected", "withdrawn", "completed"].includes(offer.offer_status)) {
    return [];
  }
  const isInitiator = offer.initiator_user_id === userId;
  const isRecipient = offer.recipient_user_id === userId;
  const actions: string[] = [];
  if (isRecipient && ["pending", "countered"].includes(offer.offer_status)) {
    actions.push("ACCEPT", "REJECT", "COUNTER");
  }
  if (isInitiator && offer.offer_status === "pending") {
    actions.push("WITHDRAW");
  }
  if (isInitiator && offer.offer_status === "countered") {
    actions.push("ACCEPT", "REJECT", "COUNTER", "WITHDRAW");
  }
  return actions;
}

const UPDATE_OFFER = `
  mutation UpdateOffer($id: Int!, $updates: real_estate_offer_set_input!) {
    update_real_estate_offer_by_pk(pk_columns: { id: $id }, _set: $updates) {
      id
      offer_status
      is_active
      updated_at
    }
  }
`;

export async function updateOffer(
  offerId: number,
  updates: Record<string, unknown>
): Promise<{ id: number; offer_status: string } | null> {
  const result = await hasuraQuery<{
    update_real_estate_offer_by_pk: { id: number; offer_status: string } | null;
  }>(UPDATE_OFFER, { id: offerId, updates });
  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to update offer");
  }
  return result.data?.update_real_estate_offer_by_pk ?? null;
}
