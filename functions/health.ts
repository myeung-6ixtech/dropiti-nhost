import type { Request, Response } from "express";
import process from "node:process";
import { ok, fail } from "./_lib/respond";

/**
 * GET /v1/health — unauthenticated liveness (deploy / ops).
 */
export default async function health(_req: Request, res: Response): Promise<void> {
  try {
    ok(
      res,
      {
        status: "ok",
        node: process.version,
        time: new Date().toISOString(),
      },
      200
    );
  } catch (error) {
    console.error("[health]", error);
    fail(res, "Internal server error", 500);
  }
}
