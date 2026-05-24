# Internal Mock Cleanup Inventory

**Date:** 2026-05-12 (last refreshed 2026-05-24)
**Status:** Framework complete (Phases 0-4); P0 drained; bare-mock backlog collapsed from 131 → 23 between 2026-05-19 and 2026-05-24 via successive sweeps. Wave 3 (2026-05-24) hit the top-20 most-edited test files — they were already mostly clean.

> **Note (2026-05-23):** Inventory counts in this file are point-in-time snapshots. Regenerate with `pnpm exec tsx scripts/generate-internal-mock-cleanup-inventory.ts` for current state.
**Goal:** Reduce internal mocks that hide route/service/background-job contract drift while preserving true external boundary shims.

## Why

The repo rule is clear: integration tests must not mock internal database, service, or middleware modules. Unit tests can still isolate small boundaries, but widespread `jest.mock` use has grown into a risk map that is hard to reason about.

This inventory separates:

- **Internal behavior mocks** that can hide data-access, ownership, event-chain, LLM-envelope, and route/service contract bugs.
- **External boundary shims** that are acceptable or necessary in Jest, such as Stripe, Sentry, Clerk, Expo native modules, React Native safe area, and Inngest transport.
- **UI harness mocks** that are mostly ergonomics debt, especially profile/API/query hooks mocked in screen tests.

## Reality Drift 2026-05-19

The W1-W17 Notion bug-fix swarm (commit `1391d7490`) and Wave 2 coverage hardening (`3be793934`, `823824083`) landed many new break tests on `test-coverage-hardening`. Net effect on this inventory:

- Total mock rows: **1,056 → 1,264** (+208 rows, +41 new test files).
- Internal-ish mocks: **618 → 718** (+100). P1 grew by 31, P2 by 69.
- The integration mock guard (`apps/api/src/test-utils/integration-mock-guard.test.ts`) is still green — `P0 = 0`. Forward-only ratchet held.

### Annotation Status Audit (2026-05-24, post-Wave-3)

The inventory generator was extended to record an `annotation` column distinguishing already-converted mocks from true forward-only risks. Of the **705 internal-ish mock rows**:

| Annotation status | Count | Meaning |
| --- | ---: | --- |
| `gc1-allow` | 343 | Annotated with a boundary label (`external-boundary`, `transport-boundary`, etc.) but not factored via `requireActual`. Mostly route/middleware tests where the target is a DB-shaped or service-shaped boundary the test legitimately replaces. |
| `pattern-a; gc1-allow` | 293 | `jest.requireActual('<target>')` + `gc1-allow:` label — fully converted. |
| `pattern-a` | 46 | `requireActual` used but no explicit `gc1-allow:` label. Cosmetic gap; should be annotated. |
| **`bare`** | **23** | **True forward-only risk — no annotation, no `requireActual`. Down from 131 (2026-05-19) → 23 (2026-05-24).** |

Implication: of the 23 remaining bare mocks, **15 live in a single file** (`apps/mobile/src/app/_layout.test.tsx`). The other 8 are spread across 7 files with 1-2 each. **The real cleanup queue is now one file, then long-tail singletons.**

> Pre-fix snapshot (2026-05-19, before generator regex fix): the first pass reported 180 bare mocks because the `gc1-allow` detection regex used `$` without the `m` flag, so trailing-line-comment annotations on `jest.mock(...)` calls were not matched. After fixing the regex (commit pending), 49 false-bare entries reclassified to `gc1-allow`. Always trust the regenerated post-fix snapshot.

### Top Files with BARE Mocks (refreshed 2026-05-24, post-Wave-3)

| File | Bare count | Notes |
| --- | ---: | --- |
| `apps/mobile/src/app/_layout.test.tsx` | 15 | **Single-file concentration — 65% of remaining bare backlog.** Root layout test mocks the app-shell modules directly. Next sweep target. |
| `apps/mobile/src/app/session-summary/[sessionId].test.tsx` | 2 | Session summary screen. |
| `apps/mobile/src/app/(app)/dictation/playback.test.tsx` | 1 | Dictation playback. |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx` | 1 | One residual bare mock; rest already converted. |
| `apps/mobile/src/app/create-profile.test.tsx` | 1 | Profile creation flow. |
| `apps/mobile/src/app/session-transcript/[sessionId].test.tsx` | 1 | Session transcript. |
| `apps/mobile/src/components/family/AddToMyLearningButton.test.tsx` | 1 | Family add-to-learning button. |
| `apps/mobile/src/hooks/use-network-status.test.ts` | 1 | Network status hook. |

The bare backlog is **entirely mobile** and dominated by one file. Cleaning `apps/mobile/src/app/_layout.test.tsx` would drop the backlog from 23 → 8. The new `apps/mobile/src/test-utils/screen-render.tsx` harness (built in Wave 2) is the canonical replacement pattern for these conversions.

### Wave 1 (2026-05-19) — Outcomes

Five parallel agents audited the previously-named top API files. Net result:

| File | Mocks removed | Annotations added | Real change |
| --- | ---: | ---: | --- |
| `apps/api/src/inngest/functions/session-completed.test.ts` | 0 | 1 | Already pattern-A clean; one missing `gc1-allow` annotation added. 98/98 pass. |
| `apps/api/src/inngest/functions/monthly-report-cron.test.ts` | 0 | 0 | Already fully annotated. 46/46 pass. The +1 mock vs 2026-05-14 was a new mock added with `gc1-allow` intact. |
| `apps/api/src/inngest/functions/email-digest-channel.test.ts` | 0 | 2 (label corrections) | Already pattern-A clean; two labels updated (`sentry`=observability, `client`=transport-boundary). 31/31 pass. |
| `apps/api/src/routes/filing.test.ts` | 1 (`../services/llm`) | 0 | Converted LLM mock to `registerLlmProviderFixture`. 12/12 pass. |
| `apps/api/src/routes/progress.test.ts` | 0 | 0 | Already pattern-A clean from the W1-W17 swarm. 41/41 pass. |

Takeaway: forward-only ratchets and swarm author discipline are working on the API side. The remaining real cleanup is **mobile bare mocks**, replaced via the now-established `screen-render.tsx` harness (U7).

### Wave 2 (2026-05-19) — Outcomes

Five parallel agents on mobile bare-mock files. Net result:

| File | Bare removed | Pattern-A converted | Retained boundary | Test result |
| --- | ---: | ---: | ---: | --- |
| `apps/mobile/src/test-utils/screen-render.tsx` | — | — | — | **New harness** (U7) — `renderScreen`, `cleanupScreen`, `NAMED_PROFILES`, `ERROR_RESPONSES`; composes existing `createRoutedMockFetch` + `createTestProfile` + `ProfileContext`. |
| `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.test.tsx` | 7 | 0 | 4 | 5/5 pass. Surfaced i18n-assertion drift (old assertions matched stubbed keys, not real translated copy) and `useChildMemory` envelope shape bug. |
| `apps/mobile/src/hooks/use-sessions.test.ts` | 3 (api-client, api, profile) | 0 | 1 (`../lib/sse` transport) | 38/38 pass. Uses real api-client + global fetch + real `ProfileContext` + `setActiveProfileId`. Removed redundant Clerk override. |
| `apps/mobile/src/hooks/use-homework-ocr.test.ts` | 2 (profile, api) | 1 (analytics) | 4 | 19/19 pass. |
| `apps/mobile/src/lib/sign-out.test.ts` | 2 (`./auth-transition`, `./pending-auth-redirect`) | 2 (sign-out-cleanup, api-client) | 1 (Sentry) | 10/10 pass. Cross-account leak coverage from `project_cross_account_leak_2026_05_10` verified intact. |
| `apps/mobile/src/components/session/ChatShell.test.tsx` | 4 (annotations) | 0 | 4 native | 81/81 pass. The 4 internal mocks already had `gc1-allow` labels — exposed an inventory regex bug (fixed in same wave). |

**Bare-mock count: 180 → 131** (after both the agent work and the generator regex fix that surfaced 49 already-annotated mocks the prior pass missed). All five tests passed without weakening any assertion.

### Wave 3 (2026-05-24) — Top-20 Most-Edited Test Files

Ten parallel sonnet agents swept the top 20 most-edited test files (`git log --name-only --since="1 year ago"` ranked by frequency). Hypothesis: high-edit files = highest reader load = best ROI for cleanup. Reality: those files were already mostly cleaned by prior sweeps. Net result:

| File | Mocks removed | Converted to requireActual | gc1-allow added/rewritten | Tests pass |
| --- | ---: | ---: | ---: | :---: |
| `apps/mobile/src/app/(app)/progress.test.tsx` | 0 | 2 (`app-context`, `use-navigation-contract`) | 0 | 35/35 |
| `apps/mobile/src/components/session/ChatShell.test.tsx` | 1 (`math-format` — pure JS, real impl works) | 0 | 0 | 82/82 |
| `apps/api/src/services/retention-data.test.ts` | 0 | 0 | 4 rewritten (placeholder → real justifications) | 75/75 |
| `apps/mobile/src/app/(app)/_layout.test.tsx` | 0 | 0 | 2 added (already had requireActual+spread) | 64/64 |
| `apps/mobile/src/app/create-subject.test.tsx` | 0 | 0 | 1 added + 3-arg form | 44/44 |
| Other 8 files | 0 | 0 | 0 | All pass — already canonical |

**Outcome:** Top-edited ≠ top-bare. Eight of the 13 files with internal mocks were already fully pattern-A converted by prior sweeps (W1-W17 swarm + Waves 1-2). The remaining 5 needed only cosmetic gc1-allow annotations or trivial requireActual additions. **No bugs were found** — no mocks were hiding real failures.

**Takeaway for next sweep:** Stop targeting "most-edited" — those files are already clean because everyone touches them. Target the BARE-mock list instead. `apps/mobile/src/app/_layout.test.tsx` is the obvious next target (15 bare mocks = 65% of remaining backlog).

Commits: `0589a70eb` (API retention-data annotations) + `380c75055` (mobile annotations + ChatShell math-format removal + progress.tsx requireActual spreads).

### Known follow-up

- `mockApiClientFactory` helper (`apps/mobile/src/test-utils/mock-api-routes.ts`) had a path-specific Hono client interop issue in the mentor-memory conversion — inlining the factory body in the test fixed it; the helper still works for shallower paths (`create-subject.test.tsx`). Worth hardening so it resolves `hono/client` consistently regardless of caller depth.

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

**Refreshed 2026-05-24** (after Wave 3 top-20-edited sweep):

| Area | Internal-ish mocks | External mocks |
| --- | ---: | ---: |
| Mobile tests | 351 | 438 |
| API Inngest tests | 132 | 66 |
| API route + top-level integration tests | 138 | 57 |
| API service/middleware unit tests | 84 | 40 |
| API eval-llm tests | 0 | 1 |
| **Total** | **705** | **602** |

Refreshed risk-class counts:

| Risk class | Count |
| --- | ---: |
| `P0` | 0 |
| `P1` | 354 |
| `P2` | 351 |
| `P3` | 602 |

> Raw P1/P2 counts overstate real risk by ~30× — only **23 of the 705 internal-ish mocks are bare** (no annotation, no requireActual). See "Annotation Status Audit" above.

Per-target deltas (top targets):

| Target | Count 2026-05-12 | Count 2026-05-14 | Count 2026-05-19 | Count 2026-05-24 |
| --- | ---: | ---: | ---: | ---: |
| `@eduagent/database` | 54 | 55 | 58 | 58 |
| `../lib/profile` | 26 | 26 | 33 | 15 |
| `../lib/api-client` | 23 | 23 | 30 | 10 |
| `../services/account` | 23 | 22 | 26 | 26 |
| `../helpers` | 22 | 23 | 24 | 26 |
| `../services/profile` | 18 | — | 23 | 24 |
| `../../../lib/profile` | — | — | 17 | 15 |
| `../../lib/profile` | — | — | — | 12 |
| `./llm` | — | — | — | 12 |

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

Top files by internal-ish mock count (refreshed 2026-05-24):

| File | Count | Notes |
| --- | ---: | --- |
| `apps/api/src/inngest/functions/session-completed.test.ts` | 19 | P1 high-risk workflow orchestrator mock cluster — but all are pattern-A + gc1-allow (verified Wave 3). |
| `apps/mobile/src/app/_layout.test.tsx` | 15 | **15 of 15 are BARE.** Single-file dominant target for next sweep — 65% of remaining bare backlog. |
| `apps/mobile/src/app/(app)/library.test.tsx` | 13 | P2 UI screen harness debt. |
| `apps/mobile/src/app/(app)/session/index.test.tsx` | 11 | P2/P1 because session recovery/streaming is user-critical. |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx` | 11 | Verified Wave 3 — 9 pattern-A + 3 gc1-allow (one residual bare). 42/42 pass. |
| `apps/api/src/middleware/metering.test.ts` | 9 | Verified Wave 3 — all 9 pattern-A + gc1-allow. 45/45 pass. |
| `apps/api/src/routes/progress.test.ts` | 9 | P1 progress-API contract risk. Not yet swept. |
| `apps/mobile/src/components/home/LearnerScreen.test.tsx` | 9 | P2 UI harness debt; remaining mocks are API/profile/subtree follow-up. |
| `apps/mobile/src/components/home/ParentHomeScreen.test.tsx` | 9 | P2 UI screen harness debt, already annotated with many `gc1-allow` reasons. |
| `apps/api/src/inngest/functions/monthly-report-cron.test.ts` | 8 | Already fully annotated as of Wave 1. |
| `apps/mobile/src/app/(app)/more/account.test.tsx` | 8 | **NEW in top files (2026-05-24)** — account screen test, not yet swept. |
| `apps/mobile/src/app/(app)/progress.test.tsx` | 8 | Verified Wave 3 — 2 mocks converted to requireActual+spread. 35/35 pass. |

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
