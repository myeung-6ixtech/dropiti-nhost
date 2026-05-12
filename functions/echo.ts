import type { Request, Response } from "express";
import process from "node:process";
import { requireAuth, getUserId } from "./_lib/auth";
import { ok, fail } from "./_lib/respond";

/**
 * GET /v1/echo — requires `Authorization: Bearer <access_token>`.
 * Returns the verified user id and request query (safe metadata only).
 */
export default async function echo(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    ok(res, {
      userId: userId ?? null,
      query: req.query,
      node: process.version,
    });
  } catch (error) {
    console.error("[echo]", error);
    fail(res, "Internal server error", 500);
  }
}
