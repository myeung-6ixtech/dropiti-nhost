import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";
import {
  enrichGroupsWithUsers,
  findMember,
  getActiveMembership,
  getGroupById,
  recalculateGroupStatus,
  toClientGroup,
  updateGroupMember,
} from "../../_lib/groups-core";

const AcceptInviteSchema = z.object({
  groupId: z.string().uuid(),
});

export default async function acceptInvite(req: Request, res: Response): Promise<void> {
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

    const body = validateBody(req, res, AcceptInviteSchema);
    if (!body) return;

    const group = await getGroupById(body.groupId);
    if (!group) {
      fail(res, "Group not found", 404);
      return;
    }

    if (group.status === "disbanded" || group.status === "locked") {
      fail(res, `Group is ${group.status}`, 409);
      return;
    }

    const member = findMember(group.members, userId);
    if (!member || member.status !== "invited") {
      fail(res, "No pending invitation found for this group", 404);
      return;
    }

    const existing = await getActiveMembership(userId);
    if (existing && existing.group_id !== body.groupId) {
      fail(res, "You are already in an active group. Leave that group before accepting a new invitation.", 409);
      return;
    }

    await updateGroupMember(member.id, {
      status: "accepted",
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
    console.error("[client/groups/accept-invite]", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("active group membership")) {
      fail(res, "You are already in an active group. Leave that group before accepting a new invitation.", 409);
      return;
    }
    fail(res, message, 500);
  }
}
