import { getDropitiPlatformLandlordUserIds } from "./env";

/**
 * Platform landlord recipient IDs for admin incoming-offers queries.
 * Mirrors dropiti-admin-console-2 `getAdminIncomingRecipientIds`.
 */
export function getAdminIncomingRecipientIds(loggedInAdminUserId: string): string[] {
  const fromEnv = getDropitiPlatformLandlordUserIds();
  return [...new Set([...fromEnv, loggedInAdminUserId])];
}
