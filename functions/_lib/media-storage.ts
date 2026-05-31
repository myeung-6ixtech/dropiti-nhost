import { createHash } from "crypto";
import {
  getUploadBackend,
  isMediaUploadConfigured,
  isNhostStorageConfigured,
  isS3Configured,
} from "./env";
import { uploadFileToNhostStorage, createNhostBatchSlot, type NhostUploadResult } from "./nhost-storage";
import {
  createS3PresignedPut,
  putObjectToS3,
  type PutObjectResult,
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
  mediaId?: string;
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

/** Server-side upload (proxy path). */
export async function uploadMediaFile(input: {
  body: Buffer;
  filename: string;
  mimeType: string;
  sha256?: string;
}): Promise<MediaUploadResult> {
  assertMediaUploadConfigured();

  const sha256 =
    input.sha256?.trim() || createHash("sha256").update(input.body).digest("hex");
  const storageKey = buildHashStorageKey(sha256, input.mimeType);

  if (getUploadBackend() === "nhost") {
    const uploaded: NhostUploadResult = await uploadFileToNhostStorage({
      body: input.body,
      mimeType: input.mimeType,
      logicalPath: storageKey,
      originalFilename: input.filename,
      sha256,
    });
    return {
      storageKey: uploaded.storageKey,
      publicUrl: uploaded.publicUrl,
      fileId: uploaded.storageFileId,
      storageFileId: uploaded.storageFileId,
      etag: uploaded.etag,
      sha256: uploaded.sha256,
      deduped: uploaded.deduped,
      mediaId: uploaded.mediaId,
    };
  }

  const uploaded: PutObjectResult = await putObjectToS3({
    body: input.body,
    filename: input.filename,
    mimeType: input.mimeType,
    sha256,
  });
  return {
    storageKey: uploaded.s3Key,
    publicUrl: uploaded.publicUrl,
    fileId: uploaded.fileId,
    etag: uploaded.etag,
    sha256: uploaded.sha256,
    deduped: uploaded.deduped,
  };
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
