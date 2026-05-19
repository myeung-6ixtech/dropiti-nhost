# Nhost Guide

The secret-mapping, runtime-env, and auth troubleshooting guidance from this file has been folded into the main docs so it stays in one place.

Use these instead:

- [AI_Rules.md](./AI_Rules.md) for implementation rules around `_lib/env.ts`, auth, Hasura access, and forbidden patterns.
- [api-guide.md](./api-guide.md) for caller-facing auth behavior, secret mapping, local `.secrets` usage, and operational checks.
- [api-doc-v1.md](./api-doc-v1.md) for the full HTTP API reference (routing, envelopes, route tables) consumed by **`dropiti-admin-console`** via `NEXT_PUBLIC_FUNCTIONS_URL` and the Next.js BFF.

If new Nhost-specific troubleshooting is discovered, add it to one of those documents rather than rebuilding a separate parallel guide here.