# WI-2989 red / green / production-revert / exact-restore evidence

Date: 2026-08-01
Initial base: `a4b4698432c6d7f6c984a4550425b50d7e457539` (then-current `origin/main`)
Scope: retention recall route delegation, service consent/cooldown/claim ordering, and the structural metering/consent boundary manifest.

## Repeated focused command

Every phase used the exact live-AC command:

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mentomate_test \
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent \
  apps/api/src/routes/retention.test.ts \
  apps/api/src/services/retention-data.test.ts \
  apps/api/src/middleware/metering.coverage.guard.test.ts
```

## Test inventory

Service controls in `apps/api/src/services/retention-data.test.ts` cover:

- deterministic `dont_remember` without consent, claim, or grader dispatch;
- withdrawn-consent active cooldown without claim mutation or grader dispatch;
- withdrawn-consent lost atomic claim without grader dispatch;
- successful claim followed by consent denial and optimistic claim restoration;
- restoration failure captured without replacing the consent-denied error;
- optimistic restoration rejection captured without replacing the consent-denied error;
- active consent checked immediately before exactly one grader dispatch.

Route controls in `apps/api/src/routes/retention.test.ts` cover service delegation and the existing consent-denied HTTP mapping. The structural control in `apps/api/src/middleware/metering.coverage.guard.test.ts` requires retention to be service-owned, requires every deterministic pre-consent token before the gate, and requires the consent gate before the grader dispatch token.

## Baseline RED

- Exit code: `1`
- Suites: `2 failed, 1 passed, 3 total`
- Cases: `4 failed, 189 passed, 193 total`
- Expected failures: the acquired-claim withdrawal did not reject or restore; active consent was not checked; and retention remained classified as route-owned residue.
- Failure class: behavioral and structural only, with route mapping/delegation green and no setup, syntax, import, or database failure.

## Candidate GREEN

- Exit code: `0`
- Suites: `3 passed, 3 total`
- Cases: `195 passed, 195 total`
- Time: `5.698 s`

## Adversarial restoration-guard extension

Review found that an optimistic restoration can return `updated: false` without
throwing. The new focused regression failed before the repair because the
non-update produced zero observability calls:

- Exit code: `1`
- Cases: `1 failed, 127 skipped, 128 total`
- Expected failure: `captureException` had zero calls for the rejected optimistic
  restoration.

After checking the returned update result and routing a rejection through the
same non-user-visible restoration-error path, the focused case passed.

## Production-only REVERT RED

The three non-test files were restored exactly to `origin/main` while all new tests remained. `git diff --quiet -- apps/api/src/routes/retention.ts apps/api/src/services/retention-data.ts apps/api/src/middleware/metering.coverage.manifest.ts` returned exit code `0` before the repeated command.

- Exit code: `1`
- Suites: `2 failed, 1 passed, 3 total`
- Cases: `5 failed, 189 passed, 194 total`
- Failure parity: the acquired-claim consent/restoration cases, rejected optimistic restoration case, active-consent dispatch ordering case, and structural ownership case failed; route mapping/delegation remained green.

## Exact RESTORE GREEN

The identical production patch was reapplied. Restored production-diff SHA-256: `20c59606b687441176649f7c02da19e23db295915e8f457f6778726f86ee5468`.

- Exit code: `0`
- Suites: `3 passed, 3 total`
- Cases: `196 passed, 196 total`
- Time: `5.454 s`

After exact restoration, `git diff --check` and the exact focused command ran
with exit code `0`: all three suites and all 196 cases passed.

## Current-main integration GREEN

Before commit, `origin/main` advanced to `f75ef9aa9510a80079e9871ed7421f67beeeff0b`. The branch was fast-forwarded to that exact base, the patch applied without conflict, and the exact focused command ran again:

- Exit code: `0`
- Suites: `3 passed, 3 total`
- Cases: `196 passed, 196 total`
- Time: `5.081 s`

The routed fast validator then completed on the same current-main tree with exit code `0`: five selected gates passed and one slow integration gate was intentionally skipped by fast mode. Its API unit leg completed 506 suites with 10,142 passing and 11 skipped cases; the TypeScript build, prompt-marker guard, no-Gemini-runtime ratchet, and test-only-export ratchet also passed.

One final unrelated database-bootstrap commit advanced `origin/main` to `c5cc41fe64632b782f61fcb281bc05b41a1262b4`. The branch fast-forwarded cleanly again; the exact focused command remained green with all 196 cases passing in `5.497 s`.
