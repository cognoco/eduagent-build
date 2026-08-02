# WI-2534 verification evidence

Status: review hardening verified. The implementation is reconciled with `origin/main` at `4dea9bcc6ba92e56c9a98d60e1f85ae632135c99`; landing evidence is recorded by the Cosmo execution artifacts after the PR merges.

## Fresh-database proof

- Disposable PostgreSQL container: `bid49-wi2534-ci-pg`, exposed locally on port 55534.
- Fresh database: `wi2534_rebase_red_20260802` with `vector` and `pg_trgm` initialized.
- `pnpm --filter @eduagent/database db:migrate` replayed the complete migration journal from an empty database through migration `0167_wi2534_resumable_family_join.sql`.
- Catalog inspection confirmed `family_join_journey` exists and `support_visibility_audit_events` accepts the new `authority_invalidated` event.

## Focused verification

| Surface | Command / evidence | Result |
|---|---|---|
| Journey PostgreSQL integration | `family-join-journey.integration.test.ts` against the isolated migrated database | 17 passed |
| Authenticated route PostgreSQL integration | `family-join.integration.test.ts` against the fresh database | 13 passed |
| Invite recovery PostgreSQL integration | `family-join-invite.integration.test.ts` against the isolated migrated database | 9 passed |
| Durable guardian authority PostgreSQL integration | `guardian-attachment.integration.test.ts`, including pre-assent-digest response-loss recovery | 18 passed |
| Journey and invite-email unit guards | focused API Jest run | 9 passed |
| Shared family-join contracts | canonical shared-schema Jest target after the WI-3030 discovery fix | 8 passed |
| Database family-join schema | focused database Jest run against the fresh database | 6 passed |
| Mobile ceremony, hook, storage, layout, and entry points | affected mobile Jest suites with the canonical `--forceExit` liveness policy; family-join screen rerun after review hardening | 6 screen regressions passed; broader prior run 172 passed |
| Full API unit project | `pnpm test:api:unit` | passed, exit 0 in 747.6 seconds |
| Full mobile unit project | `pnpm test:mobile:unit` | passed, exit 0 in 952.1 seconds |
| Full database unit project | `pnpm exec nx run @eduagent/database:test` against the isolated database | 35 suites / 329 tests passed |
| Migration integrity | migration immutability and enum-idempotency guards | passed |
| Migration rollback | applied the revised guarded SQL in `0167_wi2534_resumable_family_join.rollback.md` to disposable clones, including the post-review clone `wi2534_rollback_review_20260802_1715` | affected tables locked before the destructive guard; empty-journey precondition enforced; journey table removed; invalid invite/audit rows absent; exact legacy constraints verified before commit |
| Internationalization | orphan-key, staleness, hardcoded-JSX, and clinical-copy ratchets | passed after positive-framing correction |
| Static checks | full TypeScript build, prompt-marker guard, no-Gemini ratchet, and test-only-export ratchet | passed with pre-existing warnings only |
| Uncommitted-delta change-class gate | `scripts/check-change-class.sh --run --fast` via Git-for-Windows Bash | 5 checks passed, 0 failed, 1 intentionally slow check skipped |

The four review-affected PostgreSQL suites ran together against isolated migrated database `wi2534_integration_review_20260802` after reconciliation (57/57). The complete migration journal had already replayed from zero, and the affected API/mobile/schema/database unit projects ran directly. The focused mobile command originally omitted `--forceExit` and reproduced the same Jest teardown liveness symptom on an unmodified `main` checkout. This is already owned by Closed/Done WI-2845, whose canonical mobile unit command deliberately supplies `--runInBand --forceExit`; rerunning with that policy completed 172/172.

## Red-green-revert

Named regression: `invalidates guardian authority when the learner reaches self-consent age and requires fresh learner decisions` in `apps/api/src/services/identity-v2/family-join-journey.integration.test.ts`.

1. The regression passed with `invalidateSupersededGuardianAuthority(...)` present.
2. Removing that call made the assertion fail with the stale contract still pending and the supportee acceptance timestamp retained.
3. Restoring the call returned the regression to green.

This proves the test guards the legal-posture transition rather than merely exercising the surrounding happy path.

Additional red-green regressions added during the current hardening pass:

- Terminal decline, inviter withdrawal, and expiry initially left the journey visibility contract and request-bound grants live. The parameterized regression failed all three terminal cases before `retireFamilyJoinArtifacts(...)` and passed after the idempotent retirement path was added.
- The first retirement implementation selected every grant held by the same guardian and incorrectly withdrew a newer independent re-consent. `preserves newer independent consent when retiring request-bound authority` failed before the selector was narrowed to the exact consent-request grant IDs and passed afterward.
- A persisted `joined` journey returned `expired` on retry after the invitation deadline. The joined-after-expiry regression failed before the terminal joined state was resolved ahead of unfinished-journey expiry handling and passed afterward; unfinished journeys still expire and revoke their artifacts.
- Expired unfinished rows retained the active-journey unique slot, and declined/withdrawn slots could never be reused. Review regressions now prove expiry retires authority and removes only unfinished journey rows, terminal or expired invites reopen under a row lock, and accepted invites remain frozen.
- A second invite for the same learner previously reached the database partial-unique constraint as a generic write error. The active-slot regression now proves the service returns a controlled conflict before insert.
- Adding learner assent to the durable guardian command digest initially made a pre-deploy issued receipt unrecoverable after response loss. The compatibility regression rewrites an issued receipt to the legacy digest and proves the same handle returns the original authority without calling the verifier twice; family-join commands with expected assent do not use the legacy path.
- Account-agnostic SecureStore continuation could cross a failed sign-out cleanup. Mobile state regressions now prove continuation version 2 is bound to the Clerk account and is deleted on a mismatched read.
- The journey fixture's ordinary invite expired at `2026-08-02T12:00:00Z`, while the production compare-and-set correctly rechecks PostgreSQL `now()`. After the database clock crossed that point, three ordinary join cases failed at redemption. Giving only ordinary fixtures an explicit far-future expiry restored 14/14 journey and 13/13 route cases; tests that exercise expiry continue to pass explicit boundary timestamps.

## Findings admitted to BID-49

- `WI-3030` owns the shared-schema Jest discovery defect: the canonical target could report success with zero tests because its glob is incompatible with the current Jest path matcher and `passWithNoTests` masked the empty run.
- `WI-3031` owns the Windows Playwright fixture-cleanup defect that blocked the full mobile gate. Its fix landed through PR #2864 and this branch includes the landed commit.

## Orion PR-collision preflight

- PR #2811 overlaps only the migration journal's final newline and an unrelated formatting-only hunk in `notifications/email.ts`.
- PR #2710 overlaps the seven locale catalogs only in its unrelated shared-record keys; WI-2534 adds family-join strings in a separate section.
- Neither overlap changes the WI-2534 behavior or migration lineage. Recheck both immediately before landing because BID-33 and BID-51 share Orion.

## Landing boundary

- Before push, recheck every changed path against open PRs on Orion.
- Require all applicable PR checks to be green and perform the merge-authority preflight.
- Record the landed commit in the Cosmo completion artifacts, then transition to Reviewing through `cosmo:execute complete`.
