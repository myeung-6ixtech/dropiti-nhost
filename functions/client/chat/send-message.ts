import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const SendMessageSchema = z.object({
  roomId: z.string().uuid(),
  content: z.string().min(1).max(2000),
  messageType: z.string().optional(),
});

const SEND_MESSAGE = `
  mutation SendMessage(
    $roomId: uuid!
    $senderUserId: String!
    $content: String!
    $messageType: String
  ) {
    insert_real_estate_chat_message_one(
      object: {
        room_id: $roomId
        sender_user_id: $senderUserId
        content: $content
        message_type: $messageType
      }
    ) {
      id
      content
      sender_user_id
      created_at
    }
  }
`;

export default async function sendMessage(req: Request, res: Response): Promise<void> {
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

    const body = validateBody(req, res, SendMessageSchema);
    if (!body) return;

    if (/<\s*script/i.test(body.content)) {
      fail(res, "Invalid content", 400);
      return;
    }

    const result = await hasuraQuery<{ insert_real_estate_chat_message_one?: unknown }>(
      SEND_MESSAGE,
      {
        roomId: body.roomId,
        senderUserId: userId,
        content: body.content,
        messageType: body.messageType ?? "text",
      }
    );

    if (!result.data?.insert_real_estate_chat_message_one) {
      fail(res, "Failed to send message", 500);
      return;
    }

    ok(res, result.data.insert_real_estate_chat_message_one, 201);
  } catch (error) {
    console.error("[client/chat/send-message]", error);
    fail(res, "Internal server error", 500);
  }
}
