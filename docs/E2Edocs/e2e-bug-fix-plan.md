# E2E Bug Fix Plan — Pre-Launch Sprint

**Date:** 2026-03-23 (updated 2026-03-24)
**Author:** Claude (code review investigation)
**Target:** Production launch in ~2 days
**Scope:** 7 failing E2E flows + 3 MAJOR visual issues + LLM reliability for production
**Baseline:** Session 22 — 47/55 PASS (85%)
**Target:** 54/55 PASS (98%) — only `sign-up-flow` stays PARTIAL (Clerk verification by design)

## Fix Application Status (2026-03-24)

All 12 fixes applied. Tests passing. Awaiting E2E regression run + APK rebuild for visual verification.

| Fix | Status | Tests | Notes |
|-----|--------|-------|-------|
| FIX-01 | APPLIED | 37 suites, 653 tests PASS | `AbortSignal.timeout(20_000)` on both fetch calls |
| FIX-02 | APPLIED | 24 suites, 326 tests PASS | `OPENAI_API_KEY` added to required keys + config.test.ts updated |
| FIX-03 | APPLIED | 37 suites, 651 tests PASS | MAX_RETRIES=3, INITIAL_DELAY=500ms, jitter added + router.test.ts updated |
| FIX-04 | APPLIED | YAML only | BYOK assertions made optional with justification comments |
| FIX-05 | APPLIED | YAML only | Timing fix: added post-switch wait, increased timeouts, added justification comments |
| FIX-06 | APPLIED | 25 suites, 375 tests PASS | Third retention card set to `xpStatus: 'pending'` — prevents curriculum_complete |
| FIX-07 | NO CODE CHANGE | Runtime only | `pnpm run db:push:dev` needed before next E2E run |
| FIX-08 | APPLIED | YAML only | Timeout 20→30s, 2 assertions strengthened optional→mandatory, sign-in-only.yaml improved |
| FIX-09 | SELF-HEALS | Depends on FIX-01+02 | Gemini timeout + OpenAI fallback should resolve LLM hangs |
| FIX-10 | APPLIED | 36 tests, 2 suites PASS | Error state + testID added, 2 new test cases |
| FIX-11 | APPLIED | 27 tests, 2 suites PASS | Improved empty state message + testID |
| FIX-12 | APPLIED | TypeScript clean | Triple approach: href:null + display:none + tabBarButton:null |

---

## Priority 1: CRITICAL — LLM Reliability (Blocks Production)

### FIX-01: Gemini Has No Timeout — Will Hang Indefinitely

**Severity:** CRITICAL — production blocker
**Impact:** All LLM calls via Gemini can hang forever; no fallback triggers
**File:** `apps/api/src/services/llm/providers/gemini.ts`

**Problem:** Both `chat()` (line 126) and `chatStream()` (line 150) call `fetch()` with NO `AbortSignal.timeout()`. Compare to OpenAI provider which has a 25s timeout. If Gemini is slow or unresponsive, the request hangs until Cloudflare's hard wall kills it — circuit breaker never sees a failure, so it never opens, so fallback never triggers.

**Fix:**
```typescript
// Line 126 — chat() non-streaming:
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(20_000),  // ← ADD: 20s timeout
});

// Line 150 — chatStream() streaming:
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(20_000),  // ← ADD: 20s timeout
});
```

**Why 20s:** OpenAI uses 25s. Gemini at 20s gives the circuit breaker 5s to record the failure and attempt OpenAI fallback before Cloudflare's 30s subrequest wall.

**Tests to run:**
```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/llm/providers/gemini.ts --no-coverage
```

---

### FIX-02: OpenAI Not in Production Required Keys — Single Point of Failure

**Severity:** CRITICAL — production blocker
**Impact:** If only Gemini is configured, every Gemini failure = user-facing error. No fallback.
**File:** `apps/api/src/config.ts`

**Problem:** `PRODUCTION_REQUIRED_KEYS` (line 53-60) lists `GEMINI_API_KEY` but NOT `OPENAI_API_KEY`. The fallback path in `router.ts` checks `providers.has('openai')` — if OpenAI isn't registered, primary failures go straight to error.

**Fix:** Add `OPENAI_API_KEY` to the required keys array:
```typescript
const PRODUCTION_REQUIRED_KEYS: readonly (keyof Env)[] = [
  'CLERK_SECRET_KEY',
  'CLERK_JWKS_URL',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',       // ← ADD: required for fallback
  'VOYAGE_API_KEY',
  'RESEND_API_KEY',
  'REVENUECAT_WEBHOOK_SECRET',
] as const;
```

**Action required:** Set `OPENAI_API_KEY` in staging and production env vars.

**Tests to run:**
```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/config.ts --no-coverage
```

---

### FIX-03: Retry Logic Needs Jitter

**Severity:** MODERATE — production resilience
**File:** `apps/api/src/services/llm/router.ts` (lines 158-186)

**Problem:** Exponential backoff has no jitter. Under load, retries synchronize (thundering herd). Also only 2 retries (3 total attempts) may be insufficient for transient network issues.

**Fix:**
```typescript
const MAX_RETRIES = 3; // Up to 4 total attempts (was 2)
const INITIAL_RETRY_DELAY_MS = 500; // Start faster (was 1000)

// In the retry loop (line 173):
const jitter = Math.random() * 500; // Add 0-500ms jitter
const delay = INITIAL_RETRY_DELAY_MS * 2 ** attempt + jitter;
```

**Tests to run:**
```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/llm/router.ts --no-coverage
```

---

## Priority 2: HIGH — E2E Flow Failures (7 Failing Flows)

### FIX-04: `subscription-details` — BYOK Section Commented Out

**Severity:** HIGH — flow regression
**Root cause:** The BYOK (Bring Your Own Key) section in `subscription.tsx` was **commented out** (lines 873-908) as part of the Epic 10 PR. But the E2E flow still has a **mandatory assertion** on `"Bring your own key (coming soon)"` (line 84-92 of `subscription-details.yaml`).

**Fix:** Remove or make optional the BYOK assertions in the flow YAML:
```yaml
# 14. BYOK section — commented out in code, feature not yet ready
# Tracking: re-enable when BYOK feature is implemented
- scrollUntilVisible:
    element:
      text: "Bring your own key \\(coming soon\\)"
    direction: DOWN
    timeout: 15000
    speed: 30
    optional: true   # ← ADD

- assertVisible:
    text: "Bring your own key \\(coming soon\\)"
    optional: true   # ← ADD
```

**File:** `apps/mobile/e2e/flows/billing/subscription-details.yaml` (lines 84-92)

---

### FIX-05: `child-paywall` — Same BYOK or Subscription Screen Issue

**Severity:** HIGH — flow regression
**Root cause:** Likely same BYOK assertion or a timing issue with the child profile switch. The `switch-to-child.yaml` setup flow navigates More → Profiles → tap child name. If the profile switch is slow, the ChildPaywall gate may not render in time.

**Investigation needed:** Read `child-paywall.yaml` to identify exact failure step. If it's the BYOK assertion, same fix as FIX-04. If it's a timing issue, increase the timeout on the `child-paywall` testID wait.

**File:** `apps/mobile/e2e/flows/billing/child-paywall.yaml`

---

### FIX-06: `assessment-cycle` — Coaching Card Type Changed

**Severity:** HIGH — flow regression
**Root cause:** The curriculum completion coaching card feature (Story 10.15, commit `df6deeb`) added a new Priority 3 card type (`curriculum_complete`) to `coaching-cards.ts`. When the `onboarding-complete` seed creates a subject with all topics at verified retention, the coaching card returns "You've mastered your subjects!" instead of the normal card. The flow expects the standard coaching card + `add-subject-button`.

**Fix options:**
1. **Best:** Update the seed scenario — ensure `onboarding-complete` creates retention cards that are NOT fully verified (e.g., one card with `xpStatus: 'pending'`). This prevents the curriculum_complete card from triggering.
2. **Alternative:** Update the flow to handle the `curriculum_complete` card as a valid landing state.

**Files:**
- `apps/api/src/services/test-seed.ts` — `onboarding-complete` scenario
- `apps/api/src/services/coaching-cards.ts` — Priority 3 check (lines ~122-142)
- `apps/mobile/e2e/flows/assessment/assessment-cycle.yaml`

---

### FIX-07: `child-drill-down` + `consent-management` — DB Schema Drift

**Severity:** HIGH — environment regression (not code)
**Root cause:** Session 22 pre-run notes document that the `raw_input` column on `subjects` was missing from the dev DB. The `pnpm run db:push:dev` was run to fix it. But the parent dashboard's `getChildrenForParent()` query selects ALL columns including `raw_input`. When the column didn't exist, the query silently failed, returning no children. The `parent-dashboard` flow still passed because it only asserts on headings (not child cards). But `child-drill-down` and `consent-management` need child cards to tap on.

**Fix:** This is already fixed by the `pnpm run db:push:dev` that was run at Session 22 start. These flows should pass on the next regression run. **No code change needed.**

**Verification:** Re-run both flows in the next batch. If they still fail, investigate whether `getChildrenForParent()` has proper error handling (it should not swallow query errors).

**Operational note for production:** Add `pnpm run db:push:dev` (or `db:generate` + `db:migrate`) to the pre-E2E checklist. Schema drift is a recurring issue (BUG-26 was the same class of problem).

---

### FIX-08: `empty-first-user` — Persistent Since Session 20

**Severity:** MEDIUM — edge case flow
**Root cause (multi-layered):**

1. `sign-in-only.yaml` has `optional: true` on its final "Welcome back" wait — if sign-in fails silently, the flow continues into a broken state
2. PostApprovalLanding dismiss is `optional: true` — if it doesn't appear or dismiss fails, flow continues
3. The `create-subject-name` testID wait (20s timeout, line 56-59) is the first mandatory step. If auth didn't complete or PostApproval didn't dismiss, this times out.
4. Almost all subsequent assertions are `optional: true` — the flow can "succeed" even if nothing works

**Fix:**
1. Make the `create-subject-name` wait more robust — increase timeout to 30s (auth + PostApproval + redirect chain is ~15-20s on WHPX)
2. Add a non-optional sign-in success check in `sign-in-only.yaml` — wait for either `home-scroll-view` OR `create-subject-name` OR `post-approval-landing` (any post-auth screen)
3. Make at least the core assertions non-optional: `create-subject-name`, `create-subject-cancel`, `create-subject-submit`

**Files:**
- `apps/mobile/e2e/flows/edge/empty-first-user.yaml`
- `apps/mobile/e2e/flows/_setup/sign-in-only.yaml`

---

### FIX-09: `curriculum-review-flow` — LLM Timing (Not a Mock Issue)

**Severity:** MEDIUM — depends on real LLM response quality
**Root cause:** The flow requires Gemini to return a structured curriculum response within 90s that includes a `view-curriculum-button` trigger. With FIX-01 (Gemini timeout) and FIX-02 (OpenAI fallback), this should become reliable. The interview service sends a message and waits for AI to produce `[INTERVIEW_COMPLETE]` — if the LLM hangs or returns a generic error, the interview never completes.

**Fix:** FIX-01 + FIX-02 should resolve this. If it still fails after those fixes:
1. Check that the interview prompt explicitly tells the LLM to complete in 1-2 exchanges for E2E scenarios
2. Increase the flow's LLM exchange timeout from 30s to 45s

**File:** `apps/mobile/e2e/flows/onboarding/curriculum-review-flow.yaml`

---

## Priority 3: MAJOR Visual Issues

### FIX-10: V-004 — Subscription Screen Perpetual Loading Spinner

**Severity:** MAJOR — user-facing (every user who taps Subscription sees a spinner)
**Root cause:** The subscription screen (line 635-642) has a combined `isLoading` check that ANDs four query loading states. If `useSubscription()` or `useUsage()` API queries fail or return errors, there is **no error state UI**. The screen stays on the loading spinner forever.

Additionally, on the emulator (no Play Store), RevenueCat hooks return `null` immediately with `isLoading: false`, but the API-side subscription data may not exist for the seeded scenario.

**Fix:** Add error handling and empty state:
```typescript
// After the isLoading check (line 635):
if (isLoading) {
  return <ActivityIndicator />;
}

// ADD: Error state
if (subError || usageError) {
  return (
    <View className="flex-1 items-center justify-center px-5">
      <Text className="text-body text-text-secondary text-center">
        Unable to load subscription details. Please try again.
      </Text>
    </View>
  );
}

// ADD: No subscription fallback (before the ScrollView)
if (!subscription && !subLoading) {
  // Render a "Free tier" or "No active subscription" state
}
```

**File:** `apps/mobile/src/app/(learner)/subscription.tsx` (lines 635-642)

**Tests to run:**
```bash
cd apps/mobile && pnpm exec jest subscription --no-coverage
```

---

### FIX-11: V-005 — Parent Dashboard Empty Gray Cards

**Severity:** MAJOR — poor UX when parent has no children linked
**Root cause:** The `onboarding-complete` seed creates a parent profile but no children. The parent dashboard renders card placeholders with no content and no "No children linked yet" message.

**Fix:** The dashboard.tsx already has a "No children linked yet" empty state (visible in Session 10 screenshots). This is likely a seed scenario mismatch — `onboarding-complete` shouldn't be used for parent dashboard testing. The `settings-toggles` flow switches to parent persona and lands on the dashboard — the empty cards are expected for a seed with no children.

**Options:**
1. Add a "No children linked" message inside the empty card placeholders
2. Accept this as expected behavior for the `onboarding-complete` seed (no children = empty cards)

**File:** `apps/mobile/src/app/(parent)/dashboard.tsx`

---

### FIX-12: V-006 — Parent Tab Bar Leaked `child/[profileId]` Route

**Severity:** MAJOR — visual defect
**Root cause:** BUG-59 fix added `tabBarItemStyle: { display: 'none' }` but the fix may not have been applied to the `child/[profileId]` dynamic route in parent layout, or the fix needs a rebuild to take effect.

**Status:** Already fixed in code (Session 20c). Needs APK rebuild to verify. Check that `apps/mobile/src/app/(parent)/_layout.tsx` has `tabBarItemStyle: { display: 'none' }` on the `child` Tabs.Screen entry.

**File:** `apps/mobile/src/app/(parent)/_layout.tsx` (line ~101)

---

## Execution Order

| # | Fix | Type | Files | Est. Time | Unblocks |
|---|-----|------|-------|-----------|----------|
| 1 | FIX-01: Gemini timeout | App code | `gemini.ts` | 10 min | LLM reliability, curriculum-review |
| 2 | FIX-02: OpenAI required | App code + ops | `config.ts` + env vars | 10 min | LLM fallback |
| 3 | FIX-03: Retry jitter | App code | `router.ts` | 10 min | LLM resilience |
| 4 | FIX-04: BYOK assertion | YAML only | `subscription-details.yaml` | 5 min | subscription-details flow |
| 5 | FIX-05: child-paywall | YAML only | `child-paywall.yaml` | 10 min | child-paywall flow |
| 6 | FIX-06: assessment seed | App code | `test-seed.ts` | 15 min | assessment-cycle flow |
| 7 | FIX-07: DB schema drift | Runtime only | `pnpm run db:push:dev` | 2 min | child-drill-down, consent-management |
| 8 | FIX-08: empty-first-user | YAML only | `empty-first-user.yaml`, `sign-in-only.yaml` | 15 min | empty-first-user flow |
| 9 | FIX-09: curriculum-review | Depends on FIX-01+02 | — | 0 min | curriculum-review flow |
| 10 | FIX-10: subscription spinner | App code | `subscription.tsx` | 15 min | V-004 visual |
| 11 | FIX-11: empty parent cards | App code | `dashboard.tsx` | 10 min | V-005 visual |
| 12 | FIX-12: parent tab leak | Verify only | `(parent)/_layout.tsx` | 5 min | V-006 visual |

**Total estimated time: ~1.5-2 hours of code changes + test runs**

---

## Post-Fix Verification

After all fixes applied:
1. Run `pnpm run db:push:dev` to ensure schema is synced
2. Run API tests: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --no-coverage`
3. Run mobile tests: `cd apps/mobile && pnpm exec jest --no-coverage`
4. Re-run full E2E regression (55 flows) on emulator
5. Verify `OPENAI_API_KEY` is set in staging/production env vars
6. Verify `/v1/health` shows both `gemini` and `openai` providers

---

## Pre-Production Checklist (from this investigation)

- [ ] `OPENAI_API_KEY` set in production Cloudflare Workers secrets
- [ ] `pnpm run db:push:dev` (or production equivalent) run after schema changes
- [ ] Verify `GET /v1/health` returns `{"llm":{"providers":["gemini","openai"]}}`
- [ ] E2E regression at 95%+ pass rate
- [ ] Visual review: subscription screen shows content (not spinner)
- [ ] Visual review: parent tab bar shows exactly 3 tabs
