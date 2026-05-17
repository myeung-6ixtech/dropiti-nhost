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

export function isAllowedMime(mimeType: string): boolean {
  return ALLOWED_UPLOAD_MIME.has(mimeType);
}
