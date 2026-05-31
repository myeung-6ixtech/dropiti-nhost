/** Image resize hints for admin console (client-side before upload). */
export const IMAGE_MAX_WIDTH = 1600;
export const IMAGE_MAX_HEIGHT = 1600;
export const IMAGE_WEBP_QUALITY = 75;

export const ALLOWED_UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
]);

export const MAX_BATCH_UPLOAD_FILES = 20;

/** Files at or below this size use same-origin proxy upload (no S3 CORS). */
export const PROXY_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** Hard cap for presigned direct PUT (browser → S3; requires bucket CORS). */
export const DIRECT_PRESIGN_MAX_BYTES = 10 * 1024 * 1024;

export function isAllowedMime(mimeType: string): boolean {
  return ALLOWED_UPLOAD_MIME.has(mimeType);
}

export function isProxyEligibleSize(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= PROXY_UPLOAD_MAX_BYTES;
}
