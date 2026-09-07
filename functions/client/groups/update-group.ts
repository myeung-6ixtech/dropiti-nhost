import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";
import {
  assertOrganiser,
  enrichGroupsWithUsers,
  getGroupById,
  toClientGroup,
  updateGroupDetails,
} from "../../_lib/groups-core";

const UpdateGroupSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().nonnegative().optional(),
});

export default async function updateGroup(req: Request, res: Response): Promise<void> {
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

    const body = validateBody(req, res, UpdateGroupSchema);
    if (!body) return;

    if (body.budgetMin !== undefined && body.budgetMax !== undefined && body.budgetMin > body.budgetMax) {
      fail(res, "Max budget must be greater than min budget", 400);
      return;
    }

    const group = await getGroupById(body.groupId);
    if (!group) {
      fail(res, "Group not found", 404);
      return;
    }

    if (!assertOrganiser(group, userId)) {
      fail(res, "Only the organiser can update group details", 403);
      return;
    }

    if (group.status === "disbanded" || group.status === "locked") {
      fail(res, `Group is ${group.status} and cannot be updated`, 409);
      return;
    }

    await updateGroupDetails(body.groupId, {
      name: body.name,
      description: body.description?.trim() || null,
      budget_min: body.budgetMin ?? null,
      budget_max: body.budgetMax ?? null,
    });

    const updated = await getGroupById(body.groupId);
    if (!updated) {
      fail(res, "Failed to load updated group", 500);
      return;
    }

    const [enriched] = await enrichGroupsWithUsers([updated]);
    ok(res, toClientGroup(enriched));
  } catch (error) {
    console.error("[client/groups/update-group]", error);
    fail(res, error instanceof Error ? error.message : "Internal server error", 500);
  }
}
