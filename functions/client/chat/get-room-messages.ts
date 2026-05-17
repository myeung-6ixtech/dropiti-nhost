import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryString, UUID_RE } from "../../_lib/parse-query";
import { ok, fail } from "../../_lib/respond";

const GET_MESSAGES = `
  query RoomMessages($roomId: uuid!, $limit: Int!) {
    real_estate_chat_message(
      where: { room_id: { _eq: $roomId } }
      order_by: { created_at: desc }
      limit: $limit
    ) {
      id
      content
      sender_user_id
      status
      message_type
      created_at
    }
  }
`;

export default async function getRoomMessages(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    if (!getUserId(payload)) {
      fail(res, "Invalid session", 401);
      return;
    }

    const roomId = queryString(req, "roomId");
    if (!roomId || !UUID_RE.test(roomId)) {
      fail(res, "roomId is required", 400);
      return;
    }

    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 100);

    const result = await hasuraQuery<{ real_estate_chat_message?: unknown[] }>(
      GET_MESSAGES,
      { roomId, limit }
    );

    if (result.errors?.length) {
      fail(res, "Failed to fetch messages", 500);
      return;
    }

    ok(res, { items: result.data?.real_estate_chat_message ?? [] });
  } catch (error) {
    console.error("[client/chat/get-room-messages]", error);
    fail(res, "Internal server error", 500);
  }
}
