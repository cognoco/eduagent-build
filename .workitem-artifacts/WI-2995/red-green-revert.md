# WI-2995 red / green / production-revert / exact-restore evidence

Date: 2026-08-01
Reviewed base: `764748015d460b08449d3b6898cd1188f8552d93`
Scope: quick-check session path validation before database access.

## Repeated focused command

Every phase used Node 22 and the same route suite against a disposable local
PostgreSQL database:

```sh
DATABASE_URL=postgresql://vetinari@localhost:5432/tests_v2 \
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent \
  apps/api/src/routes/assessments.test.ts
```

## Baseline RED

- Exit code: `1`
- Suites: `1 failed, 1 total`
- Cases: `1 failed, 33 passed, 34 total`
- Expected failure: malformed `sessionId` returned 404 after reaching the mocked
  repository lookup instead of returning request-validation 400 before handler
  work.

## Candidate GREEN

- Exit code: `0`
- Suites: `1 passed, 1 total`
- Cases: `34 passed, 34 total`

## Production-only REVERT RED

The parameter validator and validated-parameter read were removed while the new
regression remained.

- Exit code: `1`
- Suites: `1 failed, 1 total`
- Cases: `1 failed, 33 passed, 34 total`
- Failure parity: the same malformed-ID case expected 400 and received 404.

## Exact RESTORE GREEN

The production patch was restored exactly.

- Exit code: `0`
- Suites: `1 passed, 1 total`
- Cases: `34 passed, 34 total`
- Time: `0.836 s`

