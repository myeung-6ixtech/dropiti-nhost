import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { createNotification } from "../../_lib/notifications";
import {
  lookupUserByNhostId,
} from "../../_lib/real-estate-user-hasura";
import {
  assertOrganiser,
  countOccupiedSlots,
  enrichGroupsWithUsers,
  findMember,
  getGroupById,
  insertGroupMember,
  recalculateGroupStatus,
  resolveInviteeUserId,
  toClientGroup,
} from "../../_lib/groups-core";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const InviteMemberSchema = z
  .object({
    groupId: z.string().uuid(),
    inviteeEmail: z.string().email().optional(),
    inviteeUserId: z.string().uuid().optional(),
  })
  .refine((data) => data.inviteeEmail || data.inviteeUserId, {
    message: "inviteeEmail or inviteeUserId is required",
  });

export default async function inviteMember(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const body = validateBody(req, res, InviteMemberSchema);
    if (!body) return;

    const group = await getGroupById(body.groupId);
    if (!group) {
      fail(res, "Group not found", 404);
      return;
    }

    if (!assertOrganiser(group, userId)) {
      fail(res, "Only the organiser can invite members", 403);
      return;
    }

    if (group.status === "disbanded" || group.status === "locked") {
      fail(res, `Group is ${group.status} and cannot accept new members`, 409);
      return;
    }

    if (countOccupiedSlots(group.members) >= group.max_members) {
      fail(res, "Group is full", 409);
      return;
    }

    const invitee = await resolveInviteeUserId(body.inviteeEmail, body.inviteeUserId);
    if (!invitee) {
      fail(res, "User not found", 404);
      return;
    }

    if (invitee.userId === userId) {
      fail(res, "You cannot invite yourself", 400);
      return;
    }

    const existingMember = findMember(group.members, invitee.userId);
    if (existingMember && existingMember.status !== "declined" && existingMember.status !== "removed") {
      fail(res, "User is already in this group or has a pending invitation", 409);
      return;
    }

    if (existingMember && (existingMember.status === "declined" || existingMember.status === "removed")) {
      await hasuraQuery(
        `mutation ReinviteMember($id: uuid!) {
          update_real_estate_tenancy_group_members_by_pk(
            pk_columns: { id: $id }
            _set: { status: "invited", invited_at: "now()", responded_at: null }
          ) { id }
        }`,
        { id: existingMember.id }
      );
    } else {
      await insertGroupMember({
        groupId: body.groupId,
        userId: invitee.userId,
        role: "member",
        status: "invited",
      });
    }

    await recalculateGroupStatus(body.groupId);

    const organiserRow = await lookupUserByNhostId(userId);
    const senderName =
      organiserRow?.display_name?.trim() ||
      organiserRow?.email?.trim() ||
      "Someone";

    await createNotification({
      typeKey: "group_invitation",
      recipientUserId: invitee.userId,
      senderUserId: userId,
      data: {
        sender_name: senderName,
        group_name: group.name,
        group_id: group.id,
      },
    });

    const updated = await getGroupById(body.groupId);
    if (!updated) {
      fail(res, "Failed to load updated group", 500);
      return;
    }

    const [enriched] = await enrichGroupsWithUsers([updated]);
    ok(res, toClientGroup(enriched));
  } catch (error) {
    console.error("[client/groups/invite-member]", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("active group membership")) {
      fail(res, "This user is already in another active group", 409);
      return;
    }
    fail(res, message, 500);
  }
}
