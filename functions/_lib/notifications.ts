import { hasuraQuery } from "./hasura";

export interface NotificationFilters {
  isRead?: boolean;
  limit?: number;
  offset?: number;
}

const GET_NOTIFICATIONS = `
  query GetUserNotifications(
    $where: real_estate_notification_bool_exp!
    $limit: Int!
    $offset: Int!
  ) {
    real_estate_notification(
      where: $where
      order_by: { created_at: desc }
      limit: $limit
      offset: $offset
    ) {
      id
      type_id
      recipient_user_id
      sender_user_id
      title
      message
      data
      is_read
      is_archived
      priority
      expires_at
      created_at
      read_at
      archived_at
    }
  }
`;

const MARK_READ = `
  mutation MarkNotificationRead($id: uuid!) {
    update_real_estate_notification_by_pk(
      pk_columns: { id: $id }
      _set: { is_read: true, read_at: "now()" }
    ) {
      id
    }
  }
`;

const MARK_ALL_READ = `
  mutation MarkAllNotificationsRead($userId: String!) {
    update_real_estate_notification(
      where: {
        recipient_user_id: { _eq: $userId }
        is_read: { _eq: false }
        is_archived: { _eq: false }
      }
      _set: { is_read: true, read_at: "now()" }
    ) {
      affected_rows
    }
  }
`;

const ARCHIVE = `
  mutation ArchiveNotification($id: uuid!) {
    update_real_estate_notification_by_pk(
      pk_columns: { id: $id }
      _set: { is_archived: true, archived_at: "now()" }
    ) {
      id
    }
  }
`;

const UNREAD_COUNT = `
  query UnreadNotificationCount($userId: String!) {
    real_estate_notification_aggregate(
      where: {
        recipient_user_id: { _eq: $userId }
        is_read: { _eq: false }
        is_archived: { _eq: false }
      }
    ) {
      aggregate {
        count
      }
    }
  }
`;

const GET_NOTIFICATION_TYPE = `
  query GetNotificationType($typeKey: String!) {
    real_estate_notification_type(
      where: { type_key: { _eq: $typeKey }, is_active: { _eq: true } }
      limit: 1
    ) {
      id
      type_key
      name
      template
    }
  }
`;

const CREATE_NOTIFICATION = `
  mutation CreateNotification($notification: real_estate_notification_insert_input!) {
    insert_real_estate_notification_one(object: $notification) {
      id
    }
  }
`;

export interface CreateNotificationInput {
  typeKey: string;
  recipientUserId: string;
  senderUserId?: string;
  data?: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "urgent";
}

function renderTemplate(template: string, data: Record<string, unknown>): string {
  let message = template;
  for (const [key, value] of Object.entries(data)) {
    message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value ?? ""));
  }
  return message;
}

export async function createNotification(input: CreateNotificationInput): Promise<string | null> {
  const typeResult = await hasuraQuery<{
    real_estate_notification_type?: Array<{ id: number; name: string; template: string }>;
  }>(GET_NOTIFICATION_TYPE, { typeKey: input.typeKey });

  const typeRow = typeResult.data?.real_estate_notification_type?.[0];
  if (!typeRow) {
    console.warn(`[notifications] type not found: ${input.typeKey}`);
    return null;
  }

  const data = input.data ?? {};
  const title = renderTemplate(typeRow.name, data);
  const message = renderTemplate(typeRow.template, data);

  const result = await hasuraQuery<{ insert_real_estate_notification_one?: { id: string } }>(
    CREATE_NOTIFICATION,
    {
      notification: {
        type_id: typeRow.id,
        recipient_user_id: input.recipientUserId,
        sender_user_id: input.senderUserId ?? null,
        title,
        message,
        data,
        priority: input.priority ?? "normal",
        is_read: false,
        is_archived: false,
      },
    }
  );

  if (result.errors?.length) {
    console.error("[notifications] create failed:", result.errors[0]?.message);
    return null;
  }

  return result.data?.insert_real_estate_notification_one?.id ?? null;
}

export async function getUserNotifications(userId: string, filters: NotificationFilters) {
  const where: Record<string, unknown> = {
    recipient_user_id: { _eq: userId },
    is_archived: { _eq: false },
  };
  if (filters.isRead !== undefined) {
    where.is_read = { _eq: filters.isRead };
  }

  const result = await hasuraQuery<{
    real_estate_notification?: unknown[];
  }>(GET_NOTIFICATIONS, {
    where,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
  });

  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to fetch notifications");
  }

  return result.data?.real_estate_notification ?? [];
}

export async function markNotificationRead(notificationId: string) {
  const result = await hasuraQuery<{ update_real_estate_notification_by_pk?: { id: string } }>(
    MARK_READ,
    { id: notificationId }
  );
  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to mark read");
  }
  return result.data?.update_real_estate_notification_by_pk;
}

export async function markAllNotificationsRead(userId: string) {
  const result = await hasuraQuery<{
    update_real_estate_notification?: { affected_rows: number };
  }>(MARK_ALL_READ, { userId });
  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to mark all read");
  }
  return result.data?.update_real_estate_notification?.affected_rows ?? 0;
}

export async function archiveNotification(notificationId: string) {
  const result = await hasuraQuery<{ update_real_estate_notification_by_pk?: { id: string } }>(
    ARCHIVE,
    { id: notificationId }
  );
  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to archive");
  }
  return result.data?.update_real_estate_notification_by_pk;
}

export async function getUnreadCount(userId: string) {
  const result = await hasuraQuery<{
    real_estate_notification_aggregate?: { aggregate?: { count?: number } };
  }>(UNREAD_COUNT, { userId });
  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "Failed to count notifications");
  }
  return result.data?.real_estate_notification_aggregate?.aggregate?.count ?? 0;
}
