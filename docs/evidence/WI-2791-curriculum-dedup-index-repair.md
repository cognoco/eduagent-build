# WI-2791 — Curriculum dedup index repair evidence

## Live read-only premise

The builder received the following read-only evidence from the WI-2639 staging
inspection in the execution handoff. It is recorded here without re-querying or
mutating the shared staging database:

| Check | Shared staging result |
|---|---|
| Migration `0044_shelf_book_dedup_unique_indexes` in `drizzle.__drizzle_migrations` | Present |
| `curriculum_books_subject_title_lower_uq` in the catalog | Absent |
| `curriculum_topics_book_title_lower_uq` in the catalog | Absent |
| Duplicate `(subject_id, lower(title))` groups in `curriculum_books` | 0 |
| Duplicate `(book_id, lower(title))` groups in `curriculum_topics` | 0 |

No database command, migration application, `db:push`, or credential change was
performed by the WI-2791 builder. The ambient local target is shared staging and
was treated as read-only and out of bounds.

## Repair contract

`apps/api/drizzle/0159_wi2791_curriculum_dedup_index_repair.sql` is a new
forward-only migration. It counts duplicate groups for both invariants and raises
`P0001` before index DDL if either count is non-zero. On a clean preflight it
creates exactly the two missing case-insensitive unique indexes with `IF NOT
EXISTS`. It contains no row mutation and does not replay migration 0044.

## Regression coverage

`apps/api/src/db/curriculum-dedup-index-repair.integration.test.ts` is restricted
to loopback PostgreSQL and refuses non-disposable hosts before connecting. In the
CI disposable-Postgres lane it replays the committed chain through migration 0158,
drops only the two target indexes to reproduce ledger/catalog drift, and proves:

- both indexes start absent;
- duplicate groups make the repair abort without creating either index or changing
  the duplicate rows;
- a clean application creates both indexes with their intended expression
  definitions;
- direct repeated application is safe;
- same-parent case variants are rejected with `23505`; and
- same-title Books and Topics under an archived Subject or a different Profile's
  Subject remain valid because their `subject_id` / `book_id` keys differ.

The scratch-database suite was intentionally not run locally. CI's disposable
PostgreSQL service is the authorized real-database proof lane.

## Local red-green and verification

RED used a loopback dummy URL only to satisfy Jest's environment bootstrap; no
connection was opened:

```text
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused pnpm exec jest --config packages/database/jest.config.cjs packages/database/src/curriculum-dedup-index-repair.test.ts --runInBand --no-coverage -t "is a new journaled forward migration"
```

Result before the migration existed: failed because the journal did not contain
`0157_wi2791_curriculum_dedup_index_repair` (the next free number at the time).
After two migrations landed concurrently, the branch was fast-forwarded and this
repair was renumbered to 0159; the same guard was updated and passed.

Fresh local non-database checks after renumbering:

```text
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused pnpm exec jest --config packages/database/jest.config.cjs packages/database/src/curriculum-dedup-index-repair.test.ts packages/database/src/drizzle-meta-coverage.test.ts --runInBand --no-coverage
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused pnpm exec nx run @eduagent/database:test --skip-nx-cache
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused pnpm test:api:unit
pnpm exec tsc --build
pnpm exec eslint packages/database/src/curriculum-dedup-index-repair.test.ts apps/api/src/db/curriculum-dedup-index-repair.integration.test.ts
pnpm exec nx run api:typecheck --skip-nx-cache
pnpm check:migration-immutability
pnpm check:no-gemini-runtime
```

Observed results: 11/11 focused tests and all 318 database-package tests passed;
the full TypeScript build, ESLint, API typecheck, migration immutability guard,
and Gemini runtime ratchet passed. All 493 API unit suites and 9,516 executed
tests passed, but the aggregate command exited 1 because an unrelated existing
mentor-notice test logged asynchronously after Jest teardown.

## Operator gate for shared staging

Applying migration 0159 to shared staging is deliberately outside this change.
It requires an explicit operator ruling, a fresh snapshot or restore point, a
same-run duplicate preflight, and post-apply catalog evidence for both index names
and definitions.
