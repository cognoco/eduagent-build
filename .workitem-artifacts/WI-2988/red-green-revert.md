# WI-2988 red / green / production-revert / exact-restore evidence

Date: 2026-08-02
Base: `ad5cefdd1d69ac81099417fe116c8bf035f93be7`
Scope: homework-OCR route consent ordering and its structural consent/metering boundary.

## Repeated focused command

Every phase used Node 22 and the same focused Jest selection with the required
disposable local database URL:

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mentomate_test \
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent \
  apps/api/src/routes/homework.test.ts \
  apps/api/src/middleware/metering.coverage.guard.test.ts
```

## Baseline RED

- Exit code: `1`
- Suites: `2 failed, 2 total`
- Cases: `6 failed, 51 passed, 57 total`
- Expected failures: withdrawn consent masked the declared Content-Length 413
  plus all four multipart/file-validation 400 variants; the structural manifest
  still classified homework OCR as mixed residue instead of representing the
  route-owned ordering boundary.
- Failure class: behavioral and structural only, with no setup, import, syntax,
  or database failure.

## Candidate GREEN

- Exit code: `0`
- Suites: `2 passed, 2 total`
- Cases: `57 passed, 57 total`

## Production-route-only REVERT RED

Only `apps/api/src/routes/homework.ts` was restored to the landed pre-fix consent
order while the new tests and structural declaration remained.

- Exit code: `1`
- Suites: `2 failed, 2 total`
- Cases: `6 failed, 51 passed, 57 total`
- Failure parity: the same five withdrawn-consent response-precedence checks and
  the structural branch-before-consent assertion failed.

## Exact RESTORE GREEN

The production route patch was reapplied exactly.

- Exit code: `0`
- Suites: `2 passed, 2 total`
- Cases: `57 passed, 57 total`
- Time: `1.239 s`
