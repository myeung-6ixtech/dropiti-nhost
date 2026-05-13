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

Optional for function routes that use `getAdminSecret()` in `_lib/env.ts`:

- `ADMIN_SECRET` (set via Dashboard / `[[global.environment]]` in cloud; locally you can add to `.secrets` only if your Nhost CLI version loads extra keys into Functions runtime — otherwise use Dashboard for app-specific secrets.)

## Git

- The file `.secrets` at the repo root is **gitignored** — never commit it.
- This `secrets/` directory **is** committed (`README.md`, `dotsecrets.example`).

## Cloud

Production/staging secrets are set in the **Nhost Dashboard** (or GitHub integration), not from this file.
