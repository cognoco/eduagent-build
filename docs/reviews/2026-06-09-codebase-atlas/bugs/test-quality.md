# Test Quality & Coverage — Review Report

> **Pruned 2026-06-10** — findings verified FIXED/MOOT against `new-llm` HEAD were removed in this pass; only still-live findings remain below. Full original review is in git history.

**Lens:** Test quality & coverage  
**Branch reviewed:** `new-llm`  
**Date:** 2026-06-09  
**Scope:** All `**/*.test.ts`, `**/*.test.tsx`, `**/*.integration.test.ts` files

---

## Summary

The test suite is large (372 mobile suites, 329 API suites, 51 cross-package integration suites) and generally well-structured. The majority of the code under test exercises real implementations. However, there are several categories of drift: two Inngest functions mock the `drizzle-orm` query-builder library itself (meaning no real query logic ever runs), a 340+ site backlog of `gc1-allow: pattern-a conversion` legacy internal mocks is not tracked in any burn-down metric, test helpers for LLM routing are exported from the production barrel, and several critical paths assert presence (`toHaveBeenCalled()`) without verifying arguments.

Positive findings on the `new-llm` branch: `router.fallback-compliance.test.ts` and `router.v2-matrix.test.ts` ship proper `[BREAK]` / adversarial tests for the Gemini-exclusion compliance constraint. Challenge round evaluation has adversarial `decideMasteryAndReview` tests including `HIGH-8` misconception-blocks-mastery. Profile-scope middleware has an ownership-mismatch break test with argument verification.

---

## Findings

### HIGH-1 — `drizzle-orm` query builder mocked in two Inngest notification tests

**Files:**
- `apps/api/src/inngest/functions/recall-nudge-send.test.ts:88–110`
- `apps/api/src/inngest/functions/review-due-send.test.ts:64–85`

**Pattern:**

```ts
jest.mock(
  'drizzle-orm' /* gc1-allow: isolates drizzle-orm from unit test */,
  () => ({
    and: jest.fn(),
    eq: jest.fn(),
    inArray: jest.fn(),
    isNull: jest.fn(),
    ne: jest.fn(),
  }),
);

jest.mock(
  '@eduagent/database' /* gc1-allow: isolates database schema from unit test */,
  () => ({
    curriculumBooks: {},
    curricula: {},
    curriculumTopics: {},
    ...
  }),
);
```

Followed by a hand-rolled `createOwnedTopicSelect()` that chains `from → innerJoin → innerJoin → innerJoin → where` returning preset rows.

**Impact:** The actual multi-table join logic (`profiles → familyLinks → subjects → curriculumTopics → curriculumBooks`) in `recall-nudge-send.ts` and `review-due-send.ts` is never exercised. The tests only verify that a correctly-shaped mock chain is traversed. A WHERE-clause bug, a missing join, or a wrong column reference in the real implementation would not be caught. These are notification fanout functions — a scoping bug here means notifications delivered to the wrong users.

**The `gc1-allow: isolates drizzle-orm from unit test` justification is not a recognized GC1 external boundary.** `drizzle-orm` is an internal ORM library; the correct approach is to mock `@eduagent/database` at the package level and let real drizzle-orm operators run, or add an integration test that exercises the real DB path. An integration test sibling exists for similar functions (e.g., `filing-stranded-backfill.integration.test.ts`); none exists for `recall-nudge-send` or `review-due-send`.

**Recommendation:** Convert to integration tests using the `describeIfDb` harness pattern already used in 20 other integration test files, or at minimum mock only `@eduagent/database` tables and let the real drizzle operator functions (`and`, `eq`, `inArray`, `isNull`, `ne`) execute against the stub objects.

---

### HIGH-2 — Test helpers exported from the production LLM barrel

**File:** `apps/api/src/services/llm/index.ts:16–23`

```ts
export {
  ...
  getFallbackConfigForTest,
  getModelConfigForTest,
  _setOpenAIAdvancedModelForTesting,
  _getLlmRoutingV2Enabled,
} from './router';
export { mockProvider, createMockProvider } from './providers/mock';
```

**Impact:** The production module surface of `@eduagent/api`'s LLM service exports test-only artifacts. Any downstream package that imports from `@eduagent/llm` (or the API barrel) transitively sees these symbols. More critically, the `_setOpenAIAdvancedModelForTesting` and `_getLlmRoutingV2Enabled` mutation functions are in the production bundle — a test isolation failure that could, in theory, be triggered by malformed config or a future import side effect. The `mockProvider` / `createMockProvider` exports also suggest the mock boundary lives inside the production module rather than in a dedicated test helper package.

**Cross-lens:** This is a module-boundary design issue that the architecture lens should also flag. The production build includes test scaffolding.

**Recommendation:** Move `getFallbackConfigForTest`, `getModelConfigForTest`, `mockProvider`, `createMockProvider`, `_setOpenAIAdvancedModelForTesting`, and `_getLlmRoutingV2Enabled` to a separate test-utilities module (e.g., `apps/api/src/test-utils/llm-helpers.ts`) and import from there in tests. Remove them from `services/llm/index.ts`.

---

### HIGH-3 — 340 `gc1-allow: pattern-a conversion` internal mock sites in API tests, 32 in mobile

**Evidence:**
```
$ grep -rn "gc1-allow: pattern-a conversion" apps/api/src --include="*.test.ts" | wc -l
340
$ grep -rn "gc1-allow: pattern-a conversion" apps/mobile/src --include="*.test.tsx" | wc -l
32
```

**Impact:** 372 test files contain an internal mock tagged as backlog debt. Per the GC6 rule, "every test-file visit must reduce the legacy backlog." Without a forward-only burn-down metric (e.g., a ratchet test that fails if the count goes up), this backlog will grow. The current approach declares all 340 sites as acceptable state in CI, which contradicts the CLAUDE.md statement that "internal mocks are not acceptable state, they are backlog."

**Recommendation:** Add a guard test (alongside `safe-non-core.guard.test.ts`) that reads the count of `gc1-allow: pattern-a conversion` occurrences from test files and fails if the count exceeds the current baseline. This turns the implicit burn-down into an enforced ratchet — new PRs cannot add new `pattern-a conversion` sites without first reducing the count.

---

### HIGH-4 — `auto-file-session.test.ts` mocks session and curriculum services with weak justifications; no integration sibling

**File:** `apps/api/src/inngest/functions/auto-file-session.test.ts:29–51`

```ts
jest.mock('../../services/session' /* gc1-allow: service boundary */, () => ({ ... }));
jest.mock('../../services/curriculum' /* gc1-allow: cleanup boundary */, () => ({ ... }));
```

- `service boundary` is not a recognized GC1 external boundary type — `services/session` has a real implementation and integration tests.
- `cleanup boundary` is not a recognized GC1 boundary type — `deleteTopicIfSafe` in `services/curriculum` is an internal DB write.

**Impact:** The auto-file session flow's session state transitions (`claimSessionForAutoFiling`, `markSessionAutoFiled`, `markSessionAutoFilingFailed`) and the curriculum cleanup (`deleteTopicIfSafe`) are never exercised with real implementations. There is no `auto-file-session.integration.test.ts`. A wrong claim guard, a missed `markAutoFilingFailed` on error path, or a premature topic deletion would not be caught.

**Recommendation:** Add an integration test that exercises the real session service against a test DB. At minimum, rename the `gc1-allow` reasons to accurately reflect why real code cannot run, or fix them.

---

### MEDIUM-1 — Billing webhook handlers mock their own billing barrel

**Files:**
- `apps/api/src/services/billing/stripe-webhook-handler.test.ts:19–32`
- `apps/api/src/services/billing/revenuecat-webhook-handler.test.ts:9–24`

Both use:
```ts
jest.mock(
  '../billing' /* gc1-allow: mirrors route-level test pattern */,
  () => {
    const actual = jest.requireActual('../billing') as ...;
    return {
      ...actual,
      updateSubscriptionFromWebhook: jest.fn(),
      activateSubscriptionFromCheckout: jest.fn(),
      ...
    };
  },
);
```

**Impact:** The service-layer tests for the webhook handlers mock their own billing barrel. The comment acknowledges this is to match the "route-level test pattern," but that is the pattern being replicated, not a boundary type. This means the webhook handler is tested against mock billing functions, not the real DB-backed billing service. The billing side effects of webhook events (quota pool updates, subscription activation) are never exercised in unit tests. Integration tests at `services/billing/*.integration.test.ts` do cover the billing service separately, but the handler-to-billing pipeline is not end-to-end tested in isolation.

**Recommendation:** The `mirrors route-level test pattern` gc1-allow reason is circular — it says "we do it this way because we do it this way." Evaluate whether integration tests for stripe/revenuecat webhook handlers cover the handler→billing chain or only the billing service in isolation.

---

### MEDIUM-4 — 20 integration test suites silently skip when `DATABASE_URL` is not set

**Pattern:** 20 files use:
```ts
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
```

**Files include:** `stripe-webhook.integration.test.ts`, `bookmarks.integration.test.ts`, `concept-capture.integration.test.ts`, `curriculum.integration.test.ts`, and 16 others.

**Impact:** When `DATABASE_URL` is not set (e.g., on a developer machine running `pnpm exec nx run api:test` without a local Neon connection), all 20 suites silently pass via `describe.skip`. The CLAUDE.md requirement to "run integration tests before any commit that touches `apps/api/`" is undermined if the developer doesn't notice the skips. There is no warning when suites skip.

**This is by design** (the `describeIfDb` pattern is established and documented), but the silent nature creates risk when tests are green without actually running.

**Recommendation:** Consider a test reporter plugin or a separate Jest project config for integration tests that fails fast with a clear message when `DATABASE_URL` is absent, rather than silently skipping. At minimum, document the skip behavior in the integration test runner invocation in CLAUDE.md.

---

### MEDIUM-5 — `account-security.test.tsx` has no negative-path / break tests for CRITICAL/HIGH security findings

**File:** `apps/mobile/src/components/account-security.test.tsx` (102 lines)

The test file covers 7 positive-path rendering and navigation scenarios. The `account-security-hardening` branch (pushed 2026-06-09, not yet merged) fixed CRITICAL-1 (email divergence), CRITICAL-2a (no security notification), CRITICAL-2b (no step-up), CRITICAL-2c (old email destroyed), HIGH-1 (bulk sign-out), HIGH-2 (device disambiguation).

Per Fix Development Rules: "Every fix tagged CRITICAL or HIGH must include at least one negative-path test that attempts the exact attack being prevented."

The account-security component test has no tests that:
- Verify a `useReverification` step-up gate prevents unauthenticated email promotion (CRITICAL-2b)
- Verify old email addresses are retained as non-primary (CRITICAL-2c)
- Verify `useEmailReconciliation` fires when mounted (CRITICAL-1)

Note: The hardening branch memory entry states "New tests avoid internal mocks... Tests all green." If those break tests were added in the `account-security-hardening` branch worktree, they are not yet on `new-llm`. This finding applies to the branch under review.

---

### MEDIUM-6 — `session-cache.test.ts` uses 5 `pattern-a conversion` internal mocks with an undocumented mutex justification mixed in

**File:** `apps/api/src/services/session/session-cache.test.ts:17–93`

Six internal mocks are used: `@eduagent/database`, `../prior-learning`, `../retention-data`, `../settings`, `../learner-profile`, `../subject`, `../profile`. Most are tagged `pattern-a conversion` (backlog). Two have an additional inline note: `// gc1-allow: mutex unit test — controls getSubject call count to verify single supplementary fan-out`.

The mutex control justification is valid — BUG-667 required verifying exactly-once calls. However, the `@eduagent/database` mock alongside 5 service mocks means the cache population logic is never tested against real data shapes.

**Recommendation:** Acceptable for the mutex test; flag as a backlog item for eventual integration test migration.

---

### LOW-1 — `recaps/[recapId].test.tsx` mocks hooks at hook level, not at fetch boundary

**File:** `apps/mobile/src/app/(app)/recaps/[recapId].test.tsx:96–104`

```ts
jest.mock('../../../hooks/use-navigation-contract', () => ({
  useNavigationContract: jest.fn().mockReturnValue({ ... }),
}));
jest.mock('../../../hooks/use-recaps', () => ({
  useRecaps: jest.fn().mockReturnValue({ ... }),
}));
```

The canonical mobile test pattern (`createRoutedMockFetch`) mocks only the `fetch` boundary and lets real React Query hooks, `assertOk`, and error classification run. This pattern is used in e.g. `subscription.test.tsx`.

Mocking at the hook level skips all of: query key logic, cache invalidation behavior, loading state transitions, error classification in `assertOk`.

**Recommendation:** Refactor to use `createRoutedMockFetch`. Lower priority than the API findings above since this is a screen test, but it limits coverage of the recap screen's data-loading path.

---

## Cross-Lens Issues

1. **Architecture/module-boundary lens:** `apps/api/src/services/llm/index.ts` exports `getFallbackConfigForTest`, `getModelConfigForTest`, `mockProvider`, `createMockProvider`, `_setOpenAIAdvancedModelForTesting`, `_getLlmRoutingV2Enabled` — test-only artifacts in the production barrel. This is both a test quality finding and an architecture finding.

2. **Inngest/jobs lens:** `recall-nudge-send.test.ts` and `review-due-send.test.ts` mock `drizzle-orm` itself. The inngest-jobs lens should confirm whether either function has real integration test coverage exercising the multi-table join.

---

## Counts

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 4 |
| Medium | 4 |
| Low | 1 |

---

## Files Cited

- `apps/api/src/inngest/functions/recall-nudge-send.test.ts`
- `apps/api/src/inngest/functions/review-due-send.test.ts`
- `apps/api/src/services/llm/index.ts`
- `apps/api/src/inngest/functions/auto-file-session.test.ts`
- `apps/api/src/services/billing/stripe-webhook-handler.test.ts`
- `apps/api/src/services/billing/revenuecat-webhook-handler.test.ts`
- `apps/api/src/middleware/cors.test.ts`
- `apps/api/src/inngest/functions/consent-reminders.test.ts`
- `apps/api/src/inngest/functions/daily-reminder-send.test.ts`
- `apps/api/src/services/session/session-cache.test.ts`
- `apps/mobile/src/components/account-security.test.tsx`
- `apps/mobile/src/app/(app)/recaps/[recapId].test.tsx`
- `apps/api/src/services/llm/router.fallback-compliance.test.ts` (positive)
- `apps/api/src/services/llm/router.v2-matrix.test.ts` (positive)
- `apps/api/src/services/challenge-round/evaluation.test.ts` (positive)
- `apps/api/src/middleware/profile-scope.test.ts` (positive)
