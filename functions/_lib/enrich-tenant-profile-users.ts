import { hasuraQuery } from "./hasura";

const GET_USERS_BY_NHOST_IDS = `
  query TenantProfileUsers($ids: [uuid!]!) {
    real_estate_user(where: { nhost_user_id: { _in: $ids } }) {
      nhost_user_id
      display_name
      photo_url
      rating
      review_count
      email
    }
  }
`;

type RealEstateUserRow = {
  nhost_user_id: string;
  display_name?: string | null;
  photo_url?: string | null;
  rating?: number | null;
  review_count?: number | null;
  email?: string | null;
};

type AuthUserRow = {
  id?: string;
  email?: string;
  avatarUrl?: string | null;
};

/** Merge `auth.users` + `real_estate_user` into one embedded `user` for the client. */
function mergeTenantProfileUser(
  authUser: AuthUserRow | null | undefined,
  reUser: RealEstateUserRow | undefined,
  userId: string
): Record<string, unknown> {
  const nhostId = String(reUser?.nhost_user_id ?? authUser?.id ?? userId);
  const displayName = reUser?.display_name?.trim() || undefined;
  const photoUrl = reUser?.photo_url?.trim() || authUser?.avatarUrl || undefined;
  const email = reUser?.email?.trim() || authUser?.email || undefined;

  return {
    id: nhostId,
    nhost_user_id: nhostId,
    email,
    avatarUrl: photoUrl ?? authUser?.avatarUrl ?? null,
    display_name: displayName,
    photo_url: photoUrl,
    rating: reUser?.rating ?? undefined,
    review_count: reUser?.review_count ?? undefined,
  };
}

/** Attach enriched `user` from `real_estate_user` for each tenant profile row. */
export async function enrichTenantProfilesWithUsers(
  items: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const userIds = [
    ...new Set(
      items
        .map((row) => String(row.user_id ?? "").trim())
        .filter((id) => id.length > 0)
    ),
  ];

  if (userIds.length === 0) {
    return items;
  }

  const result = await hasuraQuery<{
    real_estate_user?: RealEstateUserRow[];
  }>(GET_USERS_BY_NHOST_IDS, { ids: userIds });

  const byNhostId = new Map<string, RealEstateUserRow>();
  for (const row of result.data?.real_estate_user ?? []) {
    if (row.nhost_user_id) {
      byNhostId.set(row.nhost_user_id, row);
    }
  }

  return items.map((item) => {
    const userId = String(item.user_id ?? "");
    const authUser = item.user as AuthUserRow | null | undefined;
    const reUser = byNhostId.get(userId);
    return {
      ...item,
      real_estate_user: reUser ?? null,
      user: mergeTenantProfileUser(authUser, reUser, userId),
    };
  });
}

/** Enrich a single tenant profile row (GET/POST/PATCH profile). */
export async function enrichTenantProfileWithUser(
  profile: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const [enriched] = await enrichTenantProfilesWithUsers([profile]);
  return enriched ?? profile;
}
