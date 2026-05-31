import { createHash, randomUUID } from "crypto";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  getS3AccessKey,
  getS3BucketDomainUrl,
  getS3BucketName,
  getS3Region,
  getS3SecretKey,
  isS3Configured,
} from "./env";

export type S3PresignResult = {
  uploadUrl: string;
  s3Key: string;
  publicUrl: string;
  /** Alias for admin console compatibility */
  fileId: string;
  filename: string;
};

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: getS3Region(),
      credentials: {
        accessKeyId: getS3AccessKey(),
        secretAccessKey: getS3SecretKey(),
      },
    });
  }
  return client;
}

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  return base || "file";
}

function buildS3Key(filename: string): string {
  const safe = sanitizeFilename(filename);
  const date = new Date().toISOString().slice(0, 10);
  return `admin-uploads/${date}/${randomUUID()}-${safe}`;
}

export function buildPublicUrl(s3Key: string): string {
  const domain = getS3BucketDomainUrl().replace(/\/$/, "");
  if (domain) {
    return `${domain}/${s3Key}`;
  }
  const bucket = getS3BucketName();
  const region = getS3Region();
  return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
}

export async function createS3PresignedPut(input: {
  filename: string;
  mimeType: string;
}): Promise<S3PresignResult> {
  if (!isS3Configured()) {
    throw new Error("S3 is not configured (S3_BUCKET_* env vars missing)");
  }

  const s3Key = buildS3Key(input.filename);
  const bucket = getS3BucketName();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: input.mimeType,
  });

  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 3600 });
  const publicUrl = buildPublicUrl(s3Key);

  return {
    uploadUrl,
    s3Key,
    publicUrl,
    fileId: s3Key,
    filename: input.filename,
  };
}

function extensionFromMime(mimeType: string): string {
  const part = mimeType.split("/")[1]?.split(";")[0]?.trim();
  if (!part || part === "octet-stream") return "bin";
  return part.replace(/[^a-z0-9]/gi, "") || "bin";
}

export function buildHashS3Key(sha256: string, mimeType: string): string {
  return `uploads/by-hash/${sha256}.${extensionFromMime(mimeType)}`;
}

export async function headObjectExists(s3Key: string): Promise<boolean> {
  if (!isS3Configured()) return false;
  try {
    await getClient().send(
      new HeadObjectCommand({
        Bucket: getS3BucketName(),
        Key: s3Key,
      })
    );
    return true;
  } catch (err: unknown) {
    const error = err as {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };
    const isNotFound =
      error.name === "NotFound" ||
      error.Code === "NotFound" ||
      error.$metadata?.httpStatusCode === 404;
    if (isNotFound) return false;
    throw err;
  }
}

export type PutObjectResult = {
  s3Key: string;
  publicUrl: string;
  fileId: string;
  etag?: string;
  sha256: string;
  deduped: boolean;
};

/** Server-side PutObject (proxy upload path). Uses content-hash key for dedup. */
export async function putObjectToS3(input: {
  body: Buffer;
  filename: string;
  mimeType: string;
  sha256?: string;
}): Promise<PutObjectResult> {
  if (!isS3Configured()) {
    throw new Error("S3 is not configured (S3_BUCKET_* env vars missing)");
  }

  const sha256 =
    input.sha256?.trim() ||
    createHash("sha256").update(input.body).digest("hex");
  const s3Key = buildHashS3Key(sha256, input.mimeType);
  const publicUrl = buildPublicUrl(s3Key);
  const exists = await headObjectExists(s3Key);

  let etag: string | undefined;
  if (!exists) {
    const uploadResult = await getClient().send(
      new PutObjectCommand({
        Bucket: getS3BucketName(),
        Key: s3Key,
        Body: input.body,
        ContentType: input.mimeType,
      })
    );
    etag = uploadResult.ETag?.replace(/"/g, "");
  }

  return {
    s3Key,
    publicUrl,
    fileId: s3Key,
    etag,
    sha256,
    deduped: exists,
  };
}
