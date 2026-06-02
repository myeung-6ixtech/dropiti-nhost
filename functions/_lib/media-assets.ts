import { hasuraQuery } from "./hasura";
import { getMediaStorageBucketName } from "./env";
import { normalizeMediaAssetFields } from "./media-normalize";

export type MediaAssetInsertInput = {
  s3Key: string;
  publicUrl: string;
  sha256: string;
  contentType: string;
  sizeBytes: number;
  etag?: string;
  width?: number;
  height?: number;
  originalFilename?: string;
};

const INSERT_MEDIA_ASSET = `
  mutation InsertMediaAsset(
    $s3_bucket: String!,
    $s3_key: String!,
    $public_url: String!,
    $sha256: String!,
    $etag: String,
    $content_type: String!,
    $size_bytes: Int!,
    $width: Int,
    $height: Int,
    $original_filename: String
  ) {
    insert_real_estate_media_assets_one(
      object: {
        s3_bucket: $s3_bucket,
        s3_key: $s3_key,
        public_url: $public_url,
        sha256: $sha256,
        etag: $etag,
        content_type: $content_type,
        size_bytes: $size_bytes,
        width: $width,
        height: $height,
        original_filename: $original_filename
      }
    ) {
      id
      public_url
      s3_key
    }
  }
`;

export async function insertMediaAsset(
  input: MediaAssetInsertInput
): Promise<{ id: string; publicUrl: string; s3Key: string } | null> {
  const normalized = normalizeMediaAssetFields({
    s3Key: input.s3Key,
    publicUrl: input.publicUrl,
    originalFilename: input.originalFilename,
    sha256: input.sha256,
  });

  const result = await hasuraQuery<{
    insert_real_estate_media_assets_one?: {
      id: string;
      public_url: string;
      s3_key: string;
    } | null;
  }>(INSERT_MEDIA_ASSET, {
    s3_bucket: getMediaStorageBucketName(),
    s3_key: normalized.s3Key,
    public_url: normalized.publicUrl,
    sha256: normalized.sha256 ?? input.sha256,
    etag: input.etag ?? null,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    width: input.width ?? null,
    height: input.height ?? null,
    original_filename: normalized.originalFilename ?? null,
  });

  if (result.errors?.length) {
    console.error("[media-assets] Hasura insert:", result.errors[0]?.message, result.errors);
    return null;
  }

  const row = result.data?.insert_real_estate_media_assets_one;
  if (!row?.id) return null;

  return {
    id: row.id,
    publicUrl: row.public_url,
    s3Key: row.s3_key,
  };
}

const UPDATE_MEDIA_ASSET = `
  mutation UpdateMediaAsset(
    $id: uuid!,
    $s3_bucket: String!,
    $s3_key: String!,
    $public_url: String!,
    $sha256: String!,
    $etag: String,
    $content_type: String!,
    $size_bytes: Int!,
    $width: Int,
    $height: Int,
    $original_filename: String
  ) {
    update_real_estate_media_assets_by_pk(
      pk_columns: { id: $id },
      _set: {
        s3_bucket: $s3_bucket,
        s3_key: $s3_key,
        public_url: $public_url,
        sha256: $sha256,
        etag: $etag,
        content_type: $content_type,
        size_bytes: $size_bytes,
        width: $width,
        height: $height,
        original_filename: $original_filename,
        updated_at: "now()"
      }
    ) {
      id
      public_url
      s3_key
    }
  }
`;

export async function updateMediaAsset(
  id: string,
  input: MediaAssetInsertInput
): Promise<{ id: string; publicUrl: string; s3Key: string } | null> {
  const normalized = normalizeMediaAssetFields({
    s3Key: input.s3Key,
    publicUrl: input.publicUrl,
    originalFilename: input.originalFilename,
    sha256: input.sha256,
  });

  const result = await hasuraQuery<{
    update_real_estate_media_assets_by_pk?: {
      id: string;
      public_url: string;
      s3_key: string;
    } | null;
  }>(UPDATE_MEDIA_ASSET, {
    id,
    s3_bucket: getMediaStorageBucketName(),
    s3_key: normalized.s3Key,
    public_url: normalized.publicUrl,
    sha256: normalized.sha256 ?? input.sha256,
    etag: input.etag ?? null,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    width: input.width ?? null,
    height: input.height ?? null,
    original_filename: normalized.originalFilename ?? null,
  });

  if (result.errors?.length) {
    console.error("[media-assets] Hasura update:", result.errors[0]?.message, result.errors);
    return null;
  }

  const row = result.data?.update_real_estate_media_assets_by_pk;
  if (!row?.id) return null;

  return {
    id: row.id,
    publicUrl: row.public_url,
    s3Key: row.s3_key,
  };
}

export type MediaCatalogInput = MediaAssetInsertInput;

/** Insert or update catalog row after storage upload succeeds. */
export async function persistMediaCatalog(
  existingMediaId: string | undefined,
  input: MediaCatalogInput
): Promise<{ id: string; publicUrl: string; s3Key: string }> {
  if (existingMediaId) {
    const updated = await updateMediaAsset(existingMediaId, input);
    if (updated) return updated;
    throw new Error("Failed to update media asset catalog");
  }

  const inserted = await insertMediaAsset(input);
  if (inserted) return inserted;
  throw new Error("Failed to insert media asset catalog");
}
