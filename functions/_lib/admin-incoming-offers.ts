/**
 * Platform landlord recipient IDs for admin incoming-offers queries.
 * Mirrors dropiti-admin-console-2 `getAdminIncomingRecipientIds`.
 */
export function getAdminIncomingRecipientIds(loggedInAdminUserId: string): string[] {
  const fromEnv = (process.env.DROPITI_PLATFORM_LANDLORD_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...fromEnv, loggedInAdminUserId])];
}
