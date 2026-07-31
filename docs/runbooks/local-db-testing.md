# Local DB Testing Runbook

Run integration tests against a disposable PostgreSQL database instead of a shared
development, staging, or production database.

## Canonical Lancre command

```bash
corepack pnpm run test:api:integration
```

This is the only canonical workstation command for the API co-located integration
suite. It uses `package.json#packageManager` (`pnpm@10.19.0`) through Corepack,
selects Doppler project `mentomate` and config `dev_integration` explicitly, validates
the database identity, then enters the Nx `api:integration-api` target. The target
repeats the same guard before Jest, so invoking Nx directly cannot bypass it.

The command fails before Jest unless the operator has provisioned a dedicated,
disposable database and added these values to Doppler's `mentomate/dev_integration`
config (under the `dev` Doppler environment):

| Variable | Required value |
| --- | --- |
| `DATABASE_URL` | Connection URL for the dedicated integration database |
| `INTEGRATION_DATABASE_HOST` | Exact hostname parsed from `DATABASE_URL` |
| `INTEGRATION_DATABASE_NAME` | Exact database name parsed from `DATABASE_URL` |
| `INTEGRATION_DATABASE_TARGET_ID` | Unique lowercase identifier embedded in the database name |
| `INTEGRATION_DATABASE_DISPOSABLE` | Literal `true` |
| `DATABASE_URL_DEVELOPMENT_HOST` | Exact protected shared-development hostname |
| `DATABASE_URL_STAGING_HOST` | Exact protected staging hostname |
| `DATABASE_URL_PRODUCTION_HOST` | Exact protected production hostname |

Doppler supplies `DOPPLER_PROJECT`, `DOPPLER_CONFIG`, and
`DOPPLER_ENVIRONMENT` to the child process. The launcher requires exactly
`mentomate`, `dev_integration`, and `dev`. The `dev_` prefix is required by
Doppler for non-default development configs. Missing identity metadata, a protected
endpoint match, staging/production labels, and non-disposable metadata all fail
closed. Do not point this config at an existing dev, staging, or production
branch. Database/config provisioning and secret changes are operator-owned.

## Bootstrapping the dedicated remote schema

An empty remote target must be bootstrapped before the canonical integration
command can run. This is an operator-gated mutation: do not run it without a
specific ruling for the exact disposable target.

From a clean checkout of the revision being proved:

```bash
corepack pnpm run db:bootstrap:api-integration -- \
  --revision "<exact 40-character git HEAD>" \
  --operator-ruling "<durable ruling reference>" \
  --receipt ".workitem-artifacts/WI-2939/bootstrap-receipt.json"
```

The bootstrap fails closed before schema mutation unless all of these are true:

- Doppler resolves exactly `mentomate/dev_integration` in the `dev` environment.
- The URL matches the declared host, database name, and unique target ID.
- The endpoint differs from the declared shared-development, staging, and
  production hosts and carries no protected-environment label.
- The checked-out revision matches `--revision`, and its schema/bootstrap
  sources have no tracked changes.
- The public schema is empty with no marker, or it has a ready marker whose
  revision and full structural fingerprint still match.

For an empty target, the command creates an `applying` marker in a dedicated
metadata schema, invokes only the package-level `drizzle-kit push` path, records
the resulting structural fingerprint, and marks the target ready. A repeated
run at the same revision is read-only and returns `already-compatible`.
Non-empty unmarked targets, changed fingerprints, prior failed/interrupted
runs, or another revision are incompatible and must be destroyed and recreated.
The command never invokes `drizzle-kit migrate`, seeds rows, copies user data,
or prints/persists the database URL, host, name, or credentials.

The receipt contains only hashed endpoint identity, target ID, revision,
operator-ruling reference, schema fingerprint, timestamps, result, and cleanup
instructions. Ordinary rollback is destruction of that uniquely identified
disposable target; never attempt an in-place repair or point the command at
shared development, staging, or production.

CI and the local Docker workflow below may invoke the guarded Nx target directly
because their `DATABASE_URL` points to `localhost`/`127.0.0.1` and names an
explicit test database. Remote database URLs never receive that exception.

## Why

- Faster round-trips (no network to Neon).
- No contention with other developers or CI on the shared dev database.
- Offline-capable test runs.
- Clean, disposable database per session (tmpfs — no disk state).

## Prerequisites

- Docker Desktop (or Docker Engine) running.
- `pnpm` dependencies installed.
- No local PostgreSQL required — Docker provides it.

## Quick Start

```powershell
# 1. Start the test database (pgvector/pgvector:pg16 on port 5433)
docker compose -f docker-compose.test.yml up -d --wait

# 2. Apply the current schema via drizzle-kit push
$env:DATABASE_URL = "postgresql://test:test@localhost:5433/eduagent_test"
pnpm --filter @eduagent/database exec tsx node_modules/drizzle-kit/bin.cjs push

# 3. Run API integration tests through the guarded Nx target
$env:NX_DAEMON = 'false'
$env:NX_ISOLATE_PLUGINS = 'false'
corepack pnpm exec nx run api:integration-api

# 4. Tear down (data is on tmpfs, so this is instant)
docker compose -f docker-compose.test.yml down
```

## How the Driver Swap Works

The integration setup (`tests/integration/setup.ts`) detects whether `DATABASE_URL` points to a Neon host (`*.neon.tech`). If it does, it uses the Neon HTTP driver (production path). If it does not, it swaps in the standard `pg` wire-protocol driver via `jest.mock('@eduagent/database', ...)`.

The same logic exists in `tests/integration/api-setup.ts` for API-scoped integration tests under `apps/api/`.

No production code is changed — the driver swap is test-setup only.

## pgvector Handling

The Docker image is `pgvector/pgvector:pg16`, which ships with the `pgvector` extension pre-installed. The schema push (`drizzle-kit push`) creates `vector(1024)` columns and HNSW indexes, which require pgvector.

If you use a plain `postgres:16` image instead, any test that touches `session_embeddings` or `memory_facts.embedding` will fail with:

```
ERROR: type "vector" does not exist
```

**Decision:** Use `pgvector/pgvector:pg16` as the standard local test image. This matches Neon's built-in pgvector support and allows all integration tests to run locally without modification.

### Suites that require pgvector

These suites insert or query `vector(1024)` columns:

| Suite | Column |
| --- | --- |
| `memory-facts-cross-profile.integration.test.ts` | `memory_facts.embedding` |
| `memory-facts-dedup.integration.test.ts` | `memory_facts.embedding` |
| `memory-facts-dual-write.integration.test.ts` | `memory_facts.embedding` |
| `memory-facts-suppressed-prewrite.integration.test.ts` | `memory_facts.embedding` |
| `account-deletion.integration.test.ts` | `session_embeddings.embedding` |
| `session-completed-chain.integration.test.ts` | `session_embeddings.embedding` |
| `session-completed-pipeline.integration.test.ts` | `session_embeddings.embedding` |

All other integration suites work with or without pgvector (they don't touch vector columns).

## Schema Application

Use `drizzle-kit push` against the local database — this is the dev-mode schema sync tool and is safe for disposable local databases. Do **not** use `drizzle-kit migrate`; the migration journal is for staging/production only.

```powershell
$env:DATABASE_URL = "postgresql://test:test@localhost:5433/eduagent_test"
pnpm --filter @eduagent/database exec tsx node_modules/drizzle-kit/bin.cjs push
```

If push fails on a type conflict after schema changes, tear down and re-create:

```powershell
docker compose -f docker-compose.test.yml down
docker compose -f docker-compose.test.yml up -d --wait
# Re-push schema
```

## Running Specific Suites

```powershell
# Top-level integration suites
$env:DATABASE_URL = "postgresql://test:test@localhost:5433/eduagent_test"
pnpm exec jest -c tests/integration/jest.config.cjs tests/integration/streaks-routes.integration.test.ts --runInBand --no-coverage

# API-scoped integration suites (guard first, then pass a Jest path locally)
$env:DATABASE_URL = "postgresql://test:test@localhost:5433/eduagent_test"
node scripts/run-api-integration.mjs --jest apps/api/src/services/auth-scoping.integration.test.ts --runInBand --no-coverage
```

## Using .env.test.local

Instead of setting `DATABASE_URL` per local-Docker command, create
`.env.test.local` at the workspace root:

```env
DATABASE_URL=postgresql://test:test@localhost:5433/eduagent_test
```

The `loadDatabaseEnv()` helper (in `packages/test-utils`) checks this file
automatically. The guarded Nx target still requires the URL in the process
environment; it intentionally does not load env-file or Doppler fallbacks before
its pre-Jest check.

## CI

CI uses a PostgreSQL 16 service container (GitHub Actions `services:` block). The same driver swap activates there. The CI `DATABASE_URL` is injected by the workflow, not by Doppler.

## Troubleshooting

**Port conflict:** If port 5433 is in use, change the host port in `docker-compose.test.yml` and update `DATABASE_URL` to match.

**Open handles warning:** Jest may warn about open handles after the test run. This is a known issue with the shared `pg.Pool` — the pool outlives individual test files within a Jest worker. Tests still pass; the warning is cosmetic.

**pgvector not found:** Verify the Docker image is `pgvector/pgvector:pg16`, not `postgres:16`. Run `docker exec <container> psql -U test -d eduagent_test -c "SELECT extname FROM pg_extension WHERE extname = 'vector'"` to confirm.
