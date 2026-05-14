# Shared Test Utility Framework Plan

**Date:** 2026-05-12  
**Status:** Framework established; follow-up cleanup remains  
**Related:** `docs/plans/2026-05-12-internal-mock-cleanup-inventory.md`
**Archived agent tracker:** `docs/_archive/plans/done/2026-05-12-shared-test-utilities-agent-tracker.md`

## Goal

Build the shared test utility architecture needed to make internal mock cleanup mechanical, safe, and repeatable.

The shared utility setup steps are complete; the archived agent tracker keeps the historical order, blockers, and proof commands. This document remains the architecture reference for follow-up mock cleanup work.

The cleanup should not start by editing hundreds of tests one by one. First, establish the common harnesses that define the correct boundary for each mock type. Once those utilities exist and are proven with one representative test each, bulk cleanup becomes mostly replacing bespoke local mocks with shared helpers.

## Utility Families Needed

| ID | Utility family | Current state | Purpose |
| --- | --- | --- | --- |
| U1 | API Inngest step runner | **Established first pass**: `apps/api/src/test-utils/inngest-step-runner.ts` | Execute real `step.run` callbacks, record step names/events, simulate Inngest step behavior consistently. |
| U2 | API Inngest transport capture | **Established first pass**: `apps/api/src/test-utils/inngest-transport-capture.ts` | Capture `inngest.send` / `createFunction` at the transport boundary without mocking handler/business behavior. |
| U3 | API integration DB harness | Existing partial helpers | Run real route/service/workflow tests against PostgreSQL with seeded rows and cleanup. |
| U4 | API local DB runner | Partial support in `tests/integration/api-setup.ts` | Make local Postgres an explicit opt-in integration-test mode. |
| U5 | API LLM provider fixtures | **Established first pass**: `apps/api/src/test-utils/llm-provider-fixtures.ts` | Keep router/envelope/prompt logic real while supplying deterministic provider responses. |
| U6 | API external fetch/provider helpers | Existing `fetch-interceptor.ts` | Mock true external HTTP boundaries only: JWKS, LLM provider HTTP, embeddings, email, push. |
| U7 | Mobile render harness | Hook-level partial helper exists | Render screens with QueryClient, profile/auth fixtures, routed API responses, and teardown. |
| U8 | Mobile native boundary shim catalog | Scattered per-test mocks | Standardize approved Jest shims for router, safe area, icons, SecureStore, alerts, Sentry, theme/native color scheme. |

## Build Order

### Phase 0 - Governance And Naming

**Purpose:** Prevent new shared utilities from becoming another pile of ad hoc helpers.

Tasks:

- Add naming rules:
  - API test utilities live under `apps/api/src/test-utils/` unless they are only for top-level integration suites.
  - Top-level integration utilities live under `tests/integration/`.
  - Mobile test utilities live under `apps/mobile/src/test-utils/`.
- Standardize boundary labels:
  - `external-boundary`
  - `native-boundary`
  - `observability`
  - `transport-boundary`
  - `temporary-internal`
- Update the internal mock cleanup inventory with a rule: every retained internal-ish mock must name one of these labels.

Done when:

- The inventory points to this plan.
- The labels are documented once and reused by later phases.

Verification:

- Documentation review only.

### Phase 1 - API Inngest Foundation

**Purpose:** Inngest tests have many repeated local `createMockStep` variants. Centralize the common step behavior first.

Utilities:

- U1: `createInngestStepRunner`
- U2: `createInngestTransportCapture`

Tasks:

- Extend `createInngestStepRunner` with:
  - pass-through `step.run` - **done**
  - `sendEvent` recording - **done**
  - `sleep` recording - **done**
  - `waitForEvent` recording - **done**
  - named step result overrides - **done**
  - named step failure injection - **done**
  - sendEvent failure injection - **done**
  - waitForEvent result queues - **done**
- Add `createInngestTransportCapture` for tests that need to capture `inngest.send` / `createFunction` behavior.
- Convert one simple Inngest function test and one event-dispatch test as proofs. **Done with three tests.**

Representative proof tests:

- `apps/api/src/inngest/functions/streak-record.test.ts`
- `apps/api/src/inngest/functions/summary-regenerate.test.ts`
- `apps/api/src/inngest/functions/transcript-purge-cron.test.ts`

Done when:

- At least three tests use the shared step runner. **Done.**
- The utility supports pass-through callbacks, named step results, failure injection, `sendEvent`, `sleep`, and `waitForEvent`. **Done.**
- One test uses shared transport capture. **Done with two proof tests.**

Verification:

```powershell
$env:NX_DAEMON='false'; $env:NX_ISOLATE_PLUGINS='false'
pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/inngest/functions/streak-record.test.ts --runInBand --no-coverage
```

Current proof command:

```powershell
$env:NX_DAEMON='false'; $env:NX_ISOLATE_PLUGINS='false'
pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/inngest/functions/streak-record.test.ts apps/api/src/inngest/functions/summary-regenerate.test.ts apps/api/src/inngest/functions/transcript-purge-cron.test.ts --runInBand --no-coverage
```

Result on 2026-05-12: **passed**, 3 suites, 20 tests.

### Phase 2 - API Integration And External Boundaries

**Purpose:** Replace internal service/database mocks in integration-style tests with real DB/app paths and deterministic external boundaries.

Utilities:

- U3: API integration DB harness
- U4: API local DB runner
- U5: LLM provider fixtures
- U6: external fetch/provider helpers

Tasks:

- Create a short local DB runbook: **Done.** `docs/runbooks/local-db-testing.md` + `docker-compose.test.yml`.
- Decide pgvector handling: **Done.** Use `pgvector/pgvector:pg16` image (pgvector pre-installed, matches Neon). All suites run locally without modification.
- Add LLM provider fixtures: **Done, first pass.**
  - valid envelope via `llmEnvelopeReply()`
  - invalid JSON via `llmInvalidJson()`
  - plain text fallback via `llmPlainText()`
  - streaming response via `streamResponse` / `queueStreamResponse`
  - provider failure via `chatError` / `chatErrors`
- Add fetch-provider helpers on top of `tests/integration/fetch-interceptor.ts`:
  - JWKS helper already exists
  - LLM HTTP provider helper
  - embedding helper
  - email/push helper where needed
- Convert one LLM test to the shared provider fixture. **Done:** `apps/api/src/services/summaries.test.ts`.
- Convert one DB-backed integration suite to the same fixture. **Done but DB proof blocked locally:** `tests/integration/learning-session.integration.test.ts`.

Representative proof tests:

- `apps/api/src/test-utils/llm-provider-fixtures.test.ts`
- `apps/api/src/services/summaries.test.ts`
- `tests/integration/assessments-routes.integration.test.ts`
- `tests/integration/learning-session.integration.test.ts`
- `apps/api/src/services/book-suggestion-generation.integration.test.ts`

Done when:

- One integration test proves local or Neon-backed DB path still works.
- One LLM integration test uses shared provider fixtures instead of mocking `./llm`.
- One external HTTP provider test uses shared fetch-provider helpers.

Verification:

```powershell
$env:NX_DAEMON='false'; $env:NX_ISOLATE_PLUGINS='false'
pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/test-utils/llm-provider-fixtures.test.ts apps/api/src/services/summaries.test.ts --runInBand --no-coverage
```

Result on 2026-05-12: **passed**, 2 suites, 12 tests.

DB-backed integration proof attempted:

```powershell
$env:NX_DAEMON='false'; $env:NX_ISOLATE_PLUGINS='false'
pnpm exec jest -c tests/integration/jest.config.cjs learning-session.integration.test.ts --runInBand --no-coverage
```

Result on 2026-05-12: **blocked by environment**, because `DATABASE_URL` is not set. The suite loads through TypeScript before failing in integration setup.

### Phase 3 - Mobile Screen Harness

**Purpose:** Mobile tests have the largest mock volume. Build one render harness so screens can use real hooks and route-shaped data.

Utilities:

- U7: mobile render harness
- U8: native boundary shim catalog

Tasks:

- Add a screen-level render helper that composes:
  - `QueryClientProvider`
  - controlled profile/auth context
  - routed API mock fetch
  - default native shims
  - teardown/query cleanup
- Reuse `createRoutedMockFetch` and `mockApiClientFactory` rather than replacing them.
- Promote `createTestProfile` into named profile fixtures:
  - solo learner
  - parent
  - linked child learner
  - parent learning as self
- Add error response helpers:
  - quota exhausted
  - forbidden
  - gone
  - network error
  - validation error
- Create a native shim catalog with approved mocks and labels.
- Convert one screen that already uses routed API mocks but has open-handle/act noise.

Representative proof tests:

- `apps/mobile/src/app/(app)/home.test.tsx`
- `apps/mobile/src/app/create-subject.test.tsx`
- `apps/mobile/src/app/session-summary/[sessionId].test.tsx`

Done when:

- One screen uses the shared render harness.
- The proof test passes and Jest exits cleanly.
- The utility exposes teardown so query timers/open handles do not leak.

Verification:

```powershell
$env:NX_DAEMON='false'; $env:NX_ISOLATE_PLUGINS='false'
pnpm exec jest -c apps/mobile/jest.config.cjs --runTestsByPath "apps/mobile/src/app/(app)/home.test.tsx" --runInBand --no-coverage
```

### Phase 4 - Ratchets And Inventory Refresh

**Purpose:** Once shared utilities exist, prevent backsliding.

Tasks:

- **Done:** Replace shell-based `git ls-files` discovery with sandbox-safe Node filesystem enumeration.
- **Done 2026-05-14:** Generalize the integration mock guard beyond the LLM channel.
  - Moved from `apps/api/src/services/llm/integration-mock-guard.test.ts` to `apps/api/src/test-utils/integration-mock-guard.test.ts` to reflect general scope.
  - Scans every `*.integration.test.ts` in `apps/api` and `tests/integration`.
  - Allowlist is intentionally narrow (`services/sentry`, `services/stripe`); `KNOWN_OFFENDERS` is empty.
  - Self-test fixtures cover `./llm`, `../../services/notifications`, `../../services/llm/router`, `../../inngest/client`, `@eduagent/database`, and confirm `services/sentry` / `services/stripe` are not flagged.
  - Forward-only: `KNOWN_OFFENDERS` is a shrinking punch list, never a permanent carve-out.
- **Done:** Add a generated raw CSV inventory:
  - file
  - line
  - mock kind
  - target
  - area
  - classification
  - retained reason
  - cleanup batch
- **Done for the current snapshot:** Add a count summary to the inventory doc after each cleanup batch.

Done when:

- New integration tests cannot add internal mocks accidentally.
- The raw inventory is refreshable.
- Cleanup PRs can report mocks removed and retained by reason.

Verification:

```powershell
$env:NX_DAEMON='false'; $env:NX_ISOLATE_PLUGINS='false'
pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/test-utils/integration-mock-guard.test.ts --runInBand --no-coverage
```

Current status: the guard lives at `apps/api/src/test-utils/integration-mock-guard.test.ts`, scans `apps/api` and `tests/integration` with Node filesystem APIs, allowlists only `services/sentry` and `services/stripe`, and the `KNOWN_OFFENDERS` set is empty. The raw CSV inventory lives at `docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv` and can be regenerated with `pnpm exec tsx scripts/generate-internal-mock-cleanup-inventory.ts`. Phase 4 is complete.

## Implementation Rules

- Do not migrate many tests until the utility has one passing proof test.
- Do not move a mock into a shared helper if it hides business logic. Shared utilities are for boundaries and harness setup, not for app behavior.
- Keep true external/native boundaries mocked.
- Prefer real DB/app/service paths for integration tests.
- If a pattern is not proven yet, mark it as `needs proof` in the inventory rather than calling it established.
- Every phase must update `docs/plans/2026-05-12-internal-mock-cleanup-inventory.md` with:
  - utility added,
  - proof test,
  - mocks removed or centralized,
  - retained mock reasons,
  - tests run.

## Suggested First PR

Scope:

- Finish U1 `createInngestStepRunner`. **Done for first pass.**
- Convert 2-3 small Inngest tests that currently hand-roll step mocks. **Done: 3 tests converted.**
- Add a small section to the inventory listing U1 as established.

Good candidate tests:

- `apps/api/src/inngest/functions/streak-record.test.ts` - converted.
- `apps/api/src/inngest/functions/summary-regenerate.test.ts`
- `apps/api/src/inngest/functions/transcript-purge-cron.test.ts`

Out of scope:

- Session-completed chain cleanup.
- Local DB setup.
- Mobile screen harness.
- General integration mock guard beyond the current LLM-specific guard.
