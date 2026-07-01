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
- `MAILGUN_SMTP_PASSWORD` (Mailgun SMTP; referenced from `[provider.smtp]` in `nhost/nhost.toml` for auth emails)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google OAuth; referenced from `[auth.method.oauth.google]` in `nhost/nhost.toml`)
- `MEDIA_STORAGE_BUCKET` (default `dropiti-bucket` — create in Dashboard → Storage, public read for images; must **not** use a `NHOST_` prefix in `[[global.environment]]`)
- `S3_BUCKET_*` (optional fallback when `MEDIA_STORAGE_BACKEND=s3`)

Nhost Storage is **preferred** when Functions have `NHOST_SUBDOMAIN` + `NHOST_REGION` (auto storage URL). Wire `MEDIA_STORAGE_BUCKET` in `nhost/nhost.toml` (`[[global.environment]]`).

### Storage bucket permissions (`dropiti-bucket`)

Admin uploads use the Hasura admin secret (server-side). Thumbnails in the admin console use an authenticated proxy — no bucket change required for **admin preview**.

For **dropiti-v3** and other clients that load `public_url` directly in `<img>` (no auth header), enable **Download** for the `public` role on `dropiti-bucket` in **Dashboard → Storage → Permissions** (custom check: `bucket_id` equals `dropiti-bucket`).

S3 keys remain in `nhost.toml` for fallback only. **Bucket CORS** is required only for the S3 presign path — see `infrastructure/lightsail-bucket-cors.json`.

Optional for function routes that use `getAdminSecret()` in `_lib/env.ts`:

- `ADMIN_SECRET` (set via Dashboard / `[[global.environment]]` in cloud; locally you can add to `.secrets` only if your Nhost CLI version loads extra keys into Functions runtime — otherwise use Dashboard for app-specific secrets.)

## Git

- The file `.secrets` at the repo root is **gitignored** — never commit it.
- This `secrets/` directory **is** committed (`README.md`, `dotsecrets.example`).

## Cloud

Production/staging secrets are set in the **Nhost Dashboard** (or GitHub integration), not from this file.

**Config deploy will fail** with `variable not found: secrets.MAILGUN_SMTP_PASSWORD` until that secret exists in the cloud project. Add it **before** pushing `nhost.toml` that references `[provider.smtp]`.

### Add `MAILGUN_SMTP_PASSWORD` (required for Mailgun SMTP)

**Option A — Nhost Dashboard**

1. Open your Dropiti project (`fcuycyemqprjrkbshlcj`) in [Nhost Dashboard](https://app.nhost.io).
2. Go to **Settings → Secrets** (or **Configuration → Secrets**).
3. Create a secret:
   - **Name:** `MAILGUN_SMTP_PASSWORD` (must match `nhost.toml` exactly)
   - **Value:** Mailgun SMTP password (from Mailgun → Sending → Domain → SMTP credentials)
4. Re-run your config deploy / Git push.

**Option B — Nhost CLI** (after `nhost link` to the Dropiti project)

```bash
cd dropiti-nhost
nhost secrets create MAILGUN_SMTP_PASSWORD 'your-mailgun-smtp-password' --subdomain fcuycyemqprjrkbshlcj
```

Verify:

```bash
nhost secrets list --subdomain fcuycyemqprjrkbshlcj
```

### Troubleshooting: `variable not found: secrets.*`

| Error | Fix |
|-------|-----|
| `secrets.MAILGUN_SMTP_PASSWORD` | Add secret in Dashboard or via `nhost secrets create` (see above) |
| `secrets.GOOGLE_CLIENT_ID` / `secrets.GOOGLE_CLIENT_SECRET` | Google Cloud OAuth Web client — callback URI must be `https://<subdomain>.auth.<region>.nhost.run/v1/signin/provider/google/callback` |
| Other `secrets.*` | Same pattern — name must match `{{ secrets.NAME }}` in `nhost/nhost.toml` |

Local `.secrets` only applies to **local CLI** (`nhost up`); **cloud** `replaceConfig` always reads Dashboard secrets.
