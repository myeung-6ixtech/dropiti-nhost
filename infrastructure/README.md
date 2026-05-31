# Lightsail / S3 bucket CORS (admin media upload)

Admin media upload uses **presigned PUT**: Nhost Functions sign the URL with `S3_BUCKET_ACCESS_KEY` / `S3_BUCKET_SECRET_KEY`, then the **browser** uploads directly to the bucket. Those credentials run **only on the server**; they do **not** bypass browser CORS.

| Step | Who | Needs |
|------|-----|--------|
| Presign | Nhost Functions | `S3_BUCKET_*` secrets (Nhost Dashboard + `nhost.toml`) |
| CSP `connect-src` | Admin Next.js app | `next.config.ts` (S3 host allowlist) |
| CORS on bucket | **AWS Lightsail bucket** | This file, applied via CLI below |

Without bucket CORS, the browser blocks the cross-origin `PUT` from `http://localhost:3000` to `*.s3.*.amazonaws.com` even when the presigned URL is valid.

## Apply (Lightsail object storage)

1. Edit `lightsail-bucket-cors.json` — add your **production admin origin** to `AllowedOrigins` before deploying admin to production.

2. Apply to your Lightsail bucket (name must match `S3_BUCKET_NAME`, e.g. `tastyplates-bucket`):

```bash
aws lightsail update-bucket \
  --bucket-name tastyplates-bucket \
  --cors file://infrastructure/lightsail-bucket-cors.json
```

Run from the `dropiti-nhost` repo root, or pass the full path to the JSON file.

3. Verify:

```bash
aws lightsail get-buckets --bucket-name tastyplates-bucket --include-cors
```

## If the CLI rejects `CORSRules` format

Some CLI versions expect Lightsail’s `rules` shape. Use:

```json
{
  "rules": [
    {
      "allowedOrigins": ["http://localhost:3000", "http://127.0.0.1:3000"],
      "allowedMethods": ["GET", "PUT", "HEAD"],
      "allowedHeaders": ["*"],
      "exposeHeaders": ["ETag"],
      "maxAgeSeconds": 3000
    }
  ]
}
```

## Standard AWS S3 (non-Lightsail)

If the bucket is in **S3** (not Lightsail), use:

```bash
aws s3api put-bucket-cors \
  --bucket tastyplates-bucket \
  --cors-configuration file://infrastructure/lightsail-bucket-cors.json
```

(Same `CORSRules` JSON shape.)

## References

- [Lightsail: Configure CORS](https://docs.aws.amazon.com/lightsail/latest/userguide/configure-cors.html)
- [Lightsail: CORS via CLI](https://docs.aws.amazon.com/lightsail/latest/userguide/cors-configuration-cli.html)
- Admin upload flow: `dropiti-admin-console-2/src/lib/admin-api.ts` (`adminUploadImages`)
