import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { getUnreadCount } from "../../_lib/notifications";
import { ok, fail } from "../../_lib/respond";

export default async function unreadCount(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const count = await getUnreadCount(userId);
    ok(res, { count });
  } catch (error) {
    console.error("[client/notifications/unread-count]", error);
    fail(res, "Internal server error", 500);
  }
}
