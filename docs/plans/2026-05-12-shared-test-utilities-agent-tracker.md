# Shared Test Utilities Agent Tracker

**Status:** Active  
**Purpose:** Small coordination plan for agents implementing the shared test utility framework.  
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
| 3 | **In Progress** | Add API LLM provider fixture helpers around `registerProvider`: valid envelope, invalid envelope, plain text, streaming, provider failure. Convert one LLM integration offender or one route integration test to use fixture. | One representative LLM test passes without `jest.mock('./llm')` or equivalent internal LLM mock. |
| 4 | **Pending** | Document and prove API local DB test mode. Use existing `tests/integration/api-setup.ts` non-Neon `DATABASE_URL` support. Decide pgvector handling. | One DB-backed integration test runs against explicit local or Neon test DB. If local DB is unavailable, record blocker and exact setup needed. |
| 5 | **Pending** | Add mobile screen render harness combining QueryClient, profile/auth fixtures, routed API fetch, teardown. Convert one screen test. | One screen test passes and Jest exits cleanly, with no open-handle timeout. |
| 6 | **Done** | Add mobile native boundary shim catalog and labels. Files: `apps/mobile/src/test-utils/native-shims.ts`, `apps/mobile/src/app/privacy.test.tsx` (proof conversion). Catalog exports `expoRouterShim`, `expoRouterLayoutShim`, `safeAreaShim`, `createRouterMockFns`, boundary label documentation. | Passed: `pnpm exec jest -c apps/mobile/jest.config.cjs --runTestsByPath "apps/mobile/src/app/privacy.test.tsx" --runInBand --no-coverage` (1 suite, 2 tests). |
| 7 | **Pending** | Rewrite integration mock guard to avoid shelling out through `cmd.exe`. It currently fails in sandbox on `execSync('git ls-files ...')`. | Guard test passes in this Windows sandbox and still catches new internal integration mocks. |
| 8 | **Pending** | Generate raw mock inventory CSV with file, target, area, classification, retained reason, cleanup batch. | CSV generated and summary counts in `2026-05-12-internal-mock-cleanup-inventory.md` updated. |

## Parallel Work Lanes

Steps may run in parallel only when ownership is disjoint and the agent updates this tracker before and after work.

| Lane | Safe to assign now? | Owner scope | Coordination notes |
| --- | --- | --- | --- |
| Step 2 - Inngest transport capture | **Done** | `apps/api/src/test-utils/inngest-transport-capture.ts` and one small API route/function proof test. | Utility is established for first pass. Further conversions can be assigned as mechanical follow-up after Step 3 starts. |
| Step 3 - LLM provider fixtures | **Yes** | New helper under `apps/api/src/test-utils/` or `tests/integration/`; one LLM integration proof test. | Coordinate with Step 7 if touching mock guards. Do not edit Inngest transport utility. |
| Step 4 - Local DB test mode | **Yes** | Docs/runbook plus integration DB setup helpers. Likely files: `tests/integration/api-setup.ts`, integration docs, maybe package scripts. | Must decide pgvector handling. Do not change production database client behavior. |
| Step 5 - Mobile render harness | **Yes** | `apps/mobile/src/test-utils/` and one screen proof test. | Coordinate with Step 6 on native shim labels. Do not rewrite many screen tests yet. |
| Step 6 - Native shim catalog | **Done** | `apps/mobile/src/test-utils/native-shims.ts` and proof test `privacy.test.tsx`. | Catalog established. Bulk conversion of 74 router + 56 safe-area ad-hoc mocks can proceed as mechanical follow-up. |
| Step 7 - Mock guard rewrite | **Later / careful** | Guard test implementation and inventory generation logic. | Best after Step 2/3 vocabulary is stable. Must avoid shelling through `cmd.exe`. |
| Step 8 - Raw inventory CSV | **Later** | Generated inventory script/output. | Best after classification labels are stable. |

## Current Blockers

| Blocker | Impact | Owner / Next Move |
| --- | --- | --- |
| API app typecheck has unrelated pre-existing error in `apps/api/src/services/quiz/orchestrate-round.ts` missing `activityType`. | Cannot use full API typecheck as clean proof for utility-only changes. | Keep running targeted Jest proofs until that type error is fixed. |
| Integration mock guard shells out via `cmd.exe` and failed with `EPERM` in sandbox. | Cannot verify guard pattern in current environment. | Step 7 rewrites guard to use Node filesystem enumeration or approved command path. |
| Local DB mode is partially supported but not fully documented/proven. | DB-backed cleanup cannot be made local-first yet. | Step 4 defines setup/migration/reset flow and pgvector decision. |

## Update Log

| Date | Agent | Update |
| --- | --- | --- |
| 2026-05-12 | Codex | Created tracker. Step 1 already completed and verified with 3 Inngest suites / 20 tests. |
| 2026-05-12 | Codex | Completed Step 2 first pass. Added `createInngestTransportCapture`, converted `maintenance.test.ts` and `billing-trial-subscription-failed.test.ts`, verified 2 suites / 5 tests passing. |
| 2026-05-12 | Codex | Started Step 3. Scope: shared LLM provider fixtures plus one representative proof test. |
| 2026-05-12 | Claude | Completed Step 6. Added `native-shims.ts` with `expoRouterShim`, `expoRouterLayoutShim`, `safeAreaShim`, `createRouterMockFns`, boundary label documentation. Converted `privacy.test.tsx` as proof (1 suite, 2 tests passing). |
