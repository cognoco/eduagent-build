# WI-2543 Rework 2 — red / green / production-revert / exact-restore evidence

Date: 2026-07-31
Base: `da7a1842066765796ed1f1a4ef988b13a5bd01a4` (`origin/main`)
Scope: summary submission, summary retry, Recall Bridge, and the exhaustive request-time consent-boundary guard.

## Repeated focused command

Every phase below used this command and the same case selection:

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mentomate_test \
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent \
  apps/api/src/services/assessments-submit-answer.test.ts \
  apps/api/src/services/suggestions.test.ts \
  apps/api/src/services/curriculum.test.ts \
  apps/api/src/services/session/session-crud.test.ts \
  apps/api/src/services/subject.test.ts \
  apps/api/src/routes/books.test.ts \
  apps/api/src/routes/sessions.test.ts \
  apps/api/src/routes/subjects.test.ts \
  apps/api/src/routes/assessments.test.ts \
  apps/api/src/routes/book-suggestions.test.ts \
  apps/api/src/middleware/metering.coverage.guard.test.ts \
  apps/api/src/services/session/session-summary.test.ts \
  apps/api/src/services/recall-bridge.test.ts
```

The first eleven paths are the original focused regression set. The final two are the new service-level controls.

## Mutation-sensitive case inventory

Summary service controls:

- `returns a saved submitted summary after consent withdrawal without evaluating again`
- `rejects a new summary before evaluation when consent is withdrawn`
- `returns already-available retry feedback after consent withdrawal`
- `returns the unavailable summary when another retry owns the claim despite consent withdrawal`
- `rejects a claimed feedback retry before evaluation and releases its lease`

Recall Bridge service controls:

- `returns empty questions when session has no topic`
- `returns empty questions when session is not found`
- `returns empty questions when topic is not found in DB`
- `rejects before recall-question dispatch when consent is withdrawn`

Route and structural controls:

- `returns typed 409 after consent withdrawal without invoking the Recall Bridge generator`
- `maps a service-boundary consent refusal to 403 CONSENT_WITHDRAWN`
- `delegates the LLM-ready branch without a route-entry consent gate`
- `POST /sessions/:sessionId/summary delegates a saved-summary result after consent withdrawal`
- `POST /sessions/:sessionId/summary/retry-feedback delegates a no-claim result after consent withdrawal`
- `classifies every production route-entry consent assertion exactly once`
- `$id delegates without an unconditional route-entry consent gate`
- `$id gates before $llmDispatchToken and stays tied to the LLM manifest`

The three new service contracts have no request discriminant. The existing unknown/future-discriminant negative control remains in `apps/api/src/services/subject.test.ts:1057`, and the focused command continued to run it.

## RED — tests and exhaustive guard before production changes

- Exit code: `1`
- Suites: `4 failed, 9 passed, 13 total`
- Cases: `17 failed, 571 passed, 588 total`
- Failure signal: the three routes still invoked their route-entry tripwire before deterministic service returns; service negative controls reached their evaluation/provider spies; and the exhaustive guard reported the three sibling route assertions as unclassified while the service gate tokens were absent.
- Failure class: behavioral/structural only. There was no setup, syntax, import, or database-connectivity failure.

## Candidate GREEN

- Exit code: `0`
- Suites: `13 passed, 13 total`
- Cases: `589 passed, 589 total`
- The extra case relative to the initial RED completed the route-level service-refusal coverage before this candidate run.

## Production-revert RED

The candidate production diff was saved, then the route, service, and boundary-manifest production files were restored exactly to `origin/main`; tests remained in place. `git diff --exit-code origin/main -- <production files>` returned `0`. Temporary test-only type casts allowed the new dependency seams to compile against the reverted production signatures and were not part of either production state.

- Exit code: `1`
- Suites: `4 failed, 9 passed, 13 total`
- Cases: `17 failed, 572 passed, 589 total`
- Failure parity: the same three route-over-gating failures, service-before-dispatch failures, three unowned route assertions, and missing service-gate tokens returned. No new setup or syntax failure appeared.

## Exact restore GREEN

Candidate production-diff SHA-256 before revert: `bb450a135d07b0e86d96387f1ef3fcdcb08b1654eae4bd7a0db8f5040311470f`
Restored production-diff SHA-256: `bb450a135d07b0e86d96387f1ef3fcdcb08b1654eae4bd7a0db8f5040311470f`

- Exit code: `0`
- Suites: `13 passed, 13 total`
- Cases: `589 passed, 589 total`
- Time: `14.881 s`

After formatting and the attributable age-bracket fixture repair, the same focused command was executed once more:

- Exit code: `0`
- Suites: `13 passed, 13 total`
- Cases: `589 passed, 589 total`
- Time: `13.725 s`

## Attributable standard verification

Command:

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mentomate_test \
bash scripts/check-change-class.sh --run --fast
```

The first standard run exposed one attributable fixture gap: `recall-bridge.age-bracket.test.ts` used the real Recall Bridge service with a DB mock that lacked the consent query. It failed 4 cases in 1 suite; this was repaired by injecting an explicitly allowed consent dependency while retaining the real LLM router. The isolated suite then passed `4/4` with exit code `0`.

The clean rerun completed with exit code `0`:

- TypeScript build: passed
- Prompt-marker guard: passed
- API units: `506/506` suites; `10,113 passed`, `11 skipped`, `10,124 total`; 3 snapshots passed
- No-Gemini runtime guard: clean (`76 grandfathered, 0 new`)
- Test-only export guard: `6/6` passed
- Change-class result: `5 passed, 0 failed, 1 slow integration class intentionally skipped by --fast`

## Final publication hygiene

- The complete aggregate PR diff from `origin/main` was inspected file by file.
- Suspicious secret/junk paths: 0
- Unintended files larger than 1 MiB: 0
- Added credential-signature hits: 0
- Conflict-marker hits: 0
- Both lifecycle evidence JSON files parse successfully.
- Stale `15 suites / 595 tests` verification claims: 0
- `git diff --check origin/main --`: exit code 0 after removing the reported Markdown whitespace defects.
