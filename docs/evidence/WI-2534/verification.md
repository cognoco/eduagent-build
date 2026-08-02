# WI-2534 verification evidence

Status: pre-PR verification complete. The implementation is reconciled with `origin/main` at `7ae39d7bec2df8bdb655d03a03e2991fea3f6f9c`; landing evidence is recorded by the Cosmo execution artifacts after the PR merges.

## Fresh-database proof

- Disposable PostgreSQL container: `bid49-wi2534-ci-pg`, exposed locally on port 55534.
- Fresh database: `wi2534_fresh_20260802` with `vector` and `pg_trgm` initialized.
- `pnpm --filter @eduagent/database db:migrate` replayed the complete migration journal from an empty database through migration `0166_wi2534_resumable_family_join.sql`.
- Catalog inspection confirmed `family_join_journey` exists and `support_visibility_audit_events` accepts the new `authority_invalidated` event.

## Focused verification

| Surface | Command / evidence | Result |
|---|---|---|
| Journey PostgreSQL integration | `family-join-journey.integration.test.ts` against the fresh database | 9 passed |
| Authenticated route PostgreSQL integration | `family-join.integration.test.ts` against the fresh database | 13 passed |
| Journey and invite-email unit guards | focused API Jest run | 9 passed |
| Shared family-join contracts | Jest with explicit `**/src/**/*.test.ts` override | 8 passed |
| Database family-join schema | focused database Jest run against the fresh database | 6 passed |
| Mobile ceremony, hook, storage, layout, and entry points | six affected mobile Jest suites | 172 passed |
| Migration integrity | migration immutability and enum-idempotency guards | passed |
| Internationalization | orphan-key, staleness, hardcoded-JSX, and clinical-copy ratchets | passed after positive-framing correction |
| Static checks | Nx lint and typecheck for API, mobile, database, and schemas | passed with pre-existing warnings only |
| Repository change-class gate | `scripts/check-change-class.sh --run --fast` via Git-for-Windows Bash | 11 checks passed, 0 failed, 5 intentionally slow checks skipped |

The five `--fast` skips were database push/generate, the generic API/cross-package integration sets, and staging web smoke. The feature-specific PostgreSQL suites ran separately against the fresh database after reconciliation (22/22), the complete migration journal replayed from zero, and the full API/mobile unit projects ran inside the green change-class gate.

## Red-green-revert

Named regression: `invalidates guardian authority when the learner reaches self-consent age and requires fresh learner decisions` in `apps/api/src/services/identity-v2/family-join-journey.integration.test.ts`.

1. The regression passed with `invalidateSupersededGuardianAuthority(...)` present.
2. Removing that call made the assertion fail with the stale contract still pending and the supportee acceptance timestamp retained.
3. Restoring the call returned the regression to green.

This proves the test guards the legal-posture transition rather than merely exercising the surrounding happy path.

## Findings admitted to BID-49

- `WI-3030` owns the shared-schema Jest discovery defect: the canonical target could report success with zero tests because its glob is incompatible with the current Jest path matcher and `passWithNoTests` masked the empty run.
- `WI-3031` owns the Windows Playwright fixture-cleanup defect that blocked the full mobile gate. Its fix landed through PR #2864 and this branch includes the landed commit.

## Landing boundary

- Before push, recheck every changed path against open PRs on Orion.
- Require all applicable PR checks to be green and perform the merge-authority preflight.
- Record the landed commit in the Cosmo completion artifacts, then transition to Reviewing through `cosmo:execute complete`.
