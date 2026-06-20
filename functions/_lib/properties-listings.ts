import { hasuraQuery } from "./hasura";

export interface PropertyListFilters {
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  type?: string;
  landlordUserId?: string;
  /** District / area search — case-insensitive substring match on `address`. */
  location?: string;
  /** Keyword search — case-insensitive substring match on `title`. */
  keyword?: string;
}

function buildHasuraFilters(filters: PropertyListFilters): Record<string, unknown> {
  const and: Record<string, unknown>[] = [{ status: { _eq: "published" } }];

  if (filters.landlordUserId) {
    and.push({ landlord_user_id: { _eq: filters.landlordUserId } });
  }
  if (filters.minPrice !== undefined) {
    and.push({ rental_price: { _gte: filters.minPrice } });
  }
  if (filters.maxPrice !== undefined) {
    and.push({ rental_price: { _lte: filters.maxPrice } });
  }
  if (filters.bedrooms !== undefined) {
    and.push({ num_bedroom: { _gte: filters.bedrooms } });
  }
  if (filters.type) {
    and.push({ property_type: { _eq: filters.type } });
  }
  if (filters.location) {
    and.push({ address: { _ilike: `%${filters.location}%` } });
  }
  if (filters.keyword) {
    and.push({ title: { _ilike: `%${filters.keyword}%` } });
  }

  return and.length === 1 ? and[0]! : { _and: and };
}

const LIST_PROPERTIES = `
  query ClientListProperties(
    $limit: Int!
    $offset: Int!
    $filters: real_estate_property_listing_bool_exp!
  ) {
    real_estate_property_listing(
      limit: $limit
      offset: $offset
      where: $filters
      order_by: { created_at: desc }
    ) {
      id
      property_uuid
      title
      description
      address
      rental_price
      num_bedroom
      num_bathroom
      property_type
      furnished
      pets_allowed
      amenities
      display_image
      uploaded_images
      availability_date
      status
      landlord_user_id
      latitude
      longitude
      show_specific_location
      created_at
    }
    real_estate_property_listing_aggregate(where: $filters) {
      aggregate {
        count
      }
    }
  }
`;

export async function listPublishedProperties(
  limit: number,
  offset: number,
  filters: PropertyListFilters
) {
  const hasuraFilters = buildHasuraFilters(filters);
  const result = await hasuraQuery<{
    real_estate_property_listing?: unknown[];
    real_estate_property_listing_aggregate?: { aggregate?: { count?: number } };
  }>(LIST_PROPERTIES, { limit, offset, filters: hasuraFilters });

  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to list properties");
  }

  const items = result.data?.real_estate_property_listing ?? [];
  const total =
    result.data?.real_estate_property_listing_aggregate?.aggregate?.count ?? items.length;

  return { items, total };
}
