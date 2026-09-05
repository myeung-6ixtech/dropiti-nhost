import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { queryString } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";
import {
  assertAnyMember,
  enrichGroupsWithUsers,
  getGroupById,
  toClientGroup,
} from "../../_lib/groups-core";

export default async function getGroup(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET") {
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

    const groupId = queryString(req, "groupId");
    if (!groupId) {
      fail(res, "groupId is required", 400);
      return;
    }

    const group = await getGroupById(groupId);
    if (!group) {
      fail(res, "Group not found", 404);
      return;
    }

    if (!assertAnyMember(group, userId) && group.organiser_id !== userId) {
      fail(res, "You are not a member of this group", 403);
      return;
    }

    const [enriched] = await enrichGroupsWithUsers([group]);
    ok(res, toClientGroup(enriched));
  } catch (error) {
    console.error("[client/groups/get-group]", error);
    fail(res, error instanceof Error ? error.message : "Internal server error", 500);
  }
}
