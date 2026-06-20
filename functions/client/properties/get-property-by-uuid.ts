import type { Request, Response } from "express";
import { optionalAuth } from "../../_lib/optional-auth";
import { hasuraQuery } from "../../_lib/hasura";
import { formatPropertyLocation } from "../../_lib/format-address";
import { queryString, UUID_RE } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

type LandlordDetails = {
  nhost_user_id: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  photo_url?: string;
  about?: string;
  phone_number?: string;
  languages?: string[];
  education?: string;
  occupation?: string;
  avg_response_time?: string;
};

type ListingRow = {
  id: string;
  property_uuid: string;
  title: string;
  description: string;
  landlord_user_id: string;
  created_at: string;
  property_type: string;
  rental_space: string;
  address: string;
  show_specific_location: boolean;
  gross_area_size: number;
  gross_area_size_unit: string;
  num_bedroom: number;
  num_bathroom: number;
  furnished: boolean;
  pets_allowed: boolean;
  amenities: string[];
  display_image: string;
  uploaded_images: string[];
  rental_price: number;
  rental_price_currency: string;
  availability_date: string;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
};

const LISTING_FIELDS = `
  id
  property_uuid
  title
  description
  landlord_user_id
  created_at
  property_type
  rental_space
  address
  show_specific_location
  gross_area_size
  gross_area_size_unit
  num_bedroom
  num_bathroom
  furnished
  pets_allowed
  amenities
  display_image
  uploaded_images
  rental_price
  rental_price_currency
  availability_date
  status
  latitude
  longitude
`;

const GET_PROPERTY_BY_UUID = `
  query GetPropertyByUuid($property_uuid: uuid!) {
    real_estate_property_listing(
      where: { property_uuid: { _eq: $property_uuid } }
      limit: 1
    ) {
      ${LISTING_FIELDS}
    }
  }
`;

const GET_PROPERTY_BY_INT_ID = `
  query GetPropertyByIntId($id: Int!) {
    real_estate_property_listing(where: { id: { _eq: $id } }, limit: 1) {
      ${LISTING_FIELDS}
    }
  }
`;

const GET_LANDLORD_DETAILS = `
  query GetLandlordDetails($nhostUserId: uuid!) {
    real_estate_user(where: { nhost_user_id: { _eq: $nhostUserId } }, limit: 1) {
      nhost_user_id
      display_name
      first_name
      last_name
      email
      photo_url
      about
      phone_number
      languages
      education
      occupation
      avg_response_time
    }
  }
`;

const GET_LANDLORD_ROLE = `
  query GetLandlordDefaultRole($userId: uuid!) {
    users(where: { id: { _eq: $userId } }) {
      defaultRole
    }
  }
`;

async function fetchLandlordDetails(
  landlordUserId: string
): Promise<LandlordDetails | null> {
  try {
    const result = await hasuraQuery<{
      real_estate_user?: LandlordDetails[];
    }>(GET_LANDLORD_DETAILS, { nhostUserId: landlordUserId });
    if (result.errors?.length) return null;
    return result.data?.real_estate_user?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchLandlordRole(
  landlordUserId: string
): Promise<string | undefined> {
  const raw = process.env.DROPITI_PLATFORM_LANDLORD_USER_IDS;
  if (raw?.trim()) {
    const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.includes(landlordUserId)) return "admin";
  }
  try {
    const result = await hasuraQuery<{
      users?: { defaultRole: string }[];
    }>(GET_LANDLORD_ROLE, { userId: landlordUserId });
    if (result.errors?.length) return undefined;
    return result.data?.users?.[0]?.defaultRole ?? undefined;
  } catch {
    return undefined;
  }
}

function buildPropertyResponse(property: ListingRow) {
  return {
    property: {
      id: property.id,
      property_uuid: property.property_uuid,
      title: property.title,
      description: property.description,
      location: formatPropertyLocation(property.address),
      address: property.address,
      show_specific_location: property.show_specific_location || false,
      latitude: property.latitude ?? null,
      longitude: property.longitude ?? null,
      price: property.rental_price || 0,
      bedrooms: property.num_bedroom || 0,
      bathrooms: property.num_bathroom || 0,
      num_bedroom: property.num_bedroom,
      num_bathroom: property.num_bathroom,
      gross_area_size: property.gross_area_size,
      gross_area_size_unit: property.gross_area_size_unit,
      furnished: property.furnished,
      pets_allowed: property.pets_allowed,
      image_url:
        property.display_image ||
        (property.uploaded_images?.length ? property.uploaded_images[0] : ""),
      display_image: property.display_image || "",
      uploaded_images: property.uploaded_images || [],
      available: property.status === "published",
      status: property.status || "draft",
      created_at: property.created_at,
      updated_at: property.created_at,
      details: {
        type: property.property_type,
        furnished: property.furnished,
        petsAllowed: property.pets_allowed,
        parking: false,
      },
      amenities: Array.isArray(property.amenities) ? property.amenities : [],
      minimum_lease: 12,
      available_date: property.availability_date,
      owner_id: property.landlord_user_id,
      rental_space: property.rental_space,
    },
    landlord: null as Record<string, unknown> | null,
  };
}

function attachLandlord(
  payload: ReturnType<typeof buildPropertyResponse>,
  property: ListingRow,
  details: LandlordDetails | null,
  landlordRole: string | undefined
): void {
  if (!details && !property.landlord_user_id) {
    payload.landlord = null;
    return;
  }
  payload.landlord = {
    id: details?.nhost_user_id || property.landlord_user_id,
    uuid: details?.nhost_user_id || property.landlord_user_id,
    nhost_user_id: details?.nhost_user_id || property.landlord_user_id,
    name:
      details?.display_name ||
      details?.email?.split("@")[0] ||
      "Landlord",
    email: details?.email || "",
    avatar: details?.photo_url,
    verified: false,
    rating: 0,
    review_count: 0,
    response_rate: 0,
    avg_response_time: details?.avg_response_time || "Unknown",
    user_since: undefined,
    about: details?.about,
    location: null,
    phone_number: details?.phone_number,
    languages: details?.languages,
    education: details?.education,
    occupation: details?.occupation,
    marital_status: null,
    role: landlordRole,
  };
}

export default async function getPropertyByUuid(
  req: Request,
  res: Response
): Promise<void> {
  try {
    await optionalAuth(req, res);

    const slug = (
      queryString(req, "uuid") ||
      queryString(req, "property_uuid") ||
      ""
    )
      .trim()
      .split("?")[0]
      .split("#")[0];

    if (!slug) {
      fail(res, "uuid is required", 400);
      return;
    }

    let listing: ListingRow | undefined;

    if (UUID_RE.test(slug)) {
      const result = await hasuraQuery<{
        real_estate_property_listing?: ListingRow[];
      }>(GET_PROPERTY_BY_UUID, { property_uuid: slug });

      if (result.errors?.length) {
        fail(res, "Failed to fetch property", 500);
        return;
      }
      listing = result.data?.real_estate_property_listing?.[0];
    } else if (/^\d+$/.test(slug)) {
      const result = await hasuraQuery<{
        real_estate_property_listing?: ListingRow[];
      }>(GET_PROPERTY_BY_INT_ID, { id: parseInt(slug, 10) });

      if (result.errors?.length) {
        fail(res, "Failed to fetch property", 500);
        return;
      }
      listing = result.data?.real_estate_property_listing?.[0];
    } else {
      fail(res, "Invalid property identifier", 400);
      return;
    }

    if (!listing) {
      fail(res, "Property not found", 404);
      return;
    }

    const [details, landlordRole] = await Promise.all([
      fetchLandlordDetails(listing.landlord_user_id),
      fetchLandlordRole(listing.landlord_user_id),
    ]);

    const payload = buildPropertyResponse(listing);
    attachLandlord(payload, listing, details, landlordRole);

    ok(res, payload);
  } catch (error) {
    console.error("[client/properties/get-property-by-uuid]", error);
    fail(res, "Internal server error", 500);
  }
}
