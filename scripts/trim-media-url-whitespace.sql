-- One-time cleanup: trim trailing/leading whitespace on media URL fields.
-- Run in Hasura SQL console or psql against the real_estate schema.
--
-- Example:
--   UPDATE real_estate.media_assets SET ...

UPDATE real_estate.media_assets
SET
  public_url = trim(public_url),
  s3_key = trim(s3_key)
WHERE
  public_url <> trim(public_url)
  OR s3_key <> trim(s3_key);
