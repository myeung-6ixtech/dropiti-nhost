import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";
import {
  enrichGroupsWithUsers,
  findMember,
  getGroupById,
  recalculateGroupStatus,
  toClientGroup,
  updateGroupMember,
} from "../../_lib/groups-core";

const DeclineInviteSchema = z.object({
  groupId: z.string().uuid(),
});

export default async function declineInvite(req: Request, res: Response): Promise<void> {
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

    const body = validateBody(req, res, DeclineInviteSchema);
    if (!body) return;

    const group = await getGroupById(body.groupId);
    if (!group) {
      fail(res, "Group not found", 404);
      return;
    }

    const member = findMember(group.members, userId);
    if (!member || member.status !== "invited") {
      fail(res, "No pending invitation found for this group", 404);
      return;
    }

    await updateGroupMember(member.id, {
      status: "declined",
      responded_at: new Date().toISOString(),
    });

    await recalculateGroupStatus(body.groupId);

    ok(res, { groupId: body.groupId, status: "declined" });
  } catch (error) {
    console.error("[client/groups/decline-invite]", error);
    fail(res, error instanceof Error ? error.message : "Internal server error", 500);
  }
}
