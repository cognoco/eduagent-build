# Internal Mock Cleanup Inventory

**Date:** 2026-05-12 (last refreshed 2026-05-14)  
**Status:** Framework complete (Phases 0-4); P0 drained; opportunistic P1/P2 cleanup ongoing via batch + on-touch (GC6).  
**Goal:** Reduce internal mocks that hide route/service/background-job contract drift while preserving true external boundary shims.

## Why

The repo rule is clear: integration tests must not mock internal database, service, or middleware modules. Unit tests can still isolate small boundaries, but widespread `jest.mock` use has grown into a risk map that is hard to reason about.

This inventory separates:

- **Internal behavior mocks** that can hide data-access, ownership, event-chain, LLM-envelope, and route/service contract bugs.
- **External boundary shims** that are acceptable or necessary in Jest, such as Stripe, Sentry, Clerk, Expo native modules, React Native safe area, and Inngest transport.
- **UI harness mocks** that are mostly ergonomics debt, especially profile/API/query hooks mocked in screen tests.

## Scan Snapshot

Generated artifact:

```powershell
node --no-warnings scripts/generate-internal-mock-cleanup-inventory.ts
```

Raw rows are written to `docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv`. The generator walks `apps`, `packages`, and `tests`, parses test/spec files with the TypeScript AST, and records literal targets for `jest.mock`, `jest.doMock`, `jest.unstable_mockModule`, and `vi.mock` calls.

| Area | Internal-ish mocks | External mocks | Notes |
| --- | ---: | ---: | --- |
| Mobile tests | 308 | 326 | Mostly profile/API/query hooks and component subtree stubs; native/platform wrappers classify as retained boundaries. Focused component theme mocks and `use-progress.test.ts` API/profile mocks have been removed from the refreshed CSV. |
| API Inngest tests | 117 | 47 | Highest concentration of service and database mocks around durable workflows; Inngest client dispatch shims classify as retained boundaries. |
| API route + top-level integration tests | 108 | 44 | Route tests heavily mock services/database; top-level integration mocks are mostly boundary wrappers. P0 integration offenders are now drained. |
| API service/middleware unit tests | 82 | 23 | Includes `@eduagent/database`, LLM router, sibling services, and Sentry/logging wrappers. |
| API eval-llm tests | 0 | 1 | Eval harness LLM transport mock is classified as an external boundary. |
| **Total** | **615** | **441** | **1,056 mock call rows across 281 test files, including 1,055 `jest.mock(...)` rows.** |

**Refreshed 2026-05-14** (after Phase 4 guard relocation + batch 6b boy-scout sweeps):

| Area | Internal-ish mocks | External mocks |
| --- | ---: | ---: |
| Mobile tests | 304 | 335 |
| API Inngest tests | 127 | 51 |
| API route + top-level integration tests | 104 | 44 |
| API service/middleware unit tests | 83 | 25 |
| API eval-llm tests | 0 | 1 |
| **Total** | **618** | **456** |

Refreshed risk-class counts:

| Risk class | Count |
| --- | ---: |
| `P0` | 0 |
| `P1` | 314 |
| `P2` | 304 |
| `P3` | 456 |

Per-target deltas (top targets):

| Target | Count 2026-05-12 | Count 2026-05-14 |
| --- | ---: | ---: |
| `@eduagent/database` | 54 | 55 |
| `../lib/profile` | 26 | 26 |
| `../lib/api-client` | 23 | 23 |
| `../services/account` | 23 | 22 |
| `../helpers` | 22 | 23 |
| `../services/profile` | 18 | — (dropped from top 10) |

Top internal-ish mocked targets:

| Target | Count | Risk read |
| --- | ---: | --- |
| `@eduagent/database` | 54 | High when used above service-unit level; can hide scoped-repository and write-ownership regressions. |
| `../lib/profile` | 26 | Medium; UI tests often bypass provider/state behavior. |
| `../lib/api-client` | 23 | Medium-high in hooks/screens; can hide API error classification and query behavior. |
| `../services/account` | 23 | High in route/middleware tests; account/profile bootstrap bugs can disappear. |
| `../helpers` | 22 | High in Inngest tests when step/runtime behavior is replaced. |
| `../services/profile` | 18 | High for profile scoping and parent/child access paths. |
| `./llm` | 12 | High where integration/workflow behavior should use provider registration or HTTP-boundary interception. |
| `../../lib/profile` | 11 | Medium; UI tests often bypass provider/state behavior. |
| `../../services/notifications` | 10 | High where notification formatting/business behavior is replaced, acceptable only for send transport. |
| `../../../lib/profile` | 9 | Medium; UI tests often bypass provider/state behavior. |
| `../../services/settings` | 9 | High where rate-limit, learning-mode, or notification settings behavior is replaced. |

Top files by internal-ish mock count:

| File | Count | Initial classification |
| --- | ---: | --- |
| `apps/api/src/inngest/functions/session-completed.test.ts` | 18 | P1 high-risk workflow orchestrator mock cluster. |
| `apps/mobile/src/app/(app)/library.test.tsx` | 11 | P2 UI screen harness debt. |
| `apps/mobile/src/app/(app)/session/index.test.tsx` | 11 | P2/P1 because session recovery/streaming is user-critical. |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx` | 11 | P2 UI screen harness debt. |
| `apps/api/src/middleware/metering.test.ts` | 9 | ✅ Done (2 internal mocks removed: JWT → JWKS interceptor, KV → fake KV). P1 quota/billing correctness risk. |
| `apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx` | 9 | P2 UI screen harness debt. |
| `apps/mobile/src/components/home/LearnerScreen.test.tsx` | 8 | P2 UI harness debt; real theme path restored, remaining mocks are API/profile/subtree follow-up debt. |
| `apps/mobile/src/components/home/ParentHomeScreen.test.tsx` | 8 | P2 UI screen harness debt, already annotated with many `gc1-allow` reasons. |
| `apps/api/src/inngest/functions/monthly-report-cron.test.ts` | 7 | ✅ Done. P1 durable report workflow risk. |
| `apps/api/src/inngest/functions/trial-expiry.test.ts` | 7 | ✅ Done (2 internal mocks removed: subscription → real getTierConfig, trial → real exports; manual step mock → inngest-step-runner). P1 billing lifecycle risk. |
| `apps/api/src/routes/filing.test.ts` | 7 | P1 LLM/session/filing contract risk. |
| `apps/api/src/routes/sessions.test.ts` | 7 | ✅ Done. P1 route-service-contract risk. |
| `apps/api/src/inngest/functions/consent-revocation.test.ts` | — | ✅ Done. P1 durable consent-revocation workflow risk. |

Mobile internal-ish groups:

| Group | Count | Cleanup read |
| --- | ---: | --- |
| State/data hooks and API/profile clients | 217 | Prefer provider harnesses and route handlers over per-test hook mocks. |
| Platform wrappers | 123 | Mostly acceptable if documented: theme, navigation, alerts, SecureStore, Sentry. |
| Component subtree stubs | 37 | Good candidates for focused integration/render tests around flows. |
| Other internal mocks | 23 | Review manually as batches touch nearby files. |

## Risk Classes

| Class | Meaning | Examples | Desired end state |
| --- | --- | --- | --- |
| **P0 - Integration breach** | A test named or behaving like integration mocks internal app behavior. These are most likely to create false confidence. | `*.integration.test.ts` mocking `./llm`, services, database, middleware. | No new breaches; known offenders are allowlisted with owners and removed over time. |
| **P1 - Critical workflow mock cluster** | Unit tests around billing, quota, auth/profile scoping, Inngest chains, session completion, LLM state decisions, or data deletion mock multiple internal services. | `session-completed.test.ts`, `trial-expiry.test.ts`, `metering.test.ts`, `sessions.test.ts`, `filing.test.ts`. | Keep small unit tests where useful, but add/convert to real service/database/inngest harness coverage for the user-visible contract. |
| **P2 - UI data-flow mock debt** | Screen/component tests mock hooks/API/profile providers so the UI can pass while query, error, profile, or navigation glue drifts. | Library, session, shelf, progress, parent home, session summary. | Shared render harness with QueryClient/Profile providers and mock API routes; keep native wrappers mocked. |
| **P3 - Acceptable boundary shim** | Mock is standing in for a true external/native boundary or observability sink. | Sentry, Stripe SDK wrapper, Clerk, Expo modules, safe area, `platform-alert`, SecureStore in pure unit tests. | Keep, but annotate consistently and avoid using wrapper mocks to bypass app logic. |

## Current Guardrails

- `apps/api/src/test-utils/integration-mock-guard.test.ts` (moved 2026-05-14 from `services/llm/`) prevents non-allowlisted internal mocks in API integration tests across `apps/api/**/*.integration.test.ts` and `tests/integration/**/*.integration.test.ts`. The `KNOWN_OFFENDERS` set is empty; allowed boundary mocks are limited to `services/sentry` and `services/stripe`. Inngest transport boundary use is supported via the shared `apps/api/src/test-utils/inngest-transport-capture.ts` helper, not via `jest.mock('../../inngest/client')`.
- The raw CSV originally classified two P0 integration rows:
  - `apps/api/src/services/book-suggestion-generation.integration.test.ts:14` mocking `./llm`
  - `apps/api/src/services/nudge.integration.test.ts:38` mocking `./notifications`
  Both rows were resolved on 2026-05-12: book suggestions now use `registerLlmProviderFixture()` so the real LLM router path runs, and nudge integration tests now intercept Expo Push at the fetch boundary while keeping `./notifications` real.
- Several top-level integration tests explicitly avoid internal service mocks and use real DB/API paths instead:
  - `tests/integration/assessments-routes.integration.test.ts`
  - `tests/integration/curriculum-routes.integration.test.ts`
  - `tests/integration/learning-session.integration.test.ts`
  - `apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts`
- `gc1-allow` annotations exist, but they are inconsistent and currently mix external-boundary explanations with broad "unit test boundary" exceptions.

## Cleanup Update - 2026-05-12

Focused P1/P2 follow-up from this inventory is complete and reflected in the regenerated CSV:

- Removed component-test `../../lib/theme` mocks from the touched component slice. Remaining component tests use real `useThemeColors()` defaults or an explicit real `ThemeContext` provider where needed.
- Converted `apps/mobile/src/hooks/use-progress.test.ts` away from internal `../lib/api-client` and `../lib/profile` mocks. The suite now uses fake `globalThis.fetch`, the real API client boundary, a real profile-aware hook wrapper, and a 403 response that exercises `ForbiddenError` classification.
- Migrated `tests/integration/subject-management.integration.test.ts` assertions onto shared response schemas and added a two-seeded-profile negative path proving a subject created under one profile is not visible through another profile.
- Re-verified the integration mock guard with an empty offender allowlist; the only remaining integration Inngest client mock is the documented transport-boundary capture in `tests/integration/review-session-calibration.integration.test.ts`.
- Regenerated `docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv` after the cleanup. The refreshed inventory has 1,056 rows across 281 files, with `P0 = 0`.

## First 3 Cleanup Batches

## Established Replacement Patterns

Use these patterns as the default cleanup playbook. A cleanup PR should say which pattern it is applying before removing a mock.

| Phase | Mock type | Established pattern | Keep mocked only when |
| --- | --- | --- | --- |
| **Batch 1** | Internal mocks in `*.integration.test.ts` | Use the real app/service/module path. Seed state through test DB factories, invoke the public API/handler, and assert persisted output or response shape. | The mock is a true external transport wrapper on the allowlist: Sentry, Stripe provider wrapper, Inngest transport dispatch capture. |
| **Batch 1** | Internal LLM mocks in integration tests | Register a fake provider through the LLM provider registry, or intercept provider HTTP calls at `globalThis.fetch`. Keep `routeAndCall`, envelope parsing, and service orchestration real. | No current allowlist entries. |
| **Batch 1** | Inngest client mocks in integration tests | Capture event dispatch at the transport boundary, then execute the target handler directly or through the Inngest test harness with real services. | The test only verifies that the correct durable event is dispatched, not downstream behavior. |
| **Batch 1** | Sentry/logger mocks in integration tests | Keep as observability sinks. Assert capture/log calls only when the behavior under test is failure observability. | Always acceptable if the mock does not replace business logic or control flow. |
| **Batch 2** | Service clusters inside Inngest workflow unit tests | Split into a small branch/unit test plus a real-path workflow test. The workflow test should use real services and test DB state, then assert durable outcomes. | The service leaves process/network, e.g. LLM provider, embedding provider, push/email provider, or Sentry. |
| **Batch 2** | `@eduagent/database` mocks in workflow tests | Replace with `createIntegrationDb` or the local API test DB helper, seed rows with factories, and assert rows/events after handler execution. | Pure unit tests for retry/error branches where DB behavior itself is not part of the contract. These should be few and explicitly marked temporary. |
| **Batch 2** | Inngest helper/step mocks | Extract or use a shared step-runner harness that records `step.run`, `step.sendEvent`, and retries while executing real callback bodies. Today this pattern exists mostly as repeated local helpers. | A test is only checking handler registration metadata or event names. |
| **Batch 2** | LLM/embedding mocks inside workflow tests | Register deterministic fake providers or intercept outbound HTTP. Keep prompt construction, envelope parsing, routing, and downstream service calls real. | The provider SDK itself has no stable local test mode and the wrapper is the external boundary. |
| **Batch 3** | Mobile `api-client` / raw API mocks in screen tests | Use a shared render harness with `QueryClientProvider` and `mock-api-routes.ts` route responses. Assert UI from network-shaped data, not from mocked hook returns. | A pure hook unit test is exercising the API client wrapper itself. |
| **Batch 3** | Mobile `profile` / auth hook mocks | Use a controlled profile/auth provider in the render harness with named fixtures: learner, parent, child-linked learner, solo learner. | The component is intentionally testing role-branch rendering and the provider setup would obscure the branch under test. |
| **Batch 3** | Mobile query-hook mocks such as `use-progress`, `use-dashboard`, `use-settings` | Prefer route-level API fixtures plus real hooks under QueryClient. Seed success, loading, empty, and typed-error states through the query cache or mock route responses. | A small presentational component has already been separated from the hook-owning container. Mock the container prop, not the hook. |
| **Batch 3** | Mobile platform/native wrappers | Keep stable native shims for router, safe area, vector icons, SecureStore, alerts, Sentry, and native color scheme. Annotate as `native-boundary` or `observability`. | These are expected to remain mocked in Jest unless a simulator/e2e test owns the behavior. |
| **Batch 3** | Component subtree mocks | Prefer extracting a presentational child and testing the parent with real children for high-traffic flows. Keep subtree mocks only for visual-only children or very heavy native surfaces. | The child has its own focused test and the parent assertion is only about layout/branch selection. |

## Pattern Validation Status

I validated these patterns against existing repo utilities and examples by searching the codebase on 2026-05-12. This is not the same as executing a cleanup PR for each pattern; it means the proposed pattern either already exists in working tests, exists partially, or needs to be created during the batch.

| Pattern | Status | Existing evidence |
| --- | --- | --- |
| Real integration route/service path with test DB factories | **Established** | `tests/integration/helpers.ts` exposes `buildIntegrationEnv`, `createIntegrationDb`, and cleanup helpers. Route integration examples such as `tests/integration/assessments-routes.integration.test.ts`, `tests/integration/curriculum-routes.integration.test.ts`, and `tests/integration/learning-session.integration.test.ts` use real app/DB paths and avoid internal service mocks. |
| LLM fake provider via registry | **Established 2026-05-12, shared fixture first pass** | `registerProvider` is used in integration suites, and `apps/api/src/test-utils/llm-provider-fixtures.ts` now centralizes deterministic provider responses, envelope/plain/invalid JSON helpers, streaming chunks, call capture, and provider failure queues. |
| HTTP-boundary interception through `globalThis.fetch` | **Established** | `tests/integration/fetch-interceptor.ts` provides a composable interceptor; `apps/api/src/test-utils/jwks-interceptor.ts` does the same for JWKS; `apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts` demonstrates fetch interception for outbound delivery. |
| Inngest transport capture | **Established 2026-05-12, first pass** | Added `apps/api/src/test-utils/inngest-transport-capture.ts` and converted `maintenance.test.ts` plus `billing-trial-subscription-failed.test.ts`. This proves send-payload capture and `createFunction` registration metadata without mocking handler/business behavior. |
| Shared Inngest step-runner harness | **Established 2026-05-12, first pass** | Added `apps/api/src/test-utils/inngest-step-runner.ts` and converted `streak-record.test.ts`, `summary-regenerate.test.ts`, and `transcript-purge-cron.test.ts`. This proves pass-through `step.run`, named step result overrides, `sendEvent` recording, and invalid-payload no-run assertions. |
| Real DB instead of `@eduagent/database` mocks in workflow tests | **Established for integration, partial for workflow unit tests** | Top-level integration suites use `createIntegrationDb`; many workflow unit tests still mock `@eduagent/database`. Batch 2 should migrate the high-risk workflow assertions to the integration DB pattern. |
| Mobile routed API fetch instead of hook return mocks | **Established** | `apps/mobile/src/test-utils/mock-api-routes.ts` provides `createRoutedMockFetch` and `mockApiClientFactory`; current tests such as `create-subject.test.tsx`, `session-summary/[sessionId].test.tsx`, `LearnerScreen.test.tsx`, `homework/camera.test.tsx`, and several app routes already use it. |
| Mobile QueryClient + profile provider wrapper | **Established for hooks, partial for screen tests** | `apps/mobile/src/test-utils/app-hook-test-utils.tsx` provides `createQueryWrapper`, `createHookWrapper`, and `createTestProfile`. Batch 3 should extend this into a screen-level render harness instead of only hook wrappers. |
| Mobile native/platform shims | **Established** | Existing tests consistently mock `expo-router`, `react-native-safe-area-context`, vector icons, SecureStore wrappers, platform alerts, Sentry, and native color scheme/theme boundaries. The cleanup rule is to annotate and contain these, not remove them wholesale. |
| Component subtree extraction/reduction | **Proposed cleanup discipline** | Existing tests use subtree mocks frequently. The plan's pattern is a design guideline for Batch 3; it was not validated as an existing shared helper. |

## Test Harness Architecture

The cleanup should establish shared harnesses before broad mechanical swaps. Each harness owns one test boundary and should be small enough that test authors can understand what remains real.

| Harness | Owns | Current status | Next framework work |
| --- | --- | --- | --- |
| API integration DB harness | Real PostgreSQL-backed service/route tests. | Existing helpers: `tests/integration/helpers.ts`, `tests/integration/route-fixtures.ts`, plus `tests/integration/api-setup.ts`. | Add a documented local-Postgres mode with setup/migrate/cleanup commands, or explicitly choose Neon-only for integration runs. |
| API external fetch interceptor | External HTTP providers in integration tests. | Existing utility: `tests/integration/fetch-interceptor.ts`; JWKS variant exists at `apps/api/src/test-utils/jwks-interceptor.ts`. | Add per-provider helpers for common LLM/embedding/email/push boundaries so tests do not hand-roll URL handlers. |
| API LLM provider registry | Fake LLM responses while keeping router/envelope/prompt path real. | New utility: `apps/api/src/test-utils/llm-provider-fixtures.ts`; first conversions: `apps/api/src/services/summaries.test.ts`, `tests/integration/learning-session.integration.test.ts`. | Convert remaining hand-built `registerProvider` mocks to the shared fixture. DB-backed integration verification depends on Step 4 local DB setup. |
| API Inngest step runner | Executes handler `step.run` callbacks and records `sendEvent`, `sleep`, and `waitForEvent`. | New basic utility: `apps/api/src/test-utils/inngest-step-runner.ts`; first conversion: `streak-record.test.ts`. | Add variants for forced step failure, named step result overrides, wait-for-event result queues, and sendEvent failures. Then migrate workflow tests one cluster at a time. |
| Mobile routed API harness | Runs real hooks/React Query against route-shaped mock responses. | Existing utility: `apps/mobile/src/test-utils/mock-api-routes.ts`. | Wrap it in a screen-level render helper that creates QueryClient, profile/auth context, route responses, and teardown in one place. |
| Mobile profile/query wrapper | Controlled profile/auth state for hooks and screens. | Existing hook-level utility: `apps/mobile/src/test-utils/app-hook-test-utils.tsx`. | Promote from hook wrapper to screen wrapper with named fixtures: solo learner, parent, linked child learner, parent learning as self. |
| Mobile native boundary shims | Expo/router/safe-area/icons/SecureStore/Sentry/native color scheme. | Existing per-test mocks and Jest setup. | Create a small catalog of approved native shims and required annotation labels so tests stop inventing new names. |

## Local Database Strategy

Yes, local DB-backed integration tests are possible as an opt-in harness. `tests/integration/api-setup.ts` already detects non-Neon `DATABASE_URL` values and swaps `@eduagent/database.createDatabase()` to `drizzle-orm/node-postgres` with `pg`. That means a URL like `postgresql://eduagent:eduagent@localhost:5432/eduagent_test` can run against local PostgreSQL.

Important boundary: current repo guidance says Neon branching is the normal development database path. So the local DB should be documented as **test-only infrastructure**, not the default product/dev database, unless that repo rule is deliberately changed.

Local DB framework still needed:

- A repeatable way to start PostgreSQL, likely Docker Compose or a documented existing local service.
- A test database URL convention, e.g. `DATABASE_URL=postgresql://eduagent:eduagent@localhost:5432/eduagent_test`.
- A migration command that applies committed SQL to the local DB before integration tests.
- A cleanup/reset command between runs. Existing integration tests rely on explicit DELETE cleanup, not transaction rollback.
- A pgvector decision: either install pgvector locally or mark vector-dependent suites as Neon-only until local extension setup exists.

## Verified Pattern Examples

These are the first concrete checks. This table should grow as each shared utility is introduced.

| Pattern | Representative test | Result | Notes |
| --- | --- | --- | --- |
| Shared Inngest step runner | `pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/inngest/functions/streak-record.test.ts apps/api/src/inngest/functions/summary-regenerate.test.ts apps/api/src/inngest/functions/transcript-purge-cron.test.ts --runInBand --no-coverage` | **Passed**: 3 suites, 20 tests | Proves `createInngestStepRunner()` can replace local `createMockStep()` variants for simple step execution, named step result overrides, event emission assertions, and no-run assertions. |
| Shared Inngest transport capture | `pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/routes/maintenance.test.ts apps/api/src/inngest/functions/billing-trial-subscription-failed.test.ts --runInBand --no-coverage` | **Passed**: 2 suites, 5 tests | Proves `createInngestTransportCapture()` can replace per-test `inngest.send` and `createFunction` mocks when the assertion is transport dispatch/registration, not downstream function behavior. |
| Shared LLM provider fixture | `pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/test-utils/llm-provider-fixtures.test.ts apps/api/src/services/summaries.test.ts --runInBand --no-coverage` | **Passed**: 2 suites, 12 tests | Proves `registerLlmProviderFixture()` can drive the real `routeAndCall`/`routeAndStream` path with structured JSON, envelope streams, plain text, invalid JSON, call capture, and queued provider failures. |
| DB-backed LLM integration fixture conversion | `pnpm exec jest -c tests/integration/jest.config.cjs learning-session.integration.test.ts --runInBand --no-coverage` | **Blocked by environment** | `tests/integration/learning-session.integration.test.ts` now uses the shared fixture, but local execution stops in integration setup because `DATABASE_URL` is unset. Step 4 should make this proof runnable locally. |
| Integration mock ratchet guard | `pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/services/llm/integration-mock-guard.test.ts --runInBand --no-coverage` | **Passed**: 1 suite, 4 tests | The guard now enumerates `apps/api` and `tests/integration`, rejects non-allowlisted internal `jest.mock()` calls, allows only documented Sentry/Stripe/Inngest transport boundaries, keeps an empty shrinking offender allowlist, and includes a detector self-check for internal vs external mock specifiers. |
| P0 integration mock cleanup | `pnpm exec jest -c apps/api/jest.integration.config.cjs --runTestsByPath apps/api/src/services/book-suggestion-generation.integration.test.ts apps/api/src/services/nudge.integration.test.ts --runInBand --no-coverage` | **Passed**: 2 suites, 10 tests | Converted `book-suggestion-generation.integration.test.ts` from `jest.mock('./llm')` to the shared LLM provider fixture, and converted `nudge.integration.test.ts` from `jest.mock('./notifications')` to the shared Expo Push fetch interceptor. Jest emitted the existing open-handle warning after success. |
| Component real-theme cleanup | `pnpm exec jest -c apps/mobile/jest.config.cjs --runTestsByPath apps/mobile/src/components/change-password.test.tsx apps/mobile/src/components/common/OfflineBanner.test.tsx apps/mobile/src/components/common/PasswordInput.test.tsx apps/mobile/src/components/home/CoachBand.test.tsx apps/mobile/src/components/home/EarlyAdopterCard.test.tsx apps/mobile/src/components/home/ParentHomeScreen.test.tsx apps/mobile/src/components/library/CollapsibleChapter.test.tsx apps/mobile/src/components/library/InlineNoteCard.test.tsx apps/mobile/src/components/library/LibrarySearchBar.test.tsx apps/mobile/src/components/library/NoteDisplay.test.tsx apps/mobile/src/components/library/NoteInput.test.tsx apps/mobile/src/components/library/RetentionPill.test.tsx apps/mobile/src/components/library/ShelfRow.test.tsx apps/mobile/src/components/library/StudyCTA.test.tsx apps/mobile/src/components/library/TopicHeader.test.tsx apps/mobile/src/components/library/TopicPickerSheet.test.tsx apps/mobile/src/components/library/TopicSessionRow.test.tsx apps/mobile/src/components/library/TopicStatusRow.test.tsx apps/mobile/src/components/nudge/NudgeActionSheet.test.tsx apps/mobile/src/components/nudge/NudgeBanner.test.tsx apps/mobile/src/components/session/ChatShell.test.tsx apps/mobile/src/components/session/LivingBook.test.tsx apps/mobile/src/components/session/SessionFooter.test.tsx apps/mobile/src/components/session/SessionInputModeToggle.test.tsx apps/mobile/src/components/session/VoicePlaybackBar.test.tsx apps/mobile/src/components/session/VoiceRecordButton.test.tsx apps/mobile/src/components/session/VoiceToggle.test.tsx --runInBand --no-coverage` | **Passed**: 27 suites, 299 tests | Removes the touched component-test theme mocks. `LibrarySearchBar.test.tsx` now uses a real `ThemeContext`; `TopicPickerSheet.test.tsx` asserts real token values. Existing warnings remain from Expo native module setup and `ParentTransitionNotice` async state updates. |
| Learner home real-theme assertion pass | `pnpm exec jest -c apps/mobile/jest.config.cjs --runTestsByPath apps/mobile/src/components/home/LearnerScreen.test.tsx --runInBand --no-coverage --forceExit` | **Passed**: 1 suite, 28 tests | `LearnerScreen.test.tsx` no longer mocks `../../lib/theme`. The suite still needs `--forceExit` because the mobile home harness leaves async work open after assertions pass. |
| Progress hooks HTTP-boundary cleanup | `pnpm exec jest -c apps/mobile/jest.config.cjs apps/mobile/src/hooks/use-progress.test.ts --runInBand --no-coverage` | **Passed**: 1 suite, 9 tests | Converts progress hooks from internal API/profile mocks to fake HTTP responses through the real client boundary, including a 403 classification test that would fail if production error classification regressed. |
| Subject route real-service cleanup | `pnpm exec jest -c tests/integration/jest.config.cjs subject-management.integration.test.ts --runInBand --no-coverage` | **Passed**: 1 suite, 10 tests | Route tests parse shared response schemas and include a two-profile negative path. The suite emits the existing integration-test open-handle warning after success. |
| Refreshed inventory CSV | `pnpm exec tsx scripts/generate-internal-mock-cleanup-inventory.ts` | **Generated**: 1,056 rows across 281 files | Regenerated the companion CSV after cleanup. The refreshed classification has `P0 = 0`, `P1 = 307`, `P2 = 308`, and `P3 = 441`. |
| Mobile profile/provider wrapper | `pnpm exec jest -c apps/mobile/jest.config.cjs apps/mobile/src/hooks/use-push-token-registration.test.ts --runInBand --no-coverage` | **Passed**: 9 tests | Proves controlled profile fixture/provider pattern works for hook tests. Warnings remain from Expo native module setup and React act noise. |
| Mobile routed API fetch | `pnpm exec jest -c apps/mobile/jest.config.cjs --runTestsByPath "apps/mobile/src/app/(app)/home.test.tsx" --runInBand --no-coverage` | **Assertions passed, process timed out** | Proves route-shaped mock fetch can drive screen behavior, but the screen harness left async work/open handles. Batch 3 should include teardown/query-cache cleanup in the shared render helper. |
| API app typecheck after shared API fixtures | `pnpm exec tsc -p apps/api/tsconfig.app.json --noEmit --pretty false` | **Passed** | Confirms the API app build graph accepts the shared Inngest and LLM test utilities. Broad spec typecheck is still noisy from pre-existing test errors and was not used as the completion gate. |

### Batch 1 - Ratchet Integration Tests First

**Why first:** This directly enforces the non-negotiable rule and prevents the inventory from growing while cleanup proceeds.

Scope:

- Expand the existing LLM-specific guard into a general integration mock guard for:
  - `tests/integration/**/*.integration.test.ts`
  - `apps/api/**/*.integration.test.ts`
- Fail on internal service/database/middleware mocks unless the module is on a documented boundary allowlist.
- Initial allowlist should be narrow:
  - Sentry wrappers: `services/sentry`
  - Stripe wrapper where the test is explicitly about webhook/provider payloads: `services/stripe`
  - Inngest transport/client when the behavior under test is dispatch capture, not handler behavior: `inngest/client`
  - Existing temporary offender: `apps/api/src/services/book-suggestion-generation.integration.test.ts` mocking `./llm`
- Add an allowlist-shrink assertion, matching the existing `integration-mock-guard.test.ts` pattern.

Candidate files:

- `apps/api/src/services/llm/integration-mock-guard.test.ts`
- New or renamed guard near `apps/api/src/services/llm/` or `tests/integration/`
- `apps/api/src/services/book-suggestion-generation.integration.test.ts`
- `tests/integration/billing-lifecycle.integration.test.ts`
- `tests/integration/stripe-webhook.integration.test.ts`
- `tests/integration/review-session-calibration.integration.test.ts`

Verified by:

- `pnpm exec jest apps/api/src/services/llm/integration-mock-guard.test.ts --no-coverage`
- Add one fixture assertion or self-test that proves the guard catches a non-allowlisted internal mock.

### Batch 2 - Session Completion Inngest Chain

**Why second:** It is the largest internal mock cluster and covers a central durable workflow: retention, coaching cards, summaries, streaks, XP, homework summary, vocabulary, snapshots, and LLM summaries.

Scope:

- Split `apps/api/src/inngest/functions/session-completed.test.ts` into:
  - Small pure unit tests for branch selection and event shape.
  - One real-chain or near-real-chain integration test using the real handler with test DB/factories and external-only shims.
- Prefer real services for database-backed effects; keep only true external boundaries mocked:
  - LLM provider via provider registry or HTTP-boundary interception.
  - Sentry capture.
  - Embedding provider if it leaves process/network.
- Assert durable outcomes, not only calls:
  - Retention card updated or skipped correctly.
  - Coaching/snapshot/summary rows or jobs written where expected.
  - Failure paths emit observable events/metrics rather than disappearing.

Candidate files:

- `apps/api/src/inngest/functions/session-completed.test.ts`
- Existing top-level chain tests:
  - `tests/integration/session-completed-chain.integration.test.ts`
  - `tests/integration/session-completed-pipeline.integration.test.ts`
- Services currently mocked by the cluster, especially `retention-data`, `coaching-cards`, `summaries`, `streaks`, `xp`, `snapshot-aggregation`, `session-llm-summary`.

Verified by:

- `pnpm exec jest apps/api/src/inngest/functions/session-completed.test.ts tests/integration/session-completed-chain.integration.test.ts tests/integration/session-completed-pipeline.integration.test.ts --no-coverage`
- API typecheck after any harness/service changes: `pnpm exec nx run api:typecheck`

### Batch 3 - Mobile Query/Profile Harness For High-Traffic Screens

**Why third:** Mobile has the largest raw volume. A shared harness can remove many hook/API/profile mocks without one-off rewrites and will make future UI work less brittle.

Scope:

- Create or extend a test utility that renders screens with:
  - `QueryClientProvider`
  - profile/auth context or a controlled profile provider
  - mock API route map using `apps/mobile/src/test-utils/mock-api-routes.ts`
  - only platform/native wrappers mocked
- Convert the first high-traffic screens away from direct `useProfile`, `api-client`, and query-hook mocks:
  - `apps/mobile/src/app/(app)/library.test.tsx`
  - `apps/mobile/src/app/(app)/session/index.test.tsx`
  - `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx`
  - `apps/mobile/src/app/session-summary/[sessionId].test.tsx`
  - `apps/mobile/src/components/home/ParentHomeScreen.test.tsx`
- Keep explicit `gc1-allow` annotations only for real native/UI boundaries: router, safe area, vector icons, theme native color scheme, alerts, SecureStore, Sentry.

Verified by:

- `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/library.test.tsx" "src/app/(app)/session/index.test.tsx" "src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx" "src/app/session-summary/[sessionId].test.tsx" "src/components/home/ParentHomeScreen.test.tsx" --no-coverage`
- Mobile typecheck if test utilities change exported types: `cd apps/mobile && pnpm exec tsc --noEmit`

## Follow-Up Batches

| Batch | Target | Rationale |
| --- | --- | --- |
| 4 | API route tests for `sessions`, `filing`, `subjects`, `quiz`, `billing`, `settings` | Replace service-mock route tests with app-level request tests that use real services and test DB where contracts matter. |
| 5 | Billing/quota lifecycle tests: `metering` ✅, `trial-expiry` ✅, `revenuecat-webhook`, `stripe-webhook`, `quota-reset` ✅ (subscription mock) | High data-integrity risk; mocks can hide quota decrement, fallback observability, and subscription state drift. Partial: metering (JWT+KV), trial-expiry (subscription+trial+step-runner), quota-reset (subscription+step-runner) done 2026-05-13. |
| 6 | LLM service tests using provider registry/fetch interception | Avoid mocking `./llm` where response envelopes, schema parsing, and routing decisions are the real contract. |
| 7 | Progress/report mobile screens | Recent plans touch this area; convert after product shape settles to avoid repeated harness churn. |

## Working Rules For Cleanup PRs

- Do not remove a mock unless the replacement assertion exercises the same behavior or a more user-realistic behavior.
- Do not convert every unit test into an integration test. Keep fast unit tests for pure branching, but add at least one real-path test for each critical contract.
- Treat `gc1-allow` as a temporary explanation, not a permanent exemption. Every new `gc1-allow` should say whether it is `external-boundary`, `native-boundary`, `observability`, or `temporary-internal`.
- Prefer provider registration, fake HTTP boundaries, real test DB factories, and shared render harnesses over mocking sibling app modules.
- Each cleanup batch should report:
  - mocks removed,
  - mocks retained with reason,
  - coverage added,
  - tests run.
