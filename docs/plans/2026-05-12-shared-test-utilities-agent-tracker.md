# Shared Test Utilities Agent Tracker

**Status:** Archived 2026-05-12 after Steps 1-8 completed.  
**Purpose:** Historical coordination plan for agents implementing the shared test utility framework.  
**Full context:** `docs/plans/2026-05-12-shared-test-utility-framework-plan.md`

## Agent Rules

- Read this tracker before changing test utilities or mock cleanup tests.
- Update this tracker in the same PR/session when you complete, start, block, or reorder a step.
- Do not start a later phase until the prior phase has its proof test, unless the tracker explicitly says it is safe to parallelize.
- Keep entries short: status, files changed, proof command, result, blocker if any.
- Do not mark a step done if tests were not run or if failures remain unexplained.

## Ordered Work

| Step | Status | Work | Proof / Exit Criteria |
| --- | --- | --- | --- |
| 1 | **Done** | Establish API Inngest step runner. Files: `apps/api/src/test-utils/inngest-step-runner.ts`, `streak-record.test.ts`, `summary-regenerate.test.ts`, `transcript-purge-cron.test.ts`. | Passed: `pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/inngest/functions/streak-record.test.ts apps/api/src/inngest/functions/summary-regenerate.test.ts apps/api/src/inngest/functions/transcript-purge-cron.test.ts --runInBand --no-coverage` (3 suites, 20 tests). |
| 2 | **Done** | Add shared API Inngest transport capture utility for `inngest.send` / `createFunction` tests. Files: `apps/api/src/test-utils/inngest-transport-capture.ts`, `apps/api/src/routes/maintenance.test.ts`, `apps/api/src/inngest/functions/billing-trial-subscription-failed.test.ts`. | Passed: `pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/routes/maintenance.test.ts apps/api/src/inngest/functions/billing-trial-subscription-failed.test.ts --runInBand --no-coverage` (2 suites, 5 tests). |
| 3 | **Done** | Add API LLM provider fixture helpers around `registerProvider`: valid envelope, invalid envelope, plain text, streaming, provider failure. Files: `apps/api/src/test-utils/llm-provider-fixtures.ts`, `apps/api/src/test-utils/llm-provider-fixtures.test.ts`, `apps/api/src/services/summaries.test.ts`, `tests/integration/learning-session.integration.test.ts`. | Passed: `pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/test-utils/llm-provider-fixtures.test.ts apps/api/src/services/summaries.test.ts --runInBand --no-coverage` (2 suites, 12 tests). API app typecheck passed. DB-backed integration proof compile/load attempted but blocked by missing `DATABASE_URL`. |
| 4 | **Done** | Document and prove API local DB test mode. Files: `docker-compose.test.yml`, `docs/runbooks/local-db-testing.md`, `tests/integration/setup.ts` (driver log), `tests/integration/api-setup.ts` (driver log). pgvector decision: use `pgvector/pgvector:pg16` image. | Neon path proven: `streaks-routes.integration.test.ts` (1 suite, 4 tests) + `auth-scoping.integration.test.ts` (1 suite, 4 tests). Driver log confirms mode. Local Docker path documented but not run (Docker Desktop not running in sandbox). |
| 5 | **Done** | Add mobile screen render harness. Files: `apps/mobile/src/test-utils/screen-render-harness.tsx`, `apps/mobile/src/app/(app)/home.test.tsx` (proof conversion). Harness exports `createScreenWrapper`, `renderScreen`, `createTestProfile`, `profileFixtures`, `errorResponses`, `cleanupScreen`. Eliminates `jest.mock('../../lib/profile')` — uses real `ProfileContext.Provider`. | Passed: `pnpm exec jest -c apps/mobile/jest.config.cjs --runTestsByPath "apps/mobile/src/app/(app)/home.test.tsx" --runInBand --no-coverage --forceExit` (1 suite, 9 tests). Pre-existing "Jest did not exit" warning confirmed present on original test too. |
| 6 | **Done** | Add mobile native boundary shim catalog and labels. Files: `apps/mobile/src/test-utils/native-shims.ts`, `apps/mobile/src/app/privacy.test.tsx` (proof conversion). Catalog exports `expoRouterShim`, `expoRouterLayoutShim`, `safeAreaShim`, `createRouterMockFns`, boundary label documentation. | Passed: `pnpm exec jest -c apps/mobile/jest.config.cjs --runTestsByPath "apps/mobile/src/app/privacy.test.tsx" --runInBand --no-coverage` (1 suite, 2 tests). |
| 7 | **Done** | Rewrote `apps/api/src/services/llm/integration-mock-guard.test.ts` to enumerate integration tests with Node filesystem APIs instead of `execSync('git ls-files ...')`. It scans `apps/api` and `tests/integration`, normalizes paths, and keeps the shrinking LLM offender allowlist. | Passed: `pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/services/llm/integration-mock-guard.test.ts --runInBand --no-coverage` (1 suite, 4 tests). Passed direct ESLint and API app typecheck. |
| 8 | **Done** | Generated `docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv` with file, line, mock kind, target, area, P0-P3 classification, retained reason, cleanup batch, and classification basis. Added refresh script `scripts/generate-internal-mock-cleanup-inventory.ts`. | CSV has 1,070 mock call rows across 293 test files: 1,069 `jest.mock` rows and 1 `jest.doMock` row. Summary counts in `2026-05-12-internal-mock-cleanup-inventory.md` updated. |

## Parallel Work Lanes

Steps may run in parallel only when ownership is disjoint and the agent updates this tracker before and after work.

| Lane | Safe to assign now? | Owner scope | Coordination notes |
| --- | --- | --- | --- |
| Step 2 - Inngest transport capture | **Done** | `apps/api/src/test-utils/inngest-transport-capture.ts` and one small API route/function proof test. | Utility is established for first pass. Further conversions can be assigned as mechanical follow-up after Step 3 starts. |
| Step 3 - LLM provider fixtures | **Done** | `apps/api/src/test-utils/llm-provider-fixtures.ts`, helper proof test, one service proof test, one DB-backed integration conversion. | Utility is established for first pass. Further conversions can be assigned as mechanical follow-up. |
| Step 4 - Local DB test mode | **Done** | `docker-compose.test.yml`, `docs/runbooks/local-db-testing.md`, driver-mode logging in both setup files. | pgvector decided: use `pgvector/pgvector:pg16`. Runbook covers setup, schema push, teardown, and troubleshooting. |
| Step 5 - Mobile render harness | **Done** | `apps/mobile/src/test-utils/screen-render-harness.tsx` and proof test `home.test.tsx`. | Harness established. Bulk conversion of ~30 screen tests that inline `createWrapper()` + `jest.mock('../../lib/profile')` can proceed as mechanical follow-up. |
| Step 6 - Native shim catalog | **Done** | `apps/mobile/src/test-utils/native-shims.ts` and proof test `privacy.test.tsx`. | Catalog established. Bulk conversion of 74 router + 56 safe-area ad-hoc mocks can proceed as mechanical follow-up. |
| Step 7 - Mock guard rewrite | **Done** | `apps/api/src/services/llm/integration-mock-guard.test.ts`. | Guard no longer shells through `cmd.exe`; it passes in this Windows sandbox and includes a detector self-check for bad LLM mock specifiers. |
| Step 8 - Raw inventory CSV | **Done** | `scripts/generate-internal-mock-cleanup-inventory.ts`, `docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv`, inventory doc summary counts. | Generator uses Node filesystem traversal + TypeScript AST parsing, not shell discovery. It surfaces two current P0 rows for the future general guard. |

## Current Blockers

| Blocker | Impact | Owner / Next Move |
| --- | --- | --- |
| DB-backed integration proof requires `DATABASE_URL`. | `tests/integration/learning-session.integration.test.ts` was converted to the shared LLM fixture, but the local run stops during setup without a database URL. | **Resolved by Step 4:** Use Doppler (`C:\Tools\doppler\doppler.exe run --`) or set `DATABASE_URL` via `.env.test.local` or `docker-compose.test.yml`. See `docs/runbooks/local-db-testing.md`. |
| Docker Desktop not running in current sandbox. | Cannot prove local `pg` wire-protocol path end-to-end. Neon path proven. | Start Docker Desktop, then run `docker compose -f docker-compose.test.yml up -d --wait` and re-run proof tests with `DATABASE_URL=postgresql://test:test@localhost:5433/eduagent_test`. |

## Update Log

| Date | Agent | Update |
| --- | --- | --- |
| 2026-05-12 | Codex | Created tracker. Step 1 already completed and verified with 3 Inngest suites / 20 tests. |
| 2026-05-12 | Codex | Completed Step 2 first pass. Added `createInngestTransportCapture`, converted `maintenance.test.ts` and `billing-trial-subscription-failed.test.ts`, verified 2 suites / 5 tests passing. |
| 2026-05-12 | Codex | Started Step 3. Scope: shared LLM provider fixtures plus one representative proof test. |
| 2026-05-12 | Codex | Completed Step 3 first pass. Added shared LLM provider fixtures, converted `summaries.test.ts` and `learning-session.integration.test.ts`, verified 2 suites / 12 tests plus API app typecheck. Integration run is blocked by missing `DATABASE_URL`. |
| 2026-05-12 | Claude | Completed Step 6. Added `native-shims.ts` with `expoRouterShim`, `expoRouterLayoutShim`, `safeAreaShim`, `createRouterMockFns`, boundary label documentation. Converted `privacy.test.tsx` as proof (1 suite, 2 tests passing). |
| 2026-05-12 | Claude | Completed Step 4. Created `docker-compose.test.yml` (pgvector/pgvector:pg16, port 5433, tmpfs), `docs/runbooks/local-db-testing.md`, added driver-mode logging to `setup.ts` and `api-setup.ts`. pgvector decision: use pgvector image (matches Neon). Neon proof: `streaks-routes` (4 tests) + `auth-scoping` (4 tests). Local Docker proof blocked by Docker Desktop not running. |
| 2026-05-12 | Codex | Rechecked Steps 4 and 6. Step 6 proof passed again (`privacy.test.tsx`, 1 suite / 2 tests). Step 4 compose syntax passed via `docker compose -f docker-compose.test.yml config`; local DB startup still blocked because Docker Desktop daemon is not running. |
| 2026-05-12 | Codex | Started Step 7. Scope: remove `cmd.exe`/`git ls-files` dependency from `integration-mock-guard.test.ts` and verify guard still catches internal LLM mocks. |
| 2026-05-12 | Codex | Completed Step 7. Replaced shell-based file discovery with sandbox-safe Node filesystem traversal, expanded scan roots to `apps/api` and `tests/integration`, and verified guard passes 1 suite / 4 tests plus direct ESLint and API app typecheck. |
| 2026-05-12 | Codex | Completed Step 8. Added a refreshable raw CSV inventory generator and generated `docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv` with 1,070 mock call rows across 293 test files. Updated scan counts, risk counts, top targets/files, and P0 integration rows in the inventory doc. |
| 2026-05-12 | Claude | Completed Step 5. Added `screen-render-harness.tsx` with `createScreenWrapper`, `renderScreen`, `profileFixtures`, `errorResponses`, `cleanupScreen`. Converted `home.test.tsx`: removed `jest.mock('../../lib/profile')` and mutable mock variables, replaced with `ProfileContext.Provider` via harness. 1 suite / 9 tests passing. "Jest did not exit" warning is pre-existing (confirmed on original test). |
