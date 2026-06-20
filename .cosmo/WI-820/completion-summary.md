**Title:** fix(api): billing-catch Sentry escalation + isIdentityV2Enabled sweep [WI-820]

**What was done:** Two surgical fixes landed as PR #1237 (squash bd070c62) on main, addressing the two review-bounce findings from the original PR #1235.

**What changed:**
- `apps/api/src/middleware/account.ts`: added `captureException(error, { tags: { surface: 'billing.v2.initial_trial_repair' } })` inside the `ensureInitialTrialSubscriptionV2` catch block, alongside the existing `logger.error()`. Satisfies the non-negotiable: silent recovery without escalation is banned in billing/auth/webhook code. The request still proceeds on repair failure.
- `apps/api/src/middleware/account.test.ts`: added `[BREAK][WI-820]` verification test asserting captureException fires AND the request returns 200 when billing repair fails. New mocks use `gc1-allow: pattern-a conversion` annotation; GC1 ratchet clean.
- `tests/integration/helpers.ts`: exported `isIdentityV2Enabled()` (was unexported private). Swept 13 files — removed 10 local copy-pasted function definitions (billing-lifecycle, consent-web, inngest-quota-reset, onboarding-dimensions, profile-isolation, stripe-webhook, family-bridge, account-deletion, route-fixtures, helpers/memory-facts) and converted 7 inline `process.env.IDENTITY_V2_ENABLED === 'true'` checks (parent-dashboard ×2, session-completed-chain ×1, inngest-trial-expiry ×4 including `!== 'true'` → `!isIdentityV2Enabled()`).

**Verification:** API typecheck clean; API lint 0 errors; account.test.ts 12/12 pass including new break test; GC1 ratchet clean; pre-push 915 tests green. CI: all required checks SUCCESS; claude-review APPROVED (0 blocking, 0 should-fix); CodeRabbit no actionable comments. Flag-ON integration lane red confirmed ambient (identical 6 skipped suites / 48 skipped tests / 660 passed as origin/main baseline across 3 consecutive main runs).

**Caveats / Follow-ups:** gc1-allow reason-string wording improvement deferred as a separate housekeeping commit (claude-review CONSIDER, non-blocking); Flag-ON integration lane red is pre-existing ambient (ic-116 allowed-red, identical skip-set to main).
