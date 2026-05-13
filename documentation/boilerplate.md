# Nhost Functions Boilerplate

The reusable boilerplate content from this document has been merged into the primary docs so it does not drift from the live `functions/` implementation.

Use these instead:

- [AI_Rules.md](./AI_Rules.md) for directory layout, handler structure, env rules, Hasura access, and deployment requirements.
- [api-guide.md](./api-guide.md) for routing, authentication, client call examples, and operational usage.

When the live implementation changes, update those two documents rather than maintaining a second boilerplate copy here.

---

## Dropiti repo layout (deployment)

This `dropiti-nhost` repository should match [AI_Rules.md](./AI_Rules.md) before you deploy:

| Check | Location |
|--------|----------|
| Node 22 for Functions | `functions/package.json` `engines.node` and `nhost/nhost.toml` `[functions.node] version` |
| TypeScript strict + ES2022 + CommonJS | `functions/tsconfig.json` |
| Shared infra only in `functions/_lib/` | `env.ts`, `hasura.ts`, `auth.ts`, `respond.ts`, `validate.ts` |
| Baseline routes | `functions/health.ts`, `functions/echo.ts` |
| Secrets for local CLI | Copy `secrets/dotsecrets.example` → repo-root `.secrets` (see `secrets/README.md`) |
| Lockfile | Commit `functions/package-lock.json` |
