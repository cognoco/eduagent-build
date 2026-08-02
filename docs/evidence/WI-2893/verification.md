# WI-2893 verification

Generated on 2026-08-02 on Orion for **WI-2893 — Initialize vector and
pg_trgm extensions in the disposable test database**.

## Revisions and scope

- Defective parent: `c51095e4ed3b349f947bff9e0b5294ee49eedba2`.
- Candidate implementation: `caa6cbd6ce6ff492626d7d14bc3ecdabf59b1320`.
- Production files exercised by the regression proof:
  `docker-compose.test.yml` and `scripts/init-test-db.sql`.
- Retained regression guard:
  `scripts/disposable-test-db-extensions.test.ts`.

The proof changes only the disposable test-database bootstrap. It does not
contact or mutate a shared development, staging, or production database.

## Red, green, production revert, exact restore

Every phase used the same focused command:

```text
pnpm exec jest --config scripts/jest.config.cjs scripts/disposable-test-db-extensions.test.ts --runInBand --no-coverage
```

| Phase | Production bytes | Result |
| --- | --- | --- |
| Baseline RED | Bootstrap absent | exit 1; 1/1 suite failed; 3/3 tests failed |
| Candidate GREEN | Candidate implementation | exit 0; 1/1 suite passed; 3/3 tests passed |
| Production-only REVERT | Exact diff from `caa6cbd6c` to `c51095e4` applied in reverse; regression guard retained | exit 1; 1/1 suite failed; 3/3 tests failed |
| Exact RESTORE | The same production diff reapplied | exit 0; 1/1 suite passed; 3/3 tests passed |

The three RED/revert failures proved independently that the initializer was not
mounted, readiness checked only `pg_isready`, and the initializer SQL was
absent. After the exact restore, the guard proved the read-only init mount, the
two-extension healthcheck, idempotent `CREATE EXTENSION` statements, and the
absence of destructive `DROP` or `ALTER` SQL. `git status --short` was empty
after restoration.

## Live disposable-database exercise

A fresh, uniquely scoped Compose project named `bid49-wi2893` was exercised as
follows:

1. `docker compose -p bid49-wi2893 -f docker-compose.test.yml up -d --wait`
   completed with the database healthy.
2. A `pg_extension` query returned both `pg_trgm` and `vector`.
3. The package-level Drizzle schema push completed successfully. Queries then
   confirmed the HNSW vector indexes and `gin_trgm_ops` indexes existed.
4. Re-running `scripts/init-test-db.sql` produced only already-exists notices,
   confirming idempotency.
5. Restarting the container returned it to healthy, and a second schema push
   completed successfully.
6. `docker compose -p bid49-wi2893 -f docker-compose.test.yml down
   --remove-orphans` removed the scoped container and network.

This proves both the static fail-closed contract and the real fresh-start,
restart, and repeat-application behavior required by the work item.
