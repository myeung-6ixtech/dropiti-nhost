import { createHash } from "crypto";
import {
  getDefaultAdminMediaBucket,
  getHasuraAdminSecret,
  getStorageBaseUrl,
} from "./env";
import { hasuraQuery } from "./hasura";
import { buildHashStorageKey, extensionFromMime } from "./storage-paths";

export type NhostFileMetadata = {
  id: string;
  name: string;
  size: number;
  bucketId: string;
  etag?: string;
  mimeType: string;
  isUploaded?: boolean;
};

export type NhostPostedFile = {
  storageFileId: string;
  storageKey: string;
  publicUrl: string;
  etag?: string;
  sha256: string;
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

/** True when the file id exists in Nhost Storage (admin secret). */
export async function nhostStorageFileExists(fileId: string): Promise<boolean> {
  const storageBase = getStorageBaseUrl();
  if (!storageBase) return false;

  const id = fileId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;

  const headers = storageAdminHeaders();
  const url = `${storageBase}/files/${id}`;

  try {
    const head = await fetch(url, { method: "HEAD", headers });
    if (head.ok) return true;
    if (head.status === 404) return false;
    const get = await fetch(url, { method: "GET", headers });
    return get.ok;
  } catch {
    return false;
  }
}

/**
 * Upload bytes to Nhost Storage (POST /v1/files multipart).
 * File `name` is the monolith-compatible logical path (e.g. uploads/by-hash/…).
 * Does not read or write Hasura — use {@link uploadMediaFile} for catalog sync.
 */
export async function postMultipartToNhostStorage(input: {
  body: Buffer;
  mimeType: string;
  logicalPath: string;
  bucketId?: string;
  originalFilename?: string;
  sha256?: string;
}): Promise<NhostPostedFile> {
  const storageBase = getStorageBaseUrl();
  if (!storageBase) {
    throw new Error("Nhost Storage is not configured (NHOST_STORAGE_URL or NHOST_SUBDOMAIN+REGION)");
  }

  const bucketId = input.bucketId ?? getDefaultAdminMediaBucket();
  const sha256 =
    input.sha256?.trim() || createHash("sha256").update(input.body).digest("hex");
  const logicalPath = input.logicalPath || buildHashStorageKey(sha256, input.mimeType);

  const metadata = JSON.stringify({
    name: logicalPath,
    metadata: {
      sha256,
      originalFilename: input.originalFilename ?? null,
    },
  });

  // Build a filename that carries the right extension so hasura-storage can
  // infer the MIME type from the name as a secondary signal.
  const ext = extensionFromMime(input.mimeType);
  const partFilename = input.originalFilename
    ? /\.[a-z0-9]+$/i.test(input.originalFilename)
      ? input.originalFilename
      : `${input.originalFilename}.${ext}`
    : `upload.${ext}`;

  // Construct the multipart body as raw bytes instead of using the FormData
  // API.  Node.js 18's undici-backed FormData has a known gap where Blob/File
  // `.type` is not reliably forwarded to the part's Content-Type header,
  // causing hasura-storage to store `application/octet-stream` regardless of
  // what MIME type we pass.  Writing the boundary and headers ourselves
  // guarantees `Content-Type: image/jpeg` (or webp, png, …) in the wire bytes.
  const boundary = `DropitiBoundary${createHash("sha256").update(sha256).digest("hex").slice(0, 24)}`;
  const CRLF = "\r\n";

  const preamble = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="bucket-id"`,
    ``,
    bucketId,
    `--${boundary}`,
    `Content-Disposition: form-data; name="metadata[]"`,
    ``,
    metadata,
    `--${boundary}`,
    `Content-Disposition: form-data; name="file[]"; filename="${partFilename}"`,
    `Content-Type: ${input.mimeType}`,
    ``,
    ``,
  ].join(CRLF);

  const epilogue = `${CRLF}--${boundary}--${CRLF}`;

  const rawBody = Buffer.concat([
    Buffer.from(preamble, "binary"),
    input.body,
    Buffer.from(epilogue, "binary"),
  ]);

  const res = await fetch(`${storageBase}/files`, {
    method: "POST",
    headers: {
      ...storageAdminHeaders(),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: rawBody,
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
  };
}

/** @deprecated Use postMultipartToNhostStorage — dedup is handled in media-storage. */
export const uploadFileToNhostStorage = postMultipartToNhostStorage;

const STORAGE_TRANSFORM_PARAMS = new Set(["w", "h", "f", "q", "blur"]);

export type NhostStorageDownloadResult =
  | {
      ok: true;
      body: Buffer;
      contentType?: string;
      etag?: string;
      cacheControl?: string;
    }
  | { ok: false; status: number; message: string; details?: string };

function pickTransformQuery(
  query: Record<string, unknown> | undefined
): URLSearchParams {
  const transform = new URLSearchParams();
  if (!query) return transform;
  for (const [key, value] of Object.entries(query)) {
    if (!STORAGE_TRANSFORM_PARAMS.has(key) || typeof value !== "string" || !value.trim()) {
      continue;
    }
    transform.set(key, value.trim());
  }
  return transform;
}

/** Download file bytes from Nhost Storage (server-side admin secret). */
export async function downloadNhostStorageFile(input: {
  fileId: string;
  query?: Record<string, unknown>;
  bearerToken?: string;
}): Promise<NhostStorageDownloadResult> {
  const storageBase = getStorageBaseUrl();
  if (!storageBase) {
    return { ok: false, status: 503, message: "Nhost Storage is not configured" };
  }

  const id = input.fileId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, status: 400, message: "Invalid file id" };
  }

  const transform = pickTransformQuery(input.query);
  const qs = transform.toString();
  const upstreamUrl = `${storageBase}/files/${id}${qs ? `?${qs}` : ""}`;

  const headers: Record<string, string> = {
    "x-hasura-admin-secret": getHasuraAdminSecret(),
  };
  const token = input.bearerToken?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const upstream = await fetch(upstreamUrl, { headers });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return {
      ok: false,
      status: upstream.status === 404 ? 404 : 502,
      message: `Storage download failed (HTTP ${upstream.status})`,
      details: text.slice(0, 200) || undefined,
    };
  }

  return {
    ok: true,
    body: Buffer.from(await upstream.arrayBuffer()),
    contentType: upstream.headers.get("content-type") ?? undefined,
    etag: upstream.headers.get("etag") ?? undefined,
    cacheControl: upstream.headers.get("cache-control") ?? undefined,
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
