import { randomUUID } from "crypto";
import { getDefaultAdminMediaBucket, getHasuraAdminSecret, getStorageBaseUrl } from "./env";

export interface PresignResult {
  uploadUrl: string;
  fileId: string;
  filename: string;
}

/**
 * Create a presigned upload slot via Nhost Storage REST API.
 * Falls back to a deterministic upload URL pattern when Storage API is unavailable.
 */
export async function createPresignedUpload(input: {
  filename: string;
  mimeType: string;
  bucketId?: string;
}): Promise<PresignResult> {
  const bucketId = input.bucketId ?? getDefaultAdminMediaBucket();
  const fileId = randomUUID();
  const storageBase = getStorageBaseUrl();

  if (!storageBase) {
    return {
      fileId,
      filename: input.filename,
      uploadUrl: `storage://unconfigured/${bucketId}/${fileId}`,
    };
  }

  try {
    const res = await fetch(`${storageBase}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getHasuraAdminSecret()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: fileId,
        name: input.filename,
        bucketId,
        mimeType: input.mimeType,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { id?: string; presignedUrl?: string };
      const id = data.id ?? fileId;
      const uploadUrl =
        data.presignedUrl ?? `${storageBase}/files/${id}`;
      return { fileId: id, filename: input.filename, uploadUrl };
    }
  } catch (err) {
    console.warn("[nhost-storage] presign API failed, using fallback URL", err);
  }

  return {
    fileId,
    filename: input.filename,
    uploadUrl: `${storageBase}/files/${fileId}`,
  };
}
