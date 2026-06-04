import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { queryString, UUID_RE } from "../../_lib/parse-query";
import { decryptContentSafe } from "../../_lib/chat-encryption";
import { ok, fail } from "../../_lib/respond";

const GET_ROOM_MESSAGES_QUERY = `
  query GetRoomMessages($roomId: uuid!, $limit: Int!, $offset: Int!) {
    real_estate_chat_message(
      where: { room_id: { _eq: $roomId } }
      order_by: { created_at: asc }
      limit: $limit
      offset: $offset
    ) {
      id
      content
      sender_user_id
      status
      created_at
      message_type
      metadata
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
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

    const result = await hasuraQuery<{
      real_estate_chat_message?: Array<{
        id: string;
        content: string;
        sender_user_id: string;
        status: string;
        created_at: string;
        message_type: string;
        metadata: Record<string, unknown> | null;
      }>;
    }>(GET_ROOM_MESSAGES_QUERY, { roomId, limit, offset });

    if (result.errors?.length) {
      console.error("[client/chat/get-room-messages]", result.errors);
      fail(res, "Failed to fetch messages", 500);
      return;
    }

    const messages = result.data?.real_estate_chat_message ?? [];
    const decryptedMessages = messages.map((message) => ({
      ...message,
      content: decryptContentSafe(message.content),
    }));

    ok(res, decryptedMessages);
  } catch (error) {
    console.error("[client/chat/get-room-messages]", error);
    fail(res, "Internal server error", 500);
  }
}
