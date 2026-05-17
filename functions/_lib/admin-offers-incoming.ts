import { hasuraQuery } from "./hasura";
import { buildAdminOfferWhatsAppUrl } from "./admin-offer-outreach";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function filterUuid(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => UUID_RE.test(id)))];
}

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
  created_at: string;
  updated_at: string;
};

export type PropertyRow = {
  id: number | string;
  property_uuid: string;
  title: string | null;
  external_contact?: string | null;
  rental_price?: number | null;
};

export type UserRow = {
  nhost_user_id: string | null;
  uuid: string | null;
  phone_number: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

function buildOffersQuery(includeStatus: boolean, includePropertyUuid: boolean): string {
  const andParts: string[] = [
    "{ is_active: { _eq: true } }",
    "{ recipient_user_id: { _in: $recipientIds } }",
  ];
  if (includeStatus) {
    andParts.push("{ offer_status: { _eq: $offerStatus } }");
  }
  if (includePropertyUuid) {
    andParts.push("{ property_uuid: { _eq: $filterPropertyUuid } }");
  }
  const whereClause = `_and: [${andParts.join("\n        ")}]`;

  return `
    query AdminIncomingOffersForListings(
      $recipientIds: [String!]!
      $limit: Int!
      $offset: Int!
      ${includeStatus ? "$offerStatus: String!" : ""}
      ${includePropertyUuid ? "$filterPropertyUuid: uuid!" : ""}
    ) {
      real_estate_offer(
        where: { ${whereClause} }
        limit: $limit
        offset: $offset
        order_by: { created_at: desc }
      ) {
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
        created_at
        updated_at
      }
      real_estate_offer_aggregate(
        where: { ${whereClause} }
      ) {
        aggregate {
          count
        }
      }
    }
  `;
}

const GET_PROPERTIES = `
  query PropertiesForAdminIncoming($uuids: [uuid!]!) {
    real_estate_property_listing(where: { property_uuid: { _in: $uuids } }) {
      id
      property_uuid
      title
      external_contact
      rental_price
    }
  }
`;

const GET_INITIATORS = `
  query InitiatorsForAdminIncoming($ids: [uuid!]!) {
    real_estate_user(
      where: {
        _or: [
          { nhost_user_id: { _in: $ids } }
          { uuid: { _in: $ids } }
        ]
      }
    ) {
      nhost_user_id
      uuid
      phone_number
      display_name
      first_name
      last_name
      email
    }
  }
`;

export const GET_OFFER_BY_PK = `
  query AdminOfferByPk($id: Int!) {
    real_estate_offer_by_pk(id: $id) {
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
      created_at
      updated_at
    }
  }
`;

const GET_PROPERTY_FOR_OFFER = `
  query PropertyForAdminOffer($property_uuid: uuid!) {
    real_estate_property_listing(
      where: { property_uuid: { _eq: $property_uuid } }
      limit: 1
    ) {
      id
      property_uuid
      title
      external_contact
      rental_price
    }
  }
`;

function displayName(u: UserRow): string {
  const dn = u.display_name?.trim();
  if (dn) return dn;
  const parts = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  if (parts) return parts;
  return u.email?.trim() || u.nhost_user_id || u.uuid || "Applicant";
}

export function mapOffersToResponse(
  offers: OfferRow[],
  properties: PropertyRow[],
  users: UserRow[]
) {
  const propertyByUuid = new Map(properties.map((p) => [p.property_uuid, p]));
  const userByKey = new Map<string, UserRow>();
  for (const u of users) {
    if (u.nhost_user_id) userByKey.set(u.nhost_user_id, u);
    if (u.uuid) userByKey.set(u.uuid, u);
  }

  return offers.map((offer) => {
    const prop = propertyByUuid.get(offer.property_uuid);
    const initiator = userByKey.get(offer.initiator_user_id);
    const initiatorName = initiator ? displayName(initiator) : offer.initiator_user_id;
    const whatsappOutreachUrl =
      prop?.external_contact != null
        ? buildAdminOfferWhatsAppUrl(prop.external_contact, {
            propertyTitle: prop.title ?? undefined,
            rentalPrice: prop.rental_price ?? null,
            initiatorName,
            offerStatus: offer.offer_status,
          })
        : null;
    return {
      ...offer,
      whatsappOutreachUrl,
      property: prop
        ? {
            id: prop.id,
            property_uuid: prop.property_uuid,
            title: prop.title ?? "",
            external_contact: prop.external_contact ?? null,
            rental_price: prop.rental_price ?? null,
          }
        : null,
      initiator: initiator
        ? {
            display_name: displayName(initiator),
            phone_number: initiator.phone_number ?? null,
            email: initiator.email ?? null,
          }
        : {
            display_name: offer.initiator_user_id,
            phone_number: null as string | null,
            email: null as string | null,
          },
    };
  });
}

export async function fetchIncomingOffersList(params: {
  recipientIds: string[];
  limit: number;
  offset: number;
  statusFilter: string | null;
  propertyUuidParam: string | null;
}): Promise<{
  items: ReturnType<typeof mapOffersToResponse>;
  total: number;
}> {
  const { recipientIds, limit, offset, statusFilter, propertyUuidParam } = params;

  if (recipientIds.length === 0) {
    return { items: [], total: 0 };
  }

  const includeStatus = Boolean(statusFilter);
  const includePropertyUuid = Boolean(propertyUuidParam);
  const query = buildOffersQuery(includeStatus, includePropertyUuid);

  const variables: Record<string, unknown> = {
    recipientIds,
    limit,
    offset,
  };
  if (includeStatus) variables.offerStatus = statusFilter;
  if (includePropertyUuid) variables.filterPropertyUuid = propertyUuidParam;

  const incoming = await hasuraQuery<{
    real_estate_offer?: OfferRow[];
    real_estate_offer_aggregate?: { aggregate?: { count?: number } };
  }>(query, variables);

  if (incoming.errors?.length) {
    throw new Error(incoming.errors[0]?.message ?? "Failed to load offers");
  }

  const offers = incoming.data?.real_estate_offer ?? [];
  const total =
    incoming.data?.real_estate_offer_aggregate?.aggregate?.count ?? offers.length;

  const offerPropertyUuids = [
    ...new Set(offers.map((o) => o.property_uuid).filter(Boolean)),
  ];
  const initiatorUuidList = filterUuid(offers.map((o) => o.initiator_user_id));

  let properties: PropertyRow[] = [];
  if (offerPropertyUuids.length > 0) {
    const pr = await hasuraQuery<{
      real_estate_property_listing?: PropertyRow[];
    }>(GET_PROPERTIES, { uuids: offerPropertyUuids });
    if (pr.errors?.length) {
      throw new Error(pr.errors[0]?.message ?? "Failed to load properties");
    }
    properties = pr.data?.real_estate_property_listing ?? [];
  }

  let users: UserRow[] = [];
  if (initiatorUuidList.length > 0) {
    const ur = await hasuraQuery<{ real_estate_user?: UserRow[] }>(GET_INITIATORS, {
      ids: initiatorUuidList,
    });
    if (ur.errors?.length) {
      throw new Error(ur.errors[0]?.message ?? "Failed to load users");
    }
    users = ur.data?.real_estate_user ?? [];
  }

  return {
    items: mapOffersToResponse(offers, properties, users),
    total,
  };
}

export async function fetchIncomingOfferById(
  id: number,
  allowedRecipients: string[]
): Promise<ReturnType<typeof mapOffersToResponse>[0] | null> {
  const offerResult = await hasuraQuery<{
    real_estate_offer_by_pk: OfferRow | null;
  }>(GET_OFFER_BY_PK, { id });

  if (offerResult.errors?.length) {
    throw new Error(offerResult.errors[0]?.message ?? "Failed to load offer");
  }

  const offer = offerResult.data?.real_estate_offer_by_pk;
  if (!offer?.property_uuid) return null;
  if (!allowedRecipients.includes(offer.recipient_user_id)) return null;

  const propResult = await hasuraQuery<{
    real_estate_property_listing: PropertyRow[];
  }>(GET_PROPERTY_FOR_OFFER, { property_uuid: offer.property_uuid });

  if (propResult.errors?.length) {
    throw new Error(propResult.errors[0]?.message ?? "Failed to load property");
  }

  const prop = propResult.data?.real_estate_property_listing?.[0];
  if (!prop) return null;

  const initiatorUuids = filterUuid([offer.initiator_user_id]);
  let users: UserRow[] = [];
  if (initiatorUuids.length > 0) {
    const ur = await hasuraQuery<{ real_estate_user?: UserRow[] }>(GET_INITIATORS, {
      ids: initiatorUuids,
    });
    if (ur.errors?.length) {
      throw new Error(ur.errors[0]?.message ?? "Failed to load initiator");
    }
    users = ur.data?.real_estate_user ?? [];
  }

  const mapped = mapOffersToResponse([offer], [prop], users);
  return mapped[0] ?? null;
}
