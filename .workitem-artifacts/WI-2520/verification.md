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

## Current-main publication refresh and review follow-up

- Merged `origin/main` normally without conflicts; no rebase or history rewrite.
- CodeRabbit's exact-birth-date finding reproduced before implementation:
  `book-suggestions.test.ts` expected `adolescent` before an eighteenth birthday
  but received `adult` when the route discarded birth month/day.
- The regression test passed after `ProfileMeta` retained optional birth month/day
  and all eight WI-2520 route call sites supplied those parts to
  `computeAgeBracketFromDate`; year-only sentinel data still falls back to the
  existing year-only behavior.
- Focused post-fix verification: 6 suites passed, 256 tests passed, 0 snapshots.
  Coverage included book suggestions, curriculum, dictation, sessions, identity-v2
  profile mapping, and the learner-facing LLM age-bracket ratchet.
- Post-fix fast change-class gate: 6 passed, 0 failed, 2 sanctioned slow lanes
  skipped. The API unit gate passed 506 suites / 10,100 tests (11 skipped), and
  the TypeScript, Inngest annotation, prompt-marker, no-Gemini-runtime, and
  test-only-export guards all passed.

## Typed review rework (2026-08-01)

- The mandatory review finding against `book-suggestions.test.ts` was checked
  against the current GC1/GC6 contract. The four cited mocks already use the
  canonical Pattern A (`jest.requireActual` plus targeted overrides), so no
  `gc1-allow` sticker was added. The retained internal-mock inventory and the
  bounded GC6 deferral are recorded precisely in the repair commit and PR body.
- The session-completed paths now derive age brackets with
  `birthYearFromDate` / `birthMonthDayFromDate`, preserving the repository's
  `YYYY-01-01` year-only sentinel instead of treating it as a known January 1
  birthday. Existing Inngest handler tests assert the resulting bracket at the
  summary-generation boundary.
- Dictation review now accepts an exact route-derived `ageBracket` when full
  birth-date parts exist, while retaining the `ageYears` fallback for direct
  service callers. A boundary test freezes time before an eighteenth birthday
  and proves that `ageYears: 18` cannot override the exact `adolescent` bracket.
- Focused post-rework verification: 6 suites passed, 222 tests passed,
  0 snapshots. The set includes the two Inngest handlers, dictation route and
  review service, book suggestions, and the learner-facing age-bracket ratchet.
- Focused ESLint passed with 0 errors and one pre-existing unused-variable
  warning in `session-completed.test.ts`.
- The GC1 Pattern-A guard passed with zero violations.
- Routed fast validation passed 6 gates with 0 failures and 2 sanctioned slow
  gates skipped. Its API unit lane passed all 506 suites: 10,124 tests passed,
  11 skipped, and 3 snapshots passed. TypeScript, Inngest admin (76 functions),
  prompt-marker, no-Gemini-runtime, and test-only-export gates also passed.
- The two slow routed gates remain intentionally skipped locally:
  `pnpm test:llm:book-generation` and `pnpm test:api:integration`.
