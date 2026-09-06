import { hasuraQuery } from "./hasura";
import {
  displayNameFromUserRow,
  lookupUserByEmail,
  lookupUserByNhostId,
  lookupUsersByNhostIds,
} from "./real-estate-user-hasura";

export type GroupStatus = "pending" | "active" | "locked" | "disbanded";
export type MemberRole = "organiser" | "member";
export type MemberStatus = "invited" | "accepted" | "declined" | "removed";

export type TenancyGroupRow = {
  id: string;
  name: string;
  description?: string | null;
  organiser_id: string;
  status: GroupStatus;
  max_members: number;
  budget_min?: number | null;
  budget_max?: number | null;
  created_at: string;
  updated_at: string;
  disbanded_at?: string | null;
};

export type TenancyGroupMemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  invited_at: string;
  responded_at?: string | null;
};

export type GroupMemberWithUser = TenancyGroupMemberRow & {
  user?: {
    userId: string;
    displayName: string;
    email?: string | null;
    avatarUrl?: string | null;
  };
};

export type GroupWithMembers = TenancyGroupRow & {
  members: GroupMemberWithUser[];
};

const GROUP_FIELDS = `
  id
  name
  description
  organiser_id
  status
  max_members
  budget_min
  budget_max
  created_at
  updated_at
  disbanded_at
`;

const MEMBER_FIELDS = `
  id
  group_id
  user_id
  role
  status
  invited_at
  responded_at
`;

const GET_GROUP = `
  query GetTenancyGroup($id: uuid!) {
    real_estate_tenancy_groups_by_pk(id: $id) {
      ${GROUP_FIELDS}
      members: tenancy_group_members {
        ${MEMBER_FIELDS}
      }
    }
  }
`;

const GET_GROUPS_BY_ORGANISER = `
  query GetGroupsByOrganiser($userId: String!) {
    real_estate_tenancy_groups(
      where: { organiser_id: { _eq: $userId }, status: { _neq: "disbanded" } }
      order_by: { updated_at: desc }
    ) {
      ${GROUP_FIELDS}
    }
  }
`;

const GET_MEMBER_GROUP_IDS = `
  query GetMemberGroupIds($userId: String!) {
    real_estate_tenancy_group_members(where: { user_id: { _eq: $userId } }) {
      group_id
    }
  }
`;

const GET_GROUPS_BY_IDS = `
  query GetGroupsByIds($ids: [uuid!]!) {
    real_estate_tenancy_groups(
      where: { id: { _in: $ids }, status: { _neq: "disbanded" } }
      order_by: { updated_at: desc }
    ) {
      ${GROUP_FIELDS}
    }
  }
`;

const GET_MEMBERS_FOR_GROUPS = `
  query GetMembersForGroups($groupIds: [uuid!]!) {
    real_estate_tenancy_group_members(
      where: { group_id: { _in: $groupIds } }
      order_by: { invited_at: asc }
    ) {
      ${MEMBER_FIELDS}
    }
  }
`;

const CHECK_ACTIVE_MEMBERSHIP = `
  query CheckActiveGroupMembership($userId: String!) {
    real_estate_tenancy_group_members(
      where: {
        user_id: { _eq: $userId }
        status: { _eq: "accepted" }
      }
    ) {
      id
      group_id
    }
  }
`;

const GET_ACTIVE_GROUPS_BY_IDS = `
  query GetActiveGroupsByIds($ids: [uuid!]!) {
    real_estate_tenancy_groups(
      where: {
        id: { _in: $ids }
        status: { _in: ["pending", "active", "locked"] }
      }
      limit: 1
    ) {
      id
      name
      status
    }
  }
`;

const CREATE_GROUP = `
  mutation CreateTenancyGroup($object: real_estate_tenancy_groups_insert_input!) {
    insert_real_estate_tenancy_groups_one(object: $object) {
      ${GROUP_FIELDS}
      members: tenancy_group_members {
        ${MEMBER_FIELDS}
      }
    }
  }
`;

const INSERT_MEMBER = `
  mutation InsertGroupMember($object: real_estate_tenancy_group_members_insert_input!) {
    insert_real_estate_tenancy_group_members_one(object: $object) {
      ${MEMBER_FIELDS}
    }
  }
`;

const UPDATE_MEMBER = `
  mutation UpdateGroupMember($id: uuid!, $updates: real_estate_tenancy_group_members_set_input!) {
    update_real_estate_tenancy_group_members_by_pk(pk_columns: { id: $id }, _set: $updates) {
      ${MEMBER_FIELDS}
    }
  }
`;

const UPDATE_GROUP = `
  mutation UpdateTenancyGroup($id: uuid!, $updates: real_estate_tenancy_groups_set_input!) {
    update_real_estate_tenancy_groups_by_pk(pk_columns: { id: $id }, _set: $updates) {
      ${GROUP_FIELDS}
    }
  }
`;

const MIN_ACTIVE_MEMBERS = 2;

function extractMembers(
  row: TenancyGroupRow & {
    members?: TenancyGroupMemberRow[];
    tenancy_group_members?: TenancyGroupMemberRow[];
  }
): TenancyGroupMemberRow[] {
  return row.members ?? row.tenancy_group_members ?? [];
}

function attachMembersToGroups(
  groups: TenancyGroupRow[],
  members: TenancyGroupMemberRow[]
): GroupWithMembers[] {
  const membersByGroup = new Map<string, TenancyGroupMemberRow[]>();
  for (const member of members) {
    const existing = membersByGroup.get(member.group_id) ?? [];
    existing.push(member);
    membersByGroup.set(member.group_id, existing);
  }

  return groups.map((group) => ({
    ...group,
    members: membersByGroup.get(group.id) ?? [],
  }));
}

export async function getGroupById(groupId: string): Promise<GroupWithMembers | null> {
  const result = await hasuraQuery<{
    real_estate_tenancy_groups_by_pk?: TenancyGroupRow & {
      members?: TenancyGroupMemberRow[];
    };
  }>(GET_GROUP, { id: groupId });

  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to fetch group");
  }

  const row = result.data?.real_estate_tenancy_groups_by_pk;
  if (!row) return null;

  let members = extractMembers(row);

  if (members.length === 0) {
    const membersResult = await hasuraQuery<{
      real_estate_tenancy_group_members?: TenancyGroupMemberRow[];
    }>(GET_MEMBERS_FOR_GROUPS, { groupIds: [groupId] });

    if (membersResult.errors?.length) {
      throw new Error(membersResult.errors[0]?.message ?? "Failed to fetch group members");
    }

    members = membersResult.data?.real_estate_tenancy_group_members ?? [];
  }

  return {
    ...row,
    members,
  };
}

export async function getGroupsForUser(userId: string): Promise<GroupWithMembers[]> {
  const groupMap = new Map<string, TenancyGroupRow>();

  const organiserResult = await hasuraQuery<{
    real_estate_tenancy_groups?: TenancyGroupRow[];
  }>(GET_GROUPS_BY_ORGANISER, { userId });

  if (organiserResult.errors?.length) {
    throw new Error(organiserResult.errors[0]?.message ?? "Failed to fetch organiser groups");
  }

  for (const group of organiserResult.data?.real_estate_tenancy_groups ?? []) {
    groupMap.set(group.id, group);
  }

  const memberIdsResult = await hasuraQuery<{
    real_estate_tenancy_group_members?: Array<{ group_id: string }>;
  }>(GET_MEMBER_GROUP_IDS, { userId });

  if (memberIdsResult.errors?.length) {
    throw new Error(memberIdsResult.errors[0]?.message ?? "Failed to fetch member groups");
  }

  const memberGroupIds = [
    ...new Set(
      (memberIdsResult.data?.real_estate_tenancy_group_members ?? []).map((m) => m.group_id)
    ),
  ].filter((id) => !groupMap.has(id));

  if (memberGroupIds.length > 0) {
    const memberGroupsResult = await hasuraQuery<{
      real_estate_tenancy_groups?: TenancyGroupRow[];
    }>(GET_GROUPS_BY_IDS, { ids: memberGroupIds });

    if (memberGroupsResult.errors?.length) {
      throw new Error(memberGroupsResult.errors[0]?.message ?? "Failed to fetch member groups");
    }

    for (const group of memberGroupsResult.data?.real_estate_tenancy_groups ?? []) {
      groupMap.set(group.id, group);
    }
  }

  const groups = Array.from(groupMap.values()).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  if (groups.length === 0) {
    return [];
  }

  const membersResult = await hasuraQuery<{
    real_estate_tenancy_group_members?: TenancyGroupMemberRow[];
  }>(GET_MEMBERS_FOR_GROUPS, { groupIds: groups.map((g) => g.id) });

  if (membersResult.errors?.length) {
    throw new Error(membersResult.errors[0]?.message ?? "Failed to fetch group members");
  }

  return attachMembersToGroups(
    groups,
    membersResult.data?.real_estate_tenancy_group_members ?? []
  );
}

export async function getActiveMembership(userId: string) {
  const membersResult = await hasuraQuery<{
    real_estate_tenancy_group_members?: Array<{ id: string; group_id: string }>;
  }>(CHECK_ACTIVE_MEMBERSHIP, { userId });

  if (membersResult.errors?.length) {
    throw new Error(membersResult.errors[0]?.message ?? "Failed to check membership");
  }

  const members = membersResult.data?.real_estate_tenancy_group_members ?? [];
  if (members.length === 0) return null;

  const groupIds = members.map((m) => m.group_id);
  const groupsResult = await hasuraQuery<{
    real_estate_tenancy_groups?: Array<{ id: string; name: string; status: GroupStatus }>;
  }>(GET_ACTIVE_GROUPS_BY_IDS, { ids: groupIds });

  if (groupsResult.errors?.length) {
    throw new Error(groupsResult.errors[0]?.message ?? "Failed to check membership");
  }

  const activeGroup = groupsResult.data?.real_estate_tenancy_groups?.[0];
  if (!activeGroup) return null;

  const member = members.find((m) => m.group_id === activeGroup.id);
  if (!member) return null;

  return {
    id: member.id,
    group_id: activeGroup.id,
    group: activeGroup,
  };
}

export async function resolveInviteeUserId(
  inviteeEmail?: string,
  inviteeUserId?: string
): Promise<{ userId: string; displayName: string } | null> {
  if (inviteeUserId) {
    const row = await lookupUserByNhostId(inviteeUserId);
    if (!row?.nhost_user_id) return null;
    return {
      userId: row.nhost_user_id,
      displayName: displayNameFromUserRow(row),
    };
  }

  if (inviteeEmail) {
    const row = await lookupUserByEmail(inviteeEmail);
    if (!row?.nhost_user_id) return null;
    return {
      userId: row.nhost_user_id,
      displayName: displayNameFromUserRow(row),
    };
  }

  return null;
}

export function computeGroupStatus(members: TenancyGroupMemberRow[]): GroupStatus {
  const accepted = members.filter((m) => m.status === "accepted");
  const pendingInvites = members.filter((m) => m.status === "invited");

  if (accepted.length >= MIN_ACTIVE_MEMBERS && pendingInvites.length === 0) {
    return "active";
  }
  return "pending";
}

export async function recalculateGroupStatus(groupId: string): Promise<GroupStatus | null> {
  const group = await getGroupById(groupId);
  if (!group || group.status === "disbanded" || group.status === "locked") {
    return group?.status ?? null;
  }

  const nextStatus = computeGroupStatus(group.members);
  if (nextStatus === group.status) {
    return group.status;
  }

  const result = await hasuraQuery<{
    update_real_estate_tenancy_groups_by_pk?: { status: GroupStatus };
  }>(UPDATE_GROUP, {
    id: groupId,
    updates: { status: nextStatus, updated_at: new Date().toISOString() },
  });

  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to update group status");
  }

  return result.data?.update_real_estate_tenancy_groups_by_pk?.status ?? nextStatus;
}

export function countOccupiedSlots(members: TenancyGroupMemberRow[]): number {
  return members.filter((m) => m.status === "accepted" || m.status === "invited").length;
}

export function findMember(
  members: TenancyGroupMemberRow[],
  userId: string
): TenancyGroupMemberRow | undefined {
  return members.find((m) => m.user_id === userId);
}

export function assertOrganiser(group: GroupWithMembers, userId: string): boolean {
  return group.organiser_id === userId;
}

export function assertAcceptedMember(group: GroupWithMembers, userId: string): boolean {
  const member = findMember(group.members, userId);
  return member?.status === "accepted";
}

export function assertAnyMember(group: GroupWithMembers, userId: string): boolean {
  return group.members.some(
    (m) => m.user_id === userId && (m.status === "accepted" || m.status === "invited")
  );
}

export async function createGroupWithOrganiser(input: {
  name: string;
  description?: string;
  budgetMin?: number;
  budgetMax?: number;
  organiserId: string;
}): Promise<GroupWithMembers> {
  const result = await hasuraQuery<{
    insert_real_estate_tenancy_groups_one?: GroupWithMembers;
  }>(CREATE_GROUP, {
    object: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      organiser_id: input.organiserId,
      status: "pending",
      max_members: 3,
      budget_min: input.budgetMin ?? null,
      budget_max: input.budgetMax ?? null,
      tenancy_group_members: {
        data: [
          {
            user_id: input.organiserId,
            role: "organiser",
            status: "accepted",
            responded_at: new Date().toISOString(),
          },
        ],
      },
    },
  });

  if (result.errors?.length || !result.data?.insert_real_estate_tenancy_groups_one) {
    throw new Error(result.errors?.[0]?.message ?? "Failed to create group");
  }

  const inserted = result.data.insert_real_estate_tenancy_groups_one;
  return {
    ...inserted,
    members:
      inserted.members ??
      (inserted as { tenancy_group_members?: TenancyGroupMemberRow[] }).tenancy_group_members ??
      [],
  };
}

export async function insertGroupMember(input: {
  groupId: string;
  userId: string;
  role?: MemberRole;
  status?: MemberStatus;
}): Promise<TenancyGroupMemberRow> {
  const result = await hasuraQuery<{
    insert_real_estate_tenancy_group_members_one?: TenancyGroupMemberRow;
  }>(INSERT_MEMBER, {
    object: {
      group_id: input.groupId,
      user_id: input.userId,
      role: input.role ?? "member",
      status: input.status ?? "invited",
      responded_at: input.status === "accepted" ? new Date().toISOString() : null,
    },
  });

  if (result.errors?.length || !result.data?.insert_real_estate_tenancy_group_members_one) {
    throw new Error(result.errors?.[0]?.message ?? "Failed to add member");
  }

  return result.data.insert_real_estate_tenancy_group_members_one;
}

export async function updateGroupMember(
  memberId: string,
  updates: Partial<Pick<TenancyGroupMemberRow, "status" | "responded_at">>
): Promise<TenancyGroupMemberRow> {
  const result = await hasuraQuery<{
    update_real_estate_tenancy_group_members_by_pk?: TenancyGroupMemberRow;
  }>(UPDATE_MEMBER, { id: memberId, updates });

  if (result.errors?.length || !result.data?.update_real_estate_tenancy_group_members_by_pk) {
    throw new Error(result.errors?.[0]?.message ?? "Failed to update member");
  }

  return result.data.update_real_estate_tenancy_group_members_by_pk;
}

export async function updateGroup(
  groupId: string,
  updates: Partial<Pick<TenancyGroupRow, "status" | "disbanded_at">>
): Promise<TenancyGroupRow> {
  const result = await hasuraQuery<{
    update_real_estate_tenancy_groups_by_pk?: TenancyGroupRow;
  }>(UPDATE_GROUP, {
    id: groupId,
    updates: { ...updates, updated_at: new Date().toISOString() },
  });

  if (result.errors?.length || !result.data?.update_real_estate_tenancy_groups_by_pk) {
    throw new Error(result.errors?.[0]?.message ?? "Failed to update group");
  }

  return result.data.update_real_estate_tenancy_groups_by_pk;
}

export async function enrichGroupsWithUsers(
  groups: GroupWithMembers[]
): Promise<GroupWithMembers[]> {
  const userIds = new Set<string>();
  for (const group of groups) {
    for (const member of group.members) {
      userIds.add(member.user_id);
    }
  }

  if (userIds.size === 0) return groups;

  let users: Awaited<ReturnType<typeof lookupUsersByNhostIds>> = [];
  try {
    users = await lookupUsersByNhostIds(Array.from(userIds));
  } catch (error) {
    console.warn("[groups-core] enrichGroupsWithUsers: user lookup failed", error);
    return groups.map((group) => ({
      ...group,
      members: (group.members ?? []).map((member) => ({
        ...member,
        user: {
          userId: member.user_id,
          displayName: "User",
        },
      })),
    }));
  }

  const byId = new Map(
    users.map((u) => [
      u.nhost_user_id,
      {
        userId: u.nhost_user_id,
        displayName: displayNameFromUserRow(u),
        email: u.email,
        avatarUrl: u.photo_url,
      },
    ])
  );

  return groups.map((group) => ({
    ...group,
    members: (group.members ?? []).map((member) => ({
      ...member,
      user: byId.get(member.user_id) ?? {
        userId: member.user_id,
        displayName: "User",
      },
    })),
  }));
}

export function toClientGroup(group: GroupWithMembers) {
  const members = group.members ?? [];
  return {
    id: group.id,
    name: group.name,
    description: group.description ?? null,
    organiserId: group.organiser_id,
    status: group.status,
    maxMembers: group.max_members,
    budgetMin: group.budget_min ?? null,
    budgetMax: group.budget_max ?? null,
    createdAt: group.created_at,
    updatedAt: group.updated_at,
    disbandedAt: group.disbanded_at ?? null,
    members: members.map((m) => ({
      id: m.id,
      groupId: m.group_id,
      userId: m.user_id,
      role: m.role,
      status: m.status,
      invitedAt: m.invited_at,
      respondedAt: m.responded_at ?? null,
      user: m.user ?? null,
    })),
    acceptedCount: members.filter((m) => m.status === "accepted").length,
    pendingInviteCount: members.filter((m) => m.status === "invited").length,
  };
}
