# WI-2987 red / green / production-revert / exact-restore evidence

Date: 2026-08-01
Initial base: `066a31c14`
Current reviewed base: `f20fe9bf8`
Scope: dictation-review route consent ordering and its structural consent/metering boundary.

## Repeated focused command

Every phase used Node 22 and the same focused Jest selection against a disposable
local PostgreSQL database:

```sh
DATABASE_URL=postgresql://vetinari@localhost:5432/tests_v2 \
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent \
  apps/api/src/routes/dictation.test.ts \
  apps/api/src/middleware/metering.coverage.guard.test.ts
```

## Baseline RED

- Exit code: `1`
- Suites: `2 failed, 2 total`
- Cases: `4 failed, 80 passed, 84 total`
- Expected failures: withdrawn consent masked the existing rate-exhausted 429 and
  aggregate prompt-budget 413; the consent gate ran before the rate check; and the
  structural manifest did not represent the route-owned ordering boundary.
- Failure class: behavioral and structural only, with no setup, import, syntax, or
  database failure.

## Candidate GREEN

- Exit code: `0`
- Suites: `2 passed, 2 total`
- Cases: `84 passed, 84 total`

## Production-only REVERT RED

The production route order and structural manifest were restored to the initial
base while the new tests remained.

- Exit code: `1`
- Suites: `2 failed, 2 total`
- Cases: `4 failed, 80 passed, 84 total`
- Failure parity: the same withdrawn-consent 429, withdrawn-consent 413,
  rate-before-consent, and structural classification checks failed.

## Exact RESTORE GREEN

The production patch was reapplied exactly.

- Exit code: `0`
- Suites: `2 passed, 2 total`
- Cases: `84 passed, 84 total`

## Current-main integration GREEN

The isolated branch was rebased onto exact `origin/main` `f20fe9bf8` and the
focused command was repeated:

- Exit code: `0`
- Suites: `2 passed, 2 total`
- Cases: `84 passed, 84 total`
- Time: `1.302 s`
