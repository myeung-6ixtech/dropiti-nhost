/** URL classification for media upload / dedup (Functions runtime). */

const NHOST_STORAGE_URL_RE = /\.storage\.[^/]+\.nhost\.run\/v1\/files\//i;

const S3_PUBLIC_URL_RE =
  /(?:https?:\/\/)?(?:[^/]+\.)?(?:s3[.-][^/]+\.amazonaws\.com|[^/]+\.s3[^/]*\.amazonaws\.com)\//i;

export function normalizeMediaUrl(url: string): string {
  return url.trim();
}

export function isNhostStoragePublicUrl(url: string): boolean {
  return NHOST_STORAGE_URL_RE.test(normalizeMediaUrl(url));
}

/** Legacy S3 / Lightsail public object URLs. */
export function isLegacyS3MediaUrl(url: string): boolean {
  const normalized = normalizeMediaUrl(url);
  if (S3_PUBLIC_URL_RE.test(normalized)) return true;
  const domain = process.env.S3_BUCKET_DOMAIN_URL?.trim().replace(/\/$/, "");
  if (domain && normalized.startsWith(`${domain}/`)) return true;
  return false;
}
