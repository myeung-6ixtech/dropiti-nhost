import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const CreateRoomSchema = z.object({
  otherUserId: z.string().uuid(),
  user1Role: z.enum(["tenant", "landlord", "support", "admin"]).optional(),
  user2Role: z.enum(["tenant", "landlord", "support", "admin"]).optional(),
});

const GET_EXISTING_ROOM_QUERY = `
  query GetExistingRoom($user1UserId: String!) {
    real_estate_chat_room_participant(
      where: { user_id: { _eq: $user1UserId } }
    ) {
      id
      room_id
      user_id
      role
      joined_at
      last_read_at
      is_active
    }
  }
`;

const GET_ROOM_BY_ID_QUERY = `
  query GetRoomById($roomId: uuid!) {
    real_estate_chat_room(where: { id: { _eq: $roomId } }) {
      id
      title
      room_type
      created_at
      updated_at
      last_message_at
      is_active
    }
  }
`;

const CHECK_USER_IN_ROOM_QUERY = `
  query CheckUserInRoom($roomId: uuid!, $userId: String!) {
    real_estate_chat_room_participant(
      where: { room_id: { _eq: $roomId }, user_id: { _eq: $userId } }
    ) {
      id
      room_id
      user_id
      role
    }
  }
`;

const CREATE_ROOM_MUTATION = `
  mutation CreateRoom($roomId: uuid!) {
    insert_real_estate_chat_room_one(object: {
      id: $roomId
      room_type: "direct"
      title: null
    }) {
      id
      room_type
      created_at
      updated_at
      last_message_at
      is_active
    }
  }
`;

const ADD_PARTICIPANT_MUTATION = `
  mutation AddParticipant($roomId: uuid!, $userId: String!, $role: String!) {
    insert_real_estate_chat_room_participant_one(object: {
      room_id: $roomId
      user_id: $userId
      role: $role
    }) {
      id
      room_id
      user_id
      role
      joined_at
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

    const user1UserId = getUserId(payload);
    if (!user1UserId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const body = validateBody(req, res, CreateRoomSchema);
    if (!body) return;

    const user2UserId = body.otherUserId;
    if (user2UserId === user1UserId) {
      fail(res, "Cannot create room with yourself", 400);
      return;
    }

    const user1Role = body.user1Role ?? "tenant";
    const user2Role = body.user2Role ?? "landlord";

    const existing = await hasuraQuery<{
      real_estate_chat_room_participant?: Array<{ room_id: string }>;
    }>(GET_EXISTING_ROOM_QUERY, { user1UserId });

    if (existing.errors?.length) {
      fail(res, "Failed to look up chat rooms", 500);
      return;
    }

    for (const participant of existing.data?.real_estate_chat_room_participant ?? []) {
      const roomResult = await hasuraQuery<{
        real_estate_chat_room?: Array<{
          id: string;
          title: string | null;
          room_type: string;
          created_at: string;
          updated_at: string;
          last_message_at: string;
          is_active: boolean;
        }>;
      }>(GET_ROOM_BY_ID_QUERY, { roomId: participant.room_id });

      const room = roomResult.data?.real_estate_chat_room?.[0];
      if (!room || room.room_type !== "direct") continue;

      const user2Check = await hasuraQuery<{
        real_estate_chat_room_participant?: Array<{ id: string }>;
      }>(CHECK_USER_IN_ROOM_QUERY, {
        roomId: participant.room_id,
        userId: user2UserId,
      });

      if ((user2Check.data?.real_estate_chat_room_participant?.length ?? 0) > 0) {
        ok(res, { roomId: participant.room_id, room, isNew: false });
        return;
      }
    }

    const newRoomId = randomUUID();
    const created = await hasuraQuery<{
      insert_real_estate_chat_room_one?: {
        id: string;
        room_type: string;
        created_at: string;
        updated_at: string;
        last_message_at: string;
        is_active: boolean;
      };
    }>(CREATE_ROOM_MUTATION, { roomId: newRoomId });

    if (created.errors?.length || !created.data?.insert_real_estate_chat_room_one) {
      fail(res, "Failed to create chat room", 500);
      return;
    }

    const addUser1 = await hasuraQuery(ADD_PARTICIPANT_MUTATION, {
      roomId: newRoomId,
      userId: user1UserId,
      role: user1Role,
    });
    const addUser2 = await hasuraQuery(ADD_PARTICIPANT_MUTATION, {
      roomId: newRoomId,
      userId: user2UserId,
      role: user2Role,
    });

    if (addUser1.errors?.length || addUser2.errors?.length) {
      fail(res, "Failed to add chat participants", 500);
      return;
    }

    ok(
      res,
      {
        roomId: newRoomId,
        room: created.data.insert_real_estate_chat_room_one,
        isNew: true,
      },
      201
    );
  } catch (error) {
    console.error("[client/chat/get-or-create-room]", error);
    fail(res, "Internal server error", 500);
  }
}
