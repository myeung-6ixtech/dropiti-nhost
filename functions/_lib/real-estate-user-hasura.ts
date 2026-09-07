import { hasuraQuery } from "./hasura";

/**
 * User profile lookups against Postgres `real_estate.user`.
 *
 * There is no `real_estate.real_estate_user` table — Hasura exposes
 * `real_estate.user` as the GraphQL collection `real_estate_user`
 * (same pattern as `get-user-by-id.ts`, `create-user.ts`, etc.).
 *
 * Do not query GraphQL root `user` here: in Nhost that name is reserved
 * for auth metadata and does not accept `where` filters.
 */

export type RealEstateUserLookupRow = {
  nhost_user_id: string;
  display_name?: string | null;
  email?: string | null;
  photo_url?: string | null;
};

const PROFILE_FIELDS = `
  nhost_user_id
  display_name
  email
  photo_url
`;

const LOOKUP_BY_NHOST_IDS = `
  query LookupUsersByNhostIds($ids: [uuid!]!) {
    real_estate_user(where: { nhost_user_id: { _in: $ids } }) {
      ${PROFILE_FIELDS}
    }
  }
`;

const LOOKUP_BY_NHOST_ID = `
  query LookupUserByNhostId($nhostUserId: uuid!) {
    real_estate_user(where: { nhost_user_id: { _eq: $nhostUserId } }, limit: 1) {
      ${PROFILE_FIELDS}
    }
  }
`;

const LOOKUP_BY_EMAIL = `
  query LookupUserByEmail($email: String!) {
    real_estate_user(where: { email: { _ilike: $email } }, limit: 1) {
      ${PROFILE_FIELDS}
    }
  }
`;

export async function lookupUsersByNhostIds(
  ids: string[]
): Promise<RealEstateUserLookupRow[]> {
  if (ids.length === 0) return [];

  const result = await hasuraQuery<{ real_estate_user?: RealEstateUserLookupRow[] }>(
    LOOKUP_BY_NHOST_IDS,
    { ids }
  );

  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to lookup users");
  }

  return result.data?.real_estate_user ?? [];
}

export async function lookupUserByNhostId(
  nhostUserId: string
): Promise<RealEstateUserLookupRow | null> {
  const result = await hasuraQuery<{ real_estate_user?: RealEstateUserLookupRow[] }>(
    LOOKUP_BY_NHOST_ID,
    { nhostUserId }
  );

  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to lookup user");
  }

  return result.data?.real_estate_user?.[0] ?? null;
}

export async function lookupUserByEmail(
  email: string
): Promise<RealEstateUserLookupRow | null> {
  const normalized = email.trim();
  if (!normalized) return null;

  try {
    const result = await hasuraQuery<{ real_estate_user?: RealEstateUserLookupRow[] }>(
      LOOKUP_BY_EMAIL,
      { email: normalized }
    );

    if (result.errors?.length) {
      console.warn("[real-estate-user-hasura] lookupUserByEmail failed:", result.errors[0]?.message);
      return null;
    }

    return result.data?.real_estate_user?.[0] ?? null;
  } catch (error) {
    console.warn("[real-estate-user-hasura] lookupUserByEmail error:", error);
    return null;
  }
}

export function displayNameFromUserRow(
  row: Pick<RealEstateUserLookupRow, "display_name" | "email"> | null | undefined
): string {
  return row?.display_name?.trim() || row?.email?.trim() || "User";
}
