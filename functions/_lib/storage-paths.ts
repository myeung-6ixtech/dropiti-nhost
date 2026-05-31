/**
 * Monolith-compatible object paths (logical keys).
 * Used for Hasura `s3_key`, Nhost Storage file `name`, and S3 object keys.
 */

export function extensionFromMime(mimeType: string): string {
  const part = mimeType.split("/")[1]?.split(";")[0]?.trim();
  if (!part || part === "octet-stream") return "bin";
  return part.replace(/[^a-z0-9]/gi, "") || "bin";
}

/** Content-addressable path — matches dropiti-backend POST /upload/image. */
export function buildHashStorageKey(sha256: string, mimeType: string): string {
  return `uploads/by-hash/${sha256}.${extensionFromMime(mimeType)}`;
}
