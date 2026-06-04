import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { decryptContentSafe } from "../../_lib/chat-encryption";
import { ok, fail } from "../../_lib/respond";

const GET_USER_CHAT_ROOMS_QUERY = `
  query GetUserChatRooms($userUserId: String!) {
    real_estate_chat_room_participant(
      where: { user_id: { _eq: $userUserId } }
      order_by: { joined_at: desc }
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

const GET_ROOM_DETAILS_QUERY = `
  query GetRoomDetails($roomIds: [uuid!]!) {
    real_estate_chat_room(
      where: { id: { _in: $roomIds } }
      order_by: { last_message_at: desc }
    ) {
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

const GET_OTHER_PARTICIPANTS_QUERY = `
  query GetOtherParticipants($roomIds: [uuid!]!, $currentUserId: String!) {
    real_estate_chat_room_participant(
      where: {
        room_id: { _in: $roomIds }
        user_id: { _neq: $currentUserId }
      }
    ) {
      room_id
      user_id
      role
    }
  }
`;

const GET_USER_DETAILS_QUERY = `
  query GetUserDetails($nhostUserIds: [uuid!]!) {
    real_estate_user(
      where: { nhost_user_id: { _in: $nhostUserIds } }
    ) {
      nhost_user_id
      display_name
      photo_url
      email
    }
  }
`;

const GET_LAST_MESSAGES_QUERY = `
  query GetLastMessages($roomIds: [uuid!]!) {
    real_estate_chat_message(
      where: { room_id: { _in: $roomIds } }
      order_by: { created_at: desc }
    ) {
      room_id
      content
      sender_user_id
      created_at
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

    const participantResult = await hasuraQuery<{
      real_estate_chat_room_participant?: Array<{
        id: string;
        room_id: string;
        user_id: string;
        role: string;
        joined_at: string;
        last_read_at: string | null;
        is_active: boolean;
      }>;
    }>(GET_USER_CHAT_ROOMS_QUERY, { userUserId: userId });

    if (participantResult.errors?.length) {
      console.error("[client/chat/get-chat-rooms]", participantResult.errors);
      fail(res, "Failed to fetch chat rooms", 500);
      return;
    }

    const participants = participantResult.data?.real_estate_chat_room_participant ?? [];
    if (participants.length === 0) {
      ok(res, []);
      return;
    }

    const roomIds = participants.map((p) => p.room_id);

    const [roomResult, otherParticipantsResult, messagesResult] = await Promise.all([
      hasuraQuery<{
        real_estate_chat_room?: Array<{
          id: string;
          title: string | null;
          room_type: string;
          created_at: string;
          updated_at: string;
          last_message_at: string;
          is_active: boolean;
        }>;
      }>(GET_ROOM_DETAILS_QUERY, { roomIds }),
      hasuraQuery<{
        real_estate_chat_room_participant?: Array<{
          room_id: string;
          user_id: string;
          role: string;
        }>;
      }>(GET_OTHER_PARTICIPANTS_QUERY, { roomIds, currentUserId: userId }),
      hasuraQuery<{
        real_estate_chat_message?: Array<{
          room_id: string;
          content: string;
          sender_user_id: string;
          created_at: string;
        }>;
      }>(GET_LAST_MESSAGES_QUERY, { roomIds }),
    ]);

    if (
      roomResult.errors?.length ||
      otherParticipantsResult.errors?.length ||
      messagesResult.errors?.length
    ) {
      console.error("[client/chat/get-chat-rooms]", {
        room: roomResult.errors,
        other: otherParticipantsResult.errors,
        messages: messagesResult.errors,
      });
      fail(res, "Failed to fetch chat rooms", 500);
      return;
    }

    const rooms = roomResult.data?.real_estate_chat_room ?? [];
    const otherParticipants =
      otherParticipantsResult.data?.real_estate_chat_room_participant ?? [];
    const messages = messagesResult.data?.real_estate_chat_message ?? [];

    const otherUserIds = [...new Set(otherParticipants.map((p) => p.user_id))];
    let userDetails: Array<{
      nhost_user_id: string;
      display_name: string | null;
      photo_url: string | null;
      email: string | null;
    }> = [];

    if (otherUserIds.length > 0) {
      const userDetailsResult = await hasuraQuery<{
        real_estate_user?: typeof userDetails;
      }>(GET_USER_DETAILS_QUERY, { nhostUserIds: otherUserIds });

      if (userDetailsResult.errors?.length) {
        console.error("[client/chat/get-chat-rooms] user details", userDetailsResult.errors);
      } else {
        userDetails = userDetailsResult.data?.real_estate_user ?? [];
      }
    }

    const lastMessageByRoom = new Map<string, (typeof messages)[0]>();
    for (const message of messages) {
      if (!lastMessageByRoom.has(message.room_id)) {
        lastMessageByRoom.set(message.room_id, message);
      }
    }

    const combinedData = participants.map((participant) => {
      const room = rooms.find((r) => r.id === participant.room_id) ?? null;
      const rawLastMessage = lastMessageByRoom.get(participant.room_id);
      const otherParticipant =
        otherParticipants.find((p) => p.room_id === participant.room_id) ?? null;
      const otherUserDetails = otherParticipant
        ? userDetails.find((u) => u.nhost_user_id === otherParticipant.user_id) ?? null
        : null;

      const last_message = rawLastMessage
        ? {
            ...rawLastMessage,
            content: decryptContentSafe(rawLastMessage.content),
          }
        : null;

      return {
        ...participant,
        room,
        last_message,
        other_participant: otherParticipant
          ? { ...otherParticipant, user_details: otherUserDetails }
          : null,
      };
    });

    ok(res, combinedData);
  } catch (error) {
    console.error("[client/chat/get-chat-rooms]", error);
    fail(res, "Internal server error", 500);
  }
}
