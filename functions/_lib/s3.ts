import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
