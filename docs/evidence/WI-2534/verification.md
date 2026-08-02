# WI-2534 verification evidence

Status: pre-landing verification in progress. The implementation tasks are complete; the final repository gate must be rerun after the discovered strict-green prerequisites land and this branch is reconciled with `origin/main`.

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
| Mobile ceremony, hook, storage, layout, and entry points | affected mobile Jest suites | green; final post-reconciliation rerun pending |
| Migration integrity | migration immutability and enum-idempotency guards | passed |
| Internationalization | orphan-key, staleness, hardcoded-JSX, and clinical-copy ratchets | passed after positive-framing correction |
| Static checks | Nx lint and typecheck for API, mobile, database, and schemas | passed with pre-existing warnings only |

## Red-green-revert

Named regression: `invalidates guardian authority when the learner reaches self-consent age and requires fresh learner decisions` in `apps/api/src/services/identity-v2/family-join-journey.integration.test.ts`.

1. The regression passed with `invalidateSupersededGuardianAuthority(...)` present.
2. Removing that call made the assertion fail with the stale contract still pending and the supportee acceptance timestamp retained.
3. Restoring the call returned the regression to green.

This proves the test guards the legal-posture transition rather than merely exercising the surrounding happy path.

## Findings admitted to BID-49

- `WI-3030` owns the shared-schema Jest discovery defect: the canonical target could report success with zero tests because its glob is incompatible with the current Jest path matcher and `passWithNoTests` masked the empty run.
- `WI-3031` owns the Windows Playwright fixture-cleanup defect that blocked the full mobile gate. Its fix landed through PR #2864; this branch still needs reconciliation with that landed commit before final verification.

## Final gate still required

- Reconcile the branch with current `origin/main` after `WI-3031` closes.
- Rerun `scripts/check-change-class.sh --run --fast` through Git-for-Windows Bash.
- Rerun the focused PostgreSQL integration suites and the affected mobile family-join suites after reconciliation.
- Record the strict-green PR and landed commit here before Execute-complete.
