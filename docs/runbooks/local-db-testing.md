# Local DB Testing Runbook

Run integration tests against a local PostgreSQL instead of the shared Neon dev database.

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

# 3. Run integration tests
$env:NX_DAEMON = 'false'
$env:NX_ISOLATE_PLUGINS = 'false'
pnpm exec jest -c tests/integration/jest.config.cjs --runInBand --no-coverage

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

# API-scoped integration suites
$env:DATABASE_URL = "postgresql://test:test@localhost:5433/eduagent_test"
pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/services/auth-scoping.integration.test.ts --runInBand --no-coverage
```

## Using .env.test.local

Instead of setting `DATABASE_URL` per command, create `.env.test.local` at the workspace root:

```env
DATABASE_URL=postgresql://test:test@localhost:5433/eduagent_test
```

The `loadDatabaseEnv()` helper (in `packages/test-utils`) checks this file automatically.

## CI

CI uses a PostgreSQL 16 service container (GitHub Actions `services:` block). The same driver swap activates there. The CI `DATABASE_URL` is injected by the workflow, not by Doppler.

## Troubleshooting

**Port conflict:** If port 5433 is in use, change the host port in `docker-compose.test.yml` and update `DATABASE_URL` to match.

**Open handles warning:** Jest may warn about open handles after the test run. This is a known issue with the shared `pg.Pool` — the pool outlives individual test files within a Jest worker. Tests still pass; the warning is cosmetic.

**pgvector not found:** Verify the Docker image is `pgvector/pgvector:pg16`, not `postgres:16`. Run `docker exec <container> psql -U test -d eduagent_test -c "SELECT extname FROM pg_extension WHERE extname = 'vector'"` to confirm.
