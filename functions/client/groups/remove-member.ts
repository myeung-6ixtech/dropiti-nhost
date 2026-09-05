import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";
import {
  assertOrganiser,
  enrichGroupsWithUsers,
  findMember,
  getGroupById,
  recalculateGroupStatus,
  toClientGroup,
  updateGroupMember,
} from "../../_lib/groups-core";

const RemoveMemberSchema = z.object({
  groupId: z.string().uuid(),
  userId: z.string().uuid(),
});

export default async function removeMember(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const actorId = getUserId(payload);
    if (!actorId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const body = validateBody(req, res, RemoveMemberSchema);
    if (!body) return;

    const group = await getGroupById(body.groupId);
    if (!group) {
      fail(res, "Group not found", 404);
      return;
    }

    if (!assertOrganiser(group, actorId)) {
      fail(res, "Only the organiser can remove members", 403);
      return;
    }

    if (group.status === "locked") {
      fail(res, "Cannot remove members from a locked group", 409);
      return;
    }

    if (body.userId === group.organiser_id) {
      fail(res, "Cannot remove the organiser", 400);
      return;
    }

    const member = findMember(group.members, body.userId);
    if (!member || (member.status !== "accepted" && member.status !== "invited")) {
      fail(res, "Member not found in this group", 404);
      return;
    }

    await updateGroupMember(member.id, {
      status: "removed",
      responded_at: new Date().toISOString(),
    });

    await recalculateGroupStatus(body.groupId);

    const updated = await getGroupById(body.groupId);
    if (!updated) {
      fail(res, "Failed to load updated group", 500);
      return;
    }

    const [enriched] = await enrichGroupsWithUsers([updated]);
    ok(res, toClientGroup(enriched));
  } catch (error) {
    console.error("[client/groups/remove-member]", error);
    fail(res, error instanceof Error ? error.message : "Internal server error", 500);
  }
}
