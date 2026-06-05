import { hasuraQuery } from "./hasura";
import { formatPropertyLocation } from "./format-address";
import { toClientPaymentFrequency } from "./payment-frequency";

type RawOfferRow = Record<string, unknown> & {
  id?: number | string;
  offer_key?: string;
  property_uuid?: string;
  initiator_user_id?: string;
  recipient_user_id?: string;
  proposing_rent_price?: number | null;
  proposing_rent_price_currency?: string | null;
  num_leasing_months?: number | null;
  payment_frequency?: string | null;
  move_in_date?: string | null;
  current_rent_price?: number | null;
  current_rent_price_currency?: string | null;
  current_num_leasing_months?: number | null;
  current_payment_frequency?: string | null;
  current_move_in_date?: string | null;
  negotiation_round?: number | null;
  last_action_by?: string | null;
  last_action_at?: string | null;
  last_action_type?: string | null;
  offer_status?: string;
  is_active?: boolean | null;
  created_at?: string;
  updated_at?: string;
  final_rent_price?: number | null;
  final_rent_price_currency?: string | null;
  final_num_leasing_months?: number | null;
  final_payment_frequency?: string | null;
  final_move_in_date?: string | null;
  final_accepted_at?: string | null;
  final_accepted_by?: string | null;
};

type RealEstateUserRow = {
  uuid: string;
  nhost_user_id: string;
  display_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  photo_url?: string | null;
};

type PropertyRow = {
  property_uuid: string;
  title?: string | null;
  address?: unknown;
  rental_price?: number | null;
  rental_price_currency?: string | null;
  property_type?: string | null;
  num_bedroom?: number | null;
  num_bathroom?: number | null;
  display_image?: string | null;
};

const GET_USERS_BY_NHOST_IDS = `
  query OfferUsersByNhostIds($ids: [uuid!]!) {
    real_estate_user(where: { nhost_user_id: { _in: $ids } }) {
      uuid
      nhost_user_id
      display_name
      email
      phone_number
      photo_url
    }
  }
`;

const GET_PROPERTIES_BY_UUIDS = `
  query OfferPropertiesByUuid($uuids: [uuid!]!) {
    real_estate_property_listing(where: { property_uuid: { _in: $uuids } }) {
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
`;

function mapOfferUser(user: RealEstateUserRow | undefined) {
  if (!user) return undefined;
  return {
    uuid: user.uuid,
    displayName: user.display_name?.trim() || user.email?.split("@")[0] || "User",
    email: user.email ?? "",
    phoneNumber: user.phone_number ?? undefined,
    photoUrl: user.photo_url ?? undefined,
  };
}

function mapOfferProperty(property: PropertyRow | undefined) {
  if (!property) return undefined;
  return {
    propertyUuid: property.property_uuid,
    title: property.title ?? "Property",
    location: formatPropertyLocation(property.address),
    rentalPrice: Number(property.rental_price ?? 0),
    rentalPriceCurrency: property.rental_price_currency ?? "HKD",
    propertyType: property.property_type ?? "",
    bedrooms: Number(property.num_bedroom ?? 0),
    bathrooms: Number(property.num_bathroom ?? 0),
    imageUrl: property.display_image ?? "",
  };
}

function transformOfferRow(
  offer: RawOfferRow,
  usersByNhostId: Map<string, RealEstateUserRow>,
  propertiesByUuid: Map<string, PropertyRow>
): Record<string, unknown> {
  const initiatorUserId = String(offer.initiator_user_id ?? "");
  const recipientUserId = String(offer.recipient_user_id ?? "");
  const propertyUuid = String(offer.property_uuid ?? "");

  const paymentFrequency =
    toClientPaymentFrequency(offer.payment_frequency ?? undefined) ??
    offer.payment_frequency ??
    "monthly";

  const currentPaymentFrequencyRaw = offer.current_payment_frequency;
  const currentPaymentFrequency = currentPaymentFrequencyRaw
    ? toClientPaymentFrequency(currentPaymentFrequencyRaw) ?? currentPaymentFrequencyRaw
    : undefined;

  const finalPaymentFrequencyRaw = offer.final_payment_frequency;
  const finalPaymentFrequency = finalPaymentFrequencyRaw
    ? toClientPaymentFrequency(finalPaymentFrequencyRaw) ?? finalPaymentFrequencyRaw
    : undefined;

  const createdAt = String(offer.created_at ?? new Date().toISOString());
  const updatedAt = String(offer.updated_at ?? createdAt);

  return {
    id: String(offer.id ?? ""),
    offerKey: String(offer.offer_key ?? ""),
    propertyUuid,
    initiatorUserId,
    recipientUserId,
    proposingRentPrice: Number(offer.proposing_rent_price ?? 0),
    proposingRentPriceCurrency: offer.proposing_rent_price_currency ?? "HKD",
    numLeasingMonths: Number(offer.num_leasing_months ?? 12),
    paymentFrequency,
    moveInDate: offer.move_in_date ?? new Date().toISOString().split("T")[0],
    offerStatus: offer.offer_status ?? "pending",
    isActive: offer.is_active ?? true,
    createdAt,
    updatedAt,
    currentRentPrice: offer.current_rent_price ?? undefined,
    currentRentPriceCurrency: offer.current_rent_price_currency ?? undefined,
    currentNumLeasingMonths: offer.current_num_leasing_months ?? undefined,
    currentPaymentFrequency,
    currentMoveInDate: offer.current_move_in_date ?? undefined,
    negotiationRound: Number(offer.negotiation_round ?? 0),
    lastActionBy: offer.last_action_by ?? "initiator",
    lastActionAt: offer.last_action_at ?? updatedAt,
    lastActionType: offer.last_action_type ?? "INITIATOR_CREATED",
    finalRentPrice: offer.final_rent_price ?? undefined,
    finalRentPriceCurrency: offer.final_rent_price_currency ?? undefined,
    finalNumLeasingMonths: offer.final_num_leasing_months ?? undefined,
    finalPaymentFrequency,
    finalMoveInDate: offer.final_move_in_date ?? undefined,
    finalAcceptedAt: offer.final_accepted_at ?? undefined,
    finalAcceptedBy: offer.final_accepted_by ?? undefined,
    initiator: mapOfferUser(usersByNhostId.get(initiatorUserId)),
    recipient: mapOfferUser(usersByNhostId.get(recipientUserId)),
    property: mapOfferProperty(propertiesByUuid.get(propertyUuid)),
  };
}

/** Attach initiator, recipient, and property details to raw Hasura offer rows. */
export async function enrichOffersWithDetails(
  offers: RawOfferRow[]
): Promise<Record<string, unknown>[]> {
  if (offers.length === 0) return [];

  const userIds = new Set<string>();
  const propertyUuids = new Set<string>();

  for (const offer of offers) {
    if (offer.initiator_user_id) userIds.add(String(offer.initiator_user_id));
    if (offer.recipient_user_id) userIds.add(String(offer.recipient_user_id));
    if (offer.property_uuid) propertyUuids.add(String(offer.property_uuid));
  }

  const usersByNhostId = new Map<string, RealEstateUserRow>();
  const propertiesByUuid = new Map<string, PropertyRow>();

  const fetches: Promise<void>[] = [];

  if (userIds.size > 0) {
    fetches.push(
      (async () => {
        const result = await hasuraQuery<{ real_estate_user?: RealEstateUserRow[] }>(
          GET_USERS_BY_NHOST_IDS,
          { ids: [...userIds] }
        );
        for (const user of result.data?.real_estate_user ?? []) {
          if (user.nhost_user_id) {
            usersByNhostId.set(user.nhost_user_id, user);
          }
        }
      })()
    );
  }

  if (propertyUuids.size > 0) {
    fetches.push(
      (async () => {
        const result = await hasuraQuery<{
          real_estate_property_listing?: PropertyRow[];
        }>(GET_PROPERTIES_BY_UUIDS, { uuids: [...propertyUuids] });
        for (const property of result.data?.real_estate_property_listing ?? []) {
          if (property.property_uuid) {
            propertiesByUuid.set(property.property_uuid, property);
          }
        }
      })()
    );
  }

  await Promise.all(fetches);

  return offers.map((offer) => transformOfferRow(offer, usersByNhostId, propertiesByUuid));
}
