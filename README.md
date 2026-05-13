# Dropiti Nhost (`dropiti-nhost`)

Backend-as-config for [Nhost](https://nhost.io): Hasura auth config, email templates, and **Nhost Functions** (TypeScript on Node 22).

## Documentation

| Doc | Purpose |
|-----|---------|
| [documentation/boilerplate.md](./documentation/boilerplate.md) | Pointers + deployment checklist |
| [documentation/AI_Rules.md](./documentation/AI_Rules.md) | Non‑negotiable rules for `functions/*` |
| [documentation/api-guide.md](./documentation/api-guide.md) | HTTP routes, auth, local testing |

## Local development

1. **Secrets** — Nhost CLI reads a file **`.secrets`** at this repo root (see [secrets/README.md](./secrets/README.md)):

   ```bash
   cp secrets/dotsecrets.example .secrets
   # edit .secrets
   ```

2. **Functions**

   ```bash
   cd functions && npm ci && npm run build
   ```

3. **Nhost CLI** — from repo root, follow [Nhost local development](https://docs.nhost.io/platform/cli/local-development) for `nhost up` and function URLs (typically `https://local.functions.local.nhost.run/v1/...`).

## Deploy

Push to the GitHub repository connected to your Nhost project. Functions deploy from the `functions/` directory; secrets come from the Nhost Dashboard in cloud environments.
