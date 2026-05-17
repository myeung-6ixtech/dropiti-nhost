import type { Request } from "express";
import { getUserId, type VerifiedJwtPayload } from "./auth";
import { hasuraQuery } from "./hasura";

const INSERT_AUDIT_LOG = `
  mutation InsertAdminAuditLog($object: real_estate_admin_audit_logs_insert_input!) {
    insert_real_estate_admin_audit_logs_one(object: $object) {
      id
    }
  }
`;

export async function logAdminAction(
  payload: VerifiedJwtPayload,
  action: string,
  resourceType?: string,
  resourceId?: string,
  details?: Record<string, unknown>,
  req?: Request
): Promise<void> {
  const adminId = getUserId(payload);
  if (!adminId) return;

  const ip =
    (typeof req?.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
      : undefined) ?? req?.socket?.remoteAddress;

  const userAgent =
    typeof req?.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;

  try {
    await hasuraQuery(INSERT_AUDIT_LOG, {
      object: {
        admin_id: adminId,
        action,
        resource_type: resourceType ?? null,
        resource_id: resourceId ?? null,
        details: details ?? null,
        ip_address: ip ?? null,
        user_agent: userAgent ?? null,
        success: true,
      },
    });
  } catch (err) {
    console.error("[audit] failed to log admin action", action, err);
  }
}
