/** Trim media URL fields before Hasura insert / API responses. */

export function normalizeMediaUrl(url: string): string {
  return url.trim();
}

export function normalizeMediaAssetFields(input: {
  s3Key: string;
  publicUrl: string;
  originalFilename?: string;
  sha256?: string;
}): {
  s3Key: string;
  publicUrl: string;
  originalFilename?: string;
  sha256?: string;
} {
  return {
    ...input,
    s3Key: input.s3Key.trim(),
    publicUrl: normalizeMediaUrl(input.publicUrl),
    originalFilename: input.originalFilename?.trim() || undefined,
    sha256: input.sha256?.trim() || undefined,
  };
}

export function normalizeMediaRow<T extends { public_url?: unknown; s3_key?: unknown }>(
  row: T
): T {
  const out = { ...row };
  if (typeof out.public_url === "string") {
    out.public_url = normalizeMediaUrl(out.public_url) as T["public_url"];
  }
  if (typeof out.s3_key === "string") {
    out.s3_key = out.s3_key.trim() as T["s3_key"];
  }
  return out;
}
