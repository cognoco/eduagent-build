---
name: Doppler — DATABASE_URL + test secrets
description: API integration tests use a dedicated mentomate/integration config; shared dev/stg/prd databases are refused before Jest.
type: project
last_confirmed: 2026-07-26
---

# Doppler-managed secrets for tests

## Where secrets live

All real-database test secrets (`DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `TEST_SEED_SECRET`) live in **Doppler**, project `mentomate`.

| Config | Use |
|--------|-----|
| `integration` | Dedicated disposable API integration database; canonical test config |
| `dev`  | Development schema/tooling only; not an API integration-test target |
| `stg`  | Staging-equivalent (LLM eval gates, source-grounding) |
| `prd`  | Production (do not target from local) |

## How to run tests with secrets

Use the guarded canonical command:

```bash
corepack pnpm run test:api:integration
```

`scripts/run-api-integration.mjs` pins Doppler to `mentomate/integration`,
checks Corepack's pnpm against `package.json#packageManager`, and refuses missing,
shared, protected, or non-disposable database identities before Jest. Required
operator-owned metadata and the local/CI disposable-Postgres exception are
documented in `docs/runbooks/local-db-testing.md`.

## How Archon picks it up

When Archon runs `execute-workitem` against this repo, the validate and push bash nodes wrap the command via `doppler run` automatically. The selector (`project: mentomate`, `config: dev`) lives in this repo's `zdx-config.yaml` under `zdx.validate.doppler`. The `DOPPLER_TOKEN` itself is user-machine state in `~/.archon/.env`. See:

- `zdx-config.yaml` for the selector
- `~/.archon/scripts/zdx-validate.sh` and `zdx-push.sh` for the wrap logic

## Operator note (macOS)

Doppler CLI on macOS: `/opt/homebrew/bin/doppler` (Homebrew). `loadDatabaseEnv()` now checks this path automatically after env files and PATH lookup.
