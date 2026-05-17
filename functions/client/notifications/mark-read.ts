import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../_lib/auth";
import { markNotificationRead } from "../../_lib/notifications";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const MarkReadSchema = z.object({
  notificationId: z.string().uuid(),
});

export default async function markRead(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const body = validateBody(req, res, MarkReadSchema);
    if (!body) return;

    const row = await markNotificationRead(body.notificationId);
    if (!row) {
      fail(res, "Notification not found", 404);
      return;
    }

    ok(res, row);
  } catch (error) {
    console.error("[client/notifications/mark-read]", error);
    fail(res, "Internal server error", 500);
  }
}
