# Local secrets for Nhost CLI

The Nhost CLI expects a single **file** at the **repository root** named `.secrets` (sibling to `nhost/` and `functions/`). You **cannot** use a directory called `.secrets` for that purpose on the same path as the file, so this **`secrets/`** folder only holds **committed templates** and documentation.

## One-time setup

From the `dropiti-nhost` repository root:

```bash
cp secrets/dotsecrets.example .secrets
# Edit .secrets — replace placeholders with values from your Nhost project (Dashboard → Settings → Secrets, or local Hasura).
```

The keys in `dotsecrets.example` match `nhost/nhost.toml` interpolations:

- `HASURA_GRAPHQL_ADMIN_SECRET`
- `HASURA_GRAPHQL_JWT_SECRET`
- `GRAFANA_ADMIN_PASSWORD` (managed Grafana; referenced from `[observability.grafana]` in `nhost/nhost.toml` for cloud deploys)
- `S3_BUCKET_ACCESS_KEY`, `S3_BUCKET_SECRET_KEY`, `S3_BUCKET_NAME` (required for admin media upload)
- `S3_BUCKET_AWS_REGION`, `S3_BUCKET_DOMAIN_URL` (optional; region defaults to `ap-northeast-2` in code if empty)

S3 keys are exposed to **Functions** via `[[global.environment]]` in `nhost/nhost.toml` (`value = '{{ secrets.S3_BUCKET_* }}'`). Dashboard secrets alone are not enough until that mapping exists and functions are redeployed.

**Browser upload CORS:** presigned URLs still require **bucket CORS** on Lightsail/S3 (not Nhost). See `infrastructure/lightsail-bucket-cors.json` and `infrastructure/README.md`.

Optional for function routes that use `getAdminSecret()` in `_lib/env.ts`:

- `ADMIN_SECRET` (set via Dashboard / `[[global.environment]]` in cloud; locally you can add to `.secrets` only if your Nhost CLI version loads extra keys into Functions runtime — otherwise use Dashboard for app-specific secrets.)

## Git

- The file `.secrets` at the repo root is **gitignored** — never commit it.
- This `secrets/` directory **is** committed (`README.md`, `dotsecrets.example`).

## Cloud

Production/staging secrets are set in the **Nhost Dashboard** (or GitHub integration), not from this file.
