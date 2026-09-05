import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { ok, fail } from "../../_lib/respond";
import {
  enrichGroupsWithUsers,
  getGroupsForUser,
  toClientGroup,
} from "../../_lib/groups-core";

export default async function myGroups(req: Request, res: Response): Promise<void> {
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

    const groups = await getGroupsForUser(userId);
    const enriched = await enrichGroupsWithUsers(groups);
    ok(res, { items: enriched.map(toClientGroup) });
  } catch (error) {
    console.error("[client/groups/my-groups]", error);
    fail(res, error instanceof Error ? error.message : "Internal server error", 500);
  }
}
