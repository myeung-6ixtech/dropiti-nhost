import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";
import {
  assertOrganiser,
  getGroupById,
  updateGroup,
} from "../../_lib/groups-core";

const DisbandSchema = z.object({
  groupId: z.string().uuid(),
});

export default async function disbandGroup(req: Request, res: Response): Promise<void> {
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

    const body = validateBody(req, res, DisbandSchema);
    if (!body) return;

    const group = await getGroupById(body.groupId);
    if (!group) {
      fail(res, "Group not found", 404);
      return;
    }

    if (!assertOrganiser(group, userId)) {
      fail(res, "Only the organiser can disband the group", 403);
      return;
    }

    if (group.status === "locked") {
      fail(res, "Cannot disband a locked group", 409);
      return;
    }

    if (group.status === "disbanded") {
      ok(res, { groupId: body.groupId, status: "disbanded" });
      return;
    }

    await updateGroup(body.groupId, {
      status: "disbanded",
      disbanded_at: new Date().toISOString(),
    });

    ok(res, { groupId: body.groupId, status: "disbanded" });
  } catch (error) {
    console.error("[client/groups/disband]", error);
    fail(res, error instanceof Error ? error.message : "Internal server error", 500);
  }
}
