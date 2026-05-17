import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { getUserNotifications } from "../../_lib/notifications";
import { parsePagination, queryString } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

export default async function notificationsIndex(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const { limit, offset } = parsePagination(req);
    const isReadParam = queryString(req, "isRead");
    const isRead =
      isReadParam === "true" ? true : isReadParam === "false" ? false : undefined;

    const items = await getUserNotifications(userId, { isRead, limit, offset });
    ok(res, { items });
  } catch (error) {
    console.error("[client/notifications/index]", error);
    fail(res, "Internal server error", 500);
  }
}
