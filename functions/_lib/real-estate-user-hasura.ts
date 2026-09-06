import { hasuraQuery } from "./hasura";

/** Postgres table is `real_estate.user`; Hasura GraphQL root varies by metadata. */
const GRAPHQL_ROOT_FIELDS = ["user", "real_estate_user"] as const;

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

function isRetryableUserLookupError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("not found in type") ||
    lower.includes("field 'real_estate_user'") ||
    lower.includes("field 'user'")
  );
}

async function runUserListQuery(
  queries: Record<(typeof GRAPHQL_ROOT_FIELDS)[number], string>,
  variables: Record<string, unknown>
): Promise<RealEstateUserLookupRow[]> {
  let lastError: string | undefined;

  for (const rootField of GRAPHQL_ROOT_FIELDS) {
    const result = await hasuraQuery<Record<string, RealEstateUserLookupRow[]>>(
      queries[rootField],
      variables
    );

    if (result.errors?.length) {
      const message = result.errors[0]?.message ?? "Failed to lookup user";
      lastError = message;
      if (isRetryableUserLookupError(message)) {
        continue;
      }
      throw new Error(message);
    }

    const rows = result.data?.[rootField];
    if (Array.isArray(rows)) {
      return rows;
    }
  }

  if (lastError) {
    throw new Error(lastError);
  }

  return [];
}

const LOOKUP_BY_NHOST_IDS: Record<(typeof GRAPHQL_ROOT_FIELDS)[number], string> = {
  user: `
    query LookupUsersByNhostIds($ids: [uuid!]!) {
      user(where: { nhost_user_id: { _in: $ids } }) {
        ${PROFILE_FIELDS}
      }
    }
  `,
  real_estate_user: `
    query LookupUsersByNhostIds($ids: [uuid!]!) {
      real_estate_user(where: { nhost_user_id: { _in: $ids } }) {
        ${PROFILE_FIELDS}
      }
    }
  `,
};

const LOOKUP_BY_NHOST_ID: Record<(typeof GRAPHQL_ROOT_FIELDS)[number], string> = {
  user: `
    query LookupUserByNhostId($nhostUserId: uuid!) {
      user(where: { nhost_user_id: { _eq: $nhostUserId } }, limit: 1) {
        ${PROFILE_FIELDS}
      }
    }
  `,
  real_estate_user: `
    query LookupUserByNhostId($nhostUserId: uuid!) {
      real_estate_user(where: { nhost_user_id: { _eq: $nhostUserId } }, limit: 1) {
        ${PROFILE_FIELDS}
      }
    }
  `,
};

const LOOKUP_BY_EMAIL: Record<(typeof GRAPHQL_ROOT_FIELDS)[number], string> = {
  user: `
    query LookupUserByEmail($email: String!) {
      user(where: { email: { _eq: $email } }, limit: 1) {
        ${PROFILE_FIELDS}
      }
    }
  `,
  real_estate_user: `
    query LookupUserByEmail($email: String!) {
      real_estate_user(where: { email: { _eq: $email } }, limit: 1) {
        ${PROFILE_FIELDS}
      }
    }
  `,
};

export async function lookupUsersByNhostIds(
  ids: string[]
): Promise<RealEstateUserLookupRow[]> {
  if (ids.length === 0) return [];
  return runUserListQuery(LOOKUP_BY_NHOST_IDS, { ids });
}

export async function lookupUserByNhostId(
  nhostUserId: string
): Promise<RealEstateUserLookupRow | null> {
  const rows = await runUserListQuery(LOOKUP_BY_NHOST_ID, { nhostUserId });
  return rows[0] ?? null;
}

export async function lookupUserByEmail(
  email: string
): Promise<RealEstateUserLookupRow | null> {
  const rows = await runUserListQuery(LOOKUP_BY_EMAIL, {
    email: email.trim().toLowerCase(),
  });
  return rows[0] ?? null;
}

export function displayNameFromUserRow(
  row: Pick<RealEstateUserLookupRow, "display_name" | "email"> | null | undefined
): string {
  return row?.display_name?.trim() || row?.email?.trim() || "User";
}
