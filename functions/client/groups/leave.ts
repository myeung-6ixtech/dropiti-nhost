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

const LeaveSchema = z.object({
  groupId: z.string().uuid(),
});

export default async function leaveGroup(req: Request, res: Response): Promise<void> {
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

    const body = validateBody(req, res, LeaveSchema);
    if (!body) return;

    const group = await getGroupById(body.groupId);
    if (!group) {
      fail(res, "Group not found", 404);
      return;
    }

    if (group.organiser_id === userId) {
      fail(res, "Organiser cannot leave. Disband the group or transfer organiser role first.", 409);
      return;
    }

    if (group.status === "locked") {
      fail(res, "Cannot leave a locked group", 409);
      return;
    }

    const member = findMember(group.members, userId);
    if (!member || member.status !== "accepted") {
      fail(res, "You are not an active member of this group", 404);
      return;
    }

    await updateGroupMember(member.id, {
      status: "removed",
      responded_at: new Date().toISOString(),
    });

    await recalculateGroupStatus(body.groupId);

    const updated = await getGroupById(body.groupId);
    if (!updated) {
      ok(res, { groupId: body.groupId, status: "left" });
      return;
    }

    const [enriched] = await enrichGroupsWithUsers([updated]);
    ok(res, toClientGroup(enriched));
  } catch (error) {
    console.error("[client/groups/leave]", error);
    fail(res, error instanceof Error ? error.message : "Internal server error", 500);
  }
}
