import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const GET_ROOMS = `
  query ChatRoomsForUser($userId: String!) {
    real_estate_chat_room(
      where: {
        _or: [
          { participant_one_user_id: { _eq: $userId } }
          { participant_two_user_id: { _eq: $userId } }
        ]
      }
      order_by: { updated_at: desc }
    ) {
      id
      room_uuid
      participant_one_user_id
      participant_two_user_id
      property_uuid
      updated_at
    }
  }
`;

export default async function getChatRooms(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const userId = getUserId(payload);
    if (!userId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const result = await hasuraQuery<{ real_estate_chat_room?: unknown[] }>(GET_ROOMS, {
      userId,
    });

    if (result.errors?.length) {
      fail(res, "Failed to fetch chat rooms", 500);
      return;
    }

    ok(res, { items: result.data?.real_estate_chat_room ?? [] });
  } catch (error) {
    console.error("[client/chat/get-chat-rooms]", error);
    fail(res, "Internal server error", 500);
  }
}
