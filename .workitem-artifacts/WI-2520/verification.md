# WI-2520 verification

Date: 2026-07-31

## Focused routing and runtime guarantees

```sh
DATABASE_URL=postgresql://localhost/wi2520_unit pnpm exec jest --runInBand apps/api/src/services/llm/router.age-bracket-coverage.test.ts apps/api/src/services/dictation/generate.test.ts apps/api/src/services/dictation/prepare-homework.test.ts apps/api/src/services/dictation/review.test.ts apps/api/src/services/homework-summary.test.ts apps/api/src/routes/dictation.test.ts
```

- Exit: `0`
- Suites: 6 passed / 6 total
- Tests: 123 passed / 123 total
- Snapshots: 0
- Runtime assertions cover route-derived brackets for dictation generation and
  homework preparation, service forwarding for those two flows and homework
  summaries, and conversion of existing `ageYears: 17` to
  `ageBracket: 'adolescent'` in dictation review.
- The source ratchet reports zero violations across all 11 named call sites and
  confirms that only the two `OPEN_SCOPE_QUESTION_FLOWS` exemptions remain.

## Candidate validation already completed before publication

- 17 affected Jest suites: 655 tests passed.
- API full and incremental TypeScript builds passed.
- Focused ESLint passed with 0 errors and 3 pre-existing raw-error warnings.
- Formatting passed.
- `pnpm eval:llm`: 528 snapshots, zero drift.
- The full pre-push hook passed with an explicit non-staging local test URL.

## Follow-up branch validation

```sh
PATH=/opt/homebrew/Cellar/node@22/22.23.1/bin:/opt/homebrew/bin:/usr/bin:/bin \
BASE_REF=main DATABASE_URL=postgresql://localhost/wi2520_unit \
bash scripts/check-change-class.sh --branch --run --fast
```

- Exit: `0`
- Branch files classified: 23
- Classes: `typescript`, `llm-book-generation`, `inngest`,
  `inngest-admin`, `prompt-markers`, `api-routes`, `api-services`,
  `no-gemini-runtime`, `test-only-exports`
- Results: 6 passed, 0 failed, 2 deliberately skipped by `--fast`
- Full incremental TypeScript build: passed.
- Inngest admin guard: all 76 functions valid.
- Structured-envelope marker guard: passed.
- API unit gate: 506 suites passed; 10,098 tests passed, 9 skipped;
  3 snapshots passed.
- Whole-tree Gemini runtime ratchet: clean (76 grandfathered, 0 new).
- Test-only exports ratchet: 1 suite / 6 tests passed.
- Slow gates skipped by the sanctioned fast mode:
  `pnpm test:llm:book-generation` (Doppler staging-backed) and
  `pnpm test:api:integration` (database-backed). The executor brief forbids
  touching staging/database infrastructure.
