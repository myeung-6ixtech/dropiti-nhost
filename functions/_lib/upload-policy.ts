/** Image resize hints for admin console (client-side before upload). */
export const IMAGE_MAX_WIDTH = 1600;
export const IMAGE_MAX_HEIGHT = 1600;
export const IMAGE_WEBP_QUALITY = 75;

export const ALLOWED_UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "video/mp4",
]);

export const MAX_BATCH_UPLOAD_FILES = 20;

/** Proxy cap when backend is external S3/Lightsail (avoid large payloads + use presign above this). */
export const PROXY_UPLOAD_MAX_BYTES_S3 = 5 * 1024 * 1024;

/** Proxy cap when backend is Nhost Storage (no browser → S3 CORS; matches UI 10 MB max). */
export const PROXY_UPLOAD_MAX_BYTES_NHOST = 10 * 1024 * 1024;

/** @deprecated Use getProxyUploadMaxBytes() from media-storage.ts */
export const PROXY_UPLOAD_MAX_BYTES = PROXY_UPLOAD_MAX_BYTES_S3;

/** Hard cap for presigned direct PUT (browser → S3; requires bucket CORS). */
export const DIRECT_PRESIGN_MAX_BYTES = 10 * 1024 * 1024;

export function isAllowedMime(mimeType: string): boolean {
  return ALLOWED_UPLOAD_MIME.has(mimeType);
}

export function isProxyEligibleSize(sizeBytes: number, maxBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= maxBytes;
}
