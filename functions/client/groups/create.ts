import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";
import {
  createGroupWithOrganiser,
  enrichGroupsWithUsers,
  getActiveMembership,
  toClientGroup,
} from "../../_lib/groups-core";

const CreateGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().nonnegative().optional(),
});

export default async function createGroup(req: Request, res: Response): Promise<void> {
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

    const body = validateBody(req, res, CreateGroupSchema);
    if (!body) return;

    const existing = await getActiveMembership(userId);
    if (existing) {
      fail(res, "You are already in an active group. Leave that group before creating a new one.", 409);
      return;
    }

    const group = await createGroupWithOrganiser({
      name: body.name,
      description: body.description,
      budgetMin: body.budgetMin,
      budgetMax: body.budgetMax,
      organiserId: userId,
    });

    const [enriched] = await enrichGroupsWithUsers([group]);
    ok(res, toClientGroup(enriched), 201);
  } catch (error) {
    console.error("[client/groups/create]", error);
    fail(res, error instanceof Error ? error.message : "Internal server error", 500);
  }
}
