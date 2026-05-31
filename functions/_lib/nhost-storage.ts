import { createHash } from "crypto";
import {
  getDefaultAdminMediaBucket,
  getHasuraAdminSecret,
  getStorageBaseUrl,
} from "./env";
import { hasuraQuery } from "./hasura";
import { buildHashStorageKey } from "./storage-paths";

export type NhostFileMetadata = {
  id: string;
  name: string;
  size: number;
  bucketId: string;
  etag?: string;
  mimeType: string;
  isUploaded?: boolean;
};

export type NhostUploadResult = {
  storageFileId: string;
  storageKey: string;
  publicUrl: string;
  etag?: string;
  sha256: string;
  deduped: boolean;
  mediaId?: string;
};

function buildPublicFileUrl(fileId: string): string {
  const base = getStorageBaseUrl();
  if (!base) throw new Error("Nhost Storage URL is not configured");
  return `${base}/files/${fileId}`;
}

/** Parse Nhost file UUID from a stored `public_url`. */
export function parseStorageFileIdFromPublicUrl(publicUrl: string): string | null {
  const match = publicUrl.trim().match(/\/v1\/files\/([^/?#]+)/i);
  const id = match?.[1]?.trim();
  if (!id) return null;
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

const FIND_MEDIA_BY_SHA256 = `
  query FindMediaBySha256($sha256: String!) {
    real_estate_media_assets(
      where: { sha256: { _eq: $sha256 }, deleted_at: { _is_null: true } }
      limit: 1
    ) {
      id
      public_url
      s3_key
      etag
    }
  }
`;

export async function findExistingMediaBySha256(
  sha256: string
): Promise<{ publicUrl: string; storageKey: string; etag?: string; mediaId: string } | null> {
  const result = await hasuraQuery<{
    real_estate_media_assets?: Array<{
      id: string;
      public_url: string;
      s3_key: string;
      etag?: string | null;
    }>;
  }>(FIND_MEDIA_BY_SHA256, { sha256 });

  const row = result.data?.real_estate_media_assets?.[0];
  if (!row) return null;

  return {
    mediaId: row.id,
    publicUrl: row.public_url,
    storageKey: row.s3_key,
    etag: row.etag ?? undefined,
  };
}

function storageAdminHeaders(): HeadersInit {
  return {
    "x-hasura-admin-secret": getHasuraAdminSecret(),
  };
}

/**
 * Upload bytes to Nhost Storage (POST /v1/files multipart).
 * File `name` is the monolith-compatible logical path (e.g. uploads/by-hash/…).
 */
export async function uploadFileToNhostStorage(input: {
  body: Buffer;
  mimeType: string;
  logicalPath: string;
  bucketId?: string;
  originalFilename?: string;
  sha256?: string;
}): Promise<NhostUploadResult> {
  const storageBase = getStorageBaseUrl();
  if (!storageBase) {
    throw new Error("Nhost Storage is not configured (NHOST_STORAGE_URL or NHOST_SUBDOMAIN+REGION)");
  }

  const bucketId = input.bucketId ?? getDefaultAdminMediaBucket();
  const sha256 =
    input.sha256?.trim() || createHash("sha256").update(input.body).digest("hex");
  const logicalPath = input.logicalPath || buildHashStorageKey(sha256, input.mimeType);

  const existing = await findExistingMediaBySha256(sha256);
  if (existing) {
    const storageFileId =
      parseStorageFileIdFromPublicUrl(existing.publicUrl) ?? existing.storageKey;
    return {
      storageFileId,
      storageKey: existing.storageKey,
      publicUrl: existing.publicUrl,
      etag: existing.etag,
      sha256,
      deduped: true,
      mediaId: existing.mediaId,
    };
  }

  const metadata = JSON.stringify({
    name: logicalPath,
    metadata: {
      sha256,
      originalFilename: input.originalFilename ?? null,
    },
  });

  const form = new FormData();
  form.append("bucket-id", bucketId);
  form.append("metadata[]", metadata);
  const bytes = Uint8Array.from(input.body);
  form.append(
    "file[]",
    new Blob([bytes], { type: input.mimeType }),
    logicalPath.split("/").pop() ?? "upload"
  );

  const res = await fetch(`${storageBase}/files`, {
    method: "POST",
    headers: storageAdminHeaders(),
    body: form,
  });

  const text = await res.text();
  let json: { processedFiles?: NhostFileMetadata[]; error?: { message?: string } };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(`Nhost Storage upload failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = json.error?.message ?? text.slice(0, 200);
    throw new Error(`Nhost Storage upload failed (HTTP ${res.status}): ${msg}`);
  }

  const file = json.processedFiles?.[0];
  if (!file?.id) {
    throw new Error("Nhost Storage upload returned no processedFiles");
  }

  return {
    storageFileId: file.id,
    storageKey: logicalPath,
    publicUrl: buildPublicFileUrl(file.id),
    etag: file.etag,
    sha256,
    deduped: false,
  };
}

export type NhostPresignSlot = {
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
  fileId: string;
  filename: string;
  /** Client must POST multipart to admin proxy — no direct PUT slot for Nhost Storage. */
  useProxy: true;
};

/**
 * Batch slot for Nhost Storage — logical path only; upload via proxy endpoint.
 */
export function createNhostBatchSlot(input: {
  filename: string;
  mimeType: string;
  sha256: string;
}): NhostPresignSlot {
  const storageKey = buildHashStorageKey(input.sha256, input.mimeType);
  return {
    filename: input.filename,
    uploadUrl: "",
    storageKey,
    publicUrl: "",
    fileId: storageKey,
    useProxy: true,
  };
}
