import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const CreateRoomSchema = z.object({
  otherUserId: z.string().uuid(),
  propertyUuid: z.string().uuid().optional(),
});

const FIND_ROOM = `
  query FindChatRoom($userA: String!, $userB: String!) {
    real_estate_chat_room(
      where: {
        _or: [
          {
            _and: [
              { participant_one_user_id: { _eq: $userA } }
              { participant_two_user_id: { _eq: $userB } }
            ]
          }
          {
            _and: [
              { participant_one_user_id: { _eq: $userB } }
              { participant_two_user_id: { _eq: $userA } }
            ]
          }
        ]
      }
      limit: 1
    ) {
      id
      room_uuid
      participant_one_user_id
      participant_two_user_id
    }
  }
`;

const CREATE_ROOM = `
  mutation CreateChatRoom($room: real_estate_chat_room_insert_input!) {
    insert_real_estate_chat_room_one(object: $room) {
      id
      room_uuid
      participant_one_user_id
      participant_two_user_id
    }
  }
`;

export default async function getOrCreateRoom(req: Request, res: Response): Promise<void> {
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

    const body = validateBody(req, res, CreateRoomSchema);
    if (!body) return;

    if (body.otherUserId === userId) {
      fail(res, "Cannot create room with yourself", 400);
      return;
    }

    const existing = await hasuraQuery<{ real_estate_chat_room?: unknown[] }>(FIND_ROOM, {
      userA: userId,
      userB: body.otherUserId,
    });

    const found = existing.data?.real_estate_chat_room?.[0];
    if (found) {
      ok(res, found);
      return;
    }

    const room = {
      room_uuid: randomUUID(),
      participant_one_user_id: userId,
      participant_two_user_id: body.otherUserId,
      property_uuid: body.propertyUuid ?? null,
    };

    const created = await hasuraQuery<{ insert_real_estate_chat_room_one?: unknown }>(
      CREATE_ROOM,
      { room }
    );

    if (!created.data?.insert_real_estate_chat_room_one) {
      fail(res, "Failed to create chat room", 500);
      return;
    }

    ok(res, created.data.insert_real_estate_chat_room_one, 201);
  } catch (error) {
    console.error("[client/chat/get-or-create-room]", error);
    fail(res, "Internal server error", 500);
  }
}
