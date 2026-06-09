---
name: Doppler — DATABASE_URL + test secrets
description: Tests requiring real DB get DATABASE_URL via Doppler. Project=mentomate, configs dev/stg/prd. Archon's validate/push wrap with `doppler run`.
type: project
---

# Doppler-managed secrets for tests

## Where secrets live

All real-database test secrets (`DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `TEST_SEED_SECRET`) live in **Doppler**, project `mentomate`. Three configs available:

| Config | Use |
|--------|-----|
| `dev`  | Default for tests and Archon-driven validate/push runs |
| `stg`  | Staging-equivalent (LLM eval gates, source-grounding) |
| `prd`  | Production (do not target from local) |

## Why some tests fail without it

Tests living in `apps/api/src/services/*.test.ts` (e.g. `idempotency-assistant-state.test.ts`) include integration paths that require a real DB connection. They're not in `*.integration.test.ts` (which jest excludes via `testPathIgnorePatterns`), so they ARE picked up by `pnpm test:api:unit`. When `DATABASE_URL` is unset, `loadDatabaseEnv` warns and those tests fail with `DATABASE_URL is not set`. This is a known mis-categorization — tracked as a follow-up WI ([eduagent WI on validate gap]).

## How to run tests with secrets

Wrap with `doppler run`:

```bash
doppler run --project mentomate --config dev -- pnpm test:api:unit
```

The `pnpm test` umbrella script and several `test:llm:*` scripts already include `doppler run` (look for `C:/Tools/doppler/doppler.exe run --project mentomate --config <env>` in `package.json`). Those package scripts are Windows-path-specific; `packages/test-utils/src/lib/load-database-env.ts` separately probes `DOPPLER_CLI`, PATH, and common platform install paths.

## How Archon picks it up

When Archon runs `execute-workitem` against this repo, the validate and push bash nodes wrap the command via `doppler run` automatically. The selector (`project: mentomate`, `config: dev`) lives in this repo's `zdx-config.yaml` under `zdx.validate.doppler`. The `DOPPLER_TOKEN` itself is user-machine state in `~/.archon/.env`. See:

- `zdx-config.yaml` for the selector
- `~/.archon/scripts/zdx-validate.sh` and `zdx-push.sh` for the wrap logic
- WI-89 session (PRs #373 + #374) was the first end-to-end run exercising this

## Operator note (macOS)

Doppler CLI on macOS: `/opt/homebrew/bin/doppler` (Homebrew). `loadDatabaseEnv()` now checks this path automatically after env files and PATH lookup.
