import { createHash } from "crypto";
import {
  getUploadBackend,
  isMediaUploadConfigured,
  isNhostStorageConfigured,
  isS3Configured,
  type UploadBackend,
} from "./env";
import {
  findExistingMediaBySha256,
  nhostStorageFileExists,
  parseStorageFileIdFromPublicUrl,
  postMultipartToNhostStorage,
  createNhostBatchSlot,
} from "./nhost-storage";
import { isLegacyS3MediaUrl, isNhostStoragePublicUrl } from "./media-url";
import { persistMediaCatalog, type MediaCatalogInput } from "./media-assets";
import {
  createS3PresignedPut,
  putObjectToS3,
  type S3PresignResult,
} from "./s3";
import { buildHashStorageKey } from "./storage-paths";
import {
  PROXY_UPLOAD_MAX_BYTES_NHOST,
  PROXY_UPLOAD_MAX_BYTES_S3,
} from "./upload-policy";

export type MediaUploadResult = {
  storageKey: string;
  publicUrl: string;
  fileId: string;
  storageFileId?: string;
  etag?: string;
  sha256: string;
  deduped: boolean;
  repaired: boolean;
  migrated: boolean;
  mediaId: string;
  storageBackend: UploadBackend;
};

export type BatchUploadSlot = {
  filename: string;
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
  fileId: string;
  useProxy?: boolean;
};

export function getProxyUploadMaxBytes(): number {
  return getUploadBackend() === "nhost"
    ? PROXY_UPLOAD_MAX_BYTES_NHOST
    : PROXY_UPLOAD_MAX_BYTES_S3;
}

export function assertMediaUploadConfigured(): void {
  if (!isMediaUploadConfigured()) {
    throw new Error(
      "Media upload is not configured. Set Nhost Storage (NHOST_SUBDOMAIN+REGION) or S3_BUCKET_* secrets."
    );
  }
}

function catalogInput(
  input: {
    storageKey: string;
    publicUrl: string;
    sha256: string;
    mimeType: string;
    sizeBytes: number;
    etag?: string;
    width?: number;
    height?: number;
    filename: string;
  }
): MediaCatalogInput {
  return {
    s3Key: input.storageKey,
    publicUrl: input.publicUrl,
    sha256: input.sha256,
    contentType: input.mimeType,
    sizeBytes: input.sizeBytes,
    etag: input.etag,
    width: input.width,
    height: input.height,
    originalFilename: input.filename,
  };
}

async function uploadMediaFileNhost(input: {
  body: Buffer;
  filename: string;
  mimeType: string;
  sha256?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}): Promise<MediaUploadResult> {
  const sha256 =
    input.sha256?.trim() || createHash("sha256").update(input.body).digest("hex");
  const storageKey = buildHashStorageKey(sha256, input.mimeType);
  const existing = await findExistingMediaBySha256(sha256);
  const backend = getUploadBackend();

  if (existing) {
    const existingFileId = parseStorageFileIdFromPublicUrl(existing.publicUrl);

    if (existingFileId && isNhostStoragePublicUrl(existing.publicUrl)) {
      const exists = await nhostStorageFileExists(existingFileId);
      if (exists) {
        return {
          storageKey: existing.storageKey,
          publicUrl: existing.publicUrl,
          fileId: existingFileId,
          storageFileId: existingFileId,
          etag: existing.etag,
          sha256,
          deduped: true,
          repaired: false,
          migrated: false,
          mediaId: existing.mediaId,
          storageBackend: backend,
        };
      }
    }

    const wasLegacyS3 = isLegacyS3MediaUrl(existing.publicUrl);
    const posted = await postMultipartToNhostStorage({
      body: input.body,
      mimeType: input.mimeType,
      logicalPath: storageKey,
      originalFilename: input.filename,
      sha256,
    });

    const catalog = await persistMediaCatalog(
      existing.mediaId,
      catalogInput({
        storageKey: posted.storageKey,
        publicUrl: posted.publicUrl,
        sha256,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        etag: posted.etag,
        width: input.width,
        height: input.height,
        filename: input.filename,
      })
    );

    const repaired = !wasLegacyS3;
    const migrated = wasLegacyS3;

    return {
      storageKey: catalog.s3Key,
      publicUrl: catalog.publicUrl,
      fileId: posted.storageFileId,
      storageFileId: posted.storageFileId,
      etag: posted.etag,
      sha256,
      deduped: false,
      repaired,
      migrated,
      mediaId: catalog.id,
      storageBackend: backend,
    };
  }

  const posted = await postMultipartToNhostStorage({
    body: input.body,
    mimeType: input.mimeType,
    logicalPath: storageKey,
    originalFilename: input.filename,
    sha256,
  });

  const catalog = await persistMediaCatalog(
    undefined,
    catalogInput({
      storageKey: posted.storageKey,
      publicUrl: posted.publicUrl,
      sha256,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      etag: posted.etag,
      width: input.width,
      height: input.height,
      filename: input.filename,
    })
  );

  return {
    storageKey: catalog.s3Key,
    publicUrl: catalog.publicUrl,
    fileId: posted.storageFileId,
    storageFileId: posted.storageFileId,
    etag: posted.etag,
    sha256,
    deduped: false,
    repaired: false,
    migrated: false,
    mediaId: catalog.id,
    storageBackend: backend,
  };
}

async function uploadMediaFileS3(input: {
  body: Buffer;
  filename: string;
  mimeType: string;
  sha256?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}): Promise<MediaUploadResult> {
  const sha256 =
    input.sha256?.trim() || createHash("sha256").update(input.body).digest("hex");
  const existing = await findExistingMediaBySha256(sha256);
  const backend = getUploadBackend();

  const uploaded = await putObjectToS3({
    body: input.body,
    filename: input.filename,
    mimeType: input.mimeType,
    sha256,
  });

  if (uploaded.deduped && existing) {
    return {
      storageKey: existing.storageKey,
      publicUrl: existing.publicUrl,
      fileId: uploaded.fileId,
      etag: existing.etag ?? uploaded.etag,
      sha256,
      deduped: true,
      repaired: false,
      migrated: false,
      mediaId: existing.mediaId,
      storageBackend: backend,
    };
  }

  const catalog = await persistMediaCatalog(
    existing?.mediaId,
    catalogInput({
      storageKey: uploaded.s3Key,
      publicUrl: uploaded.publicUrl,
      sha256,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      etag: uploaded.etag,
      width: input.width,
      height: input.height,
      filename: input.filename,
    })
  );

  return {
    storageKey: catalog.s3Key,
    publicUrl: catalog.publicUrl,
    fileId: uploaded.fileId,
    etag: uploaded.etag,
    sha256,
    deduped: uploaded.deduped && Boolean(existing),
    repaired: false,
    migrated: false,
    mediaId: catalog.id,
    storageBackend: backend,
  };
}

/** Server-side upload (proxy path) with Storage + Hasura catalog sync. */
export async function uploadMediaFile(input: {
  body: Buffer;
  filename: string;
  mimeType: string;
  sha256?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}): Promise<MediaUploadResult> {
  assertMediaUploadConfigured();

  if (getUploadBackend() === "nhost") {
    return uploadMediaFileNhost(input);
  }

  return uploadMediaFileS3(input);
}

/** Presign / batch slot for client-side PUT (S3) or proxy hint (Nhost). */
export async function createBatchUploadSlot(input: {
  filename: string;
  mimeType: string;
  sha256?: string;
}): Promise<BatchUploadSlot> {
  assertMediaUploadConfigured();

  const sha256 = input.sha256?.trim();
  if (!sha256) {
    throw new Error("sha256 is required for batch upload slots (monolith-compatible hash paths)");
  }

  if (getUploadBackend() === "nhost") {
    const slot = createNhostBatchSlot({
      filename: input.filename,
      mimeType: input.mimeType,
      sha256,
    });
    return { ...slot, useProxy: true };
  }

  const presigned: S3PresignResult = await createS3PresignedPut({
    filename: input.filename,
    mimeType: input.mimeType,
    sha256,
  });
  return {
    filename: presigned.filename,
    uploadUrl: presigned.uploadUrl,
    storageKey: presigned.s3Key,
    publicUrl: presigned.publicUrl,
    fileId: presigned.fileId,
  };
}

export {
  isNhostStorageConfigured,
  isS3Configured,
  getUploadBackend,
  isMediaUploadConfigured,
};
