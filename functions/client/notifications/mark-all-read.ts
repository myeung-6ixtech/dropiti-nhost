import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { markAllNotificationsRead } from "../../_lib/notifications";
import { ok, fail } from "../../_lib/respond";

export default async function markAllRead(req: Request, res: Response): Promise<void> {
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

    const affected = await markAllNotificationsRead(userId);
    ok(res, { affected });
  } catch (error) {
    console.error("[client/notifications/mark-all-read]", error);
    fail(res, "Internal server error", 500);
  }
}
