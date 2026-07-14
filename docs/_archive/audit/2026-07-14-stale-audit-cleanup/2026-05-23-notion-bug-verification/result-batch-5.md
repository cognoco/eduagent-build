# Batch 5 — Notion Bug Verification

Branch: `codex/h1-isowner-navigation-contract-sweep` @ `343b0502f`
Verified: 2026-05-23

### #71 — [SUBJECT-06] Broad subject flow does not reach Pick a Book
- **Verdict:** NEEDS_REVIEW
- **File(s):** apps/api/src/services/subject.ts; apps/api/src/services/book-generation-fallbacks.ts; apps/mobile/src/app/create-subject.tsx
- **Evidence:** Commit `e5fc843a5` (2026-05-15, one day after this bug was filed) added "SUBJECT-02/SUBJECT-04/SUBJECT-06/QA-06: add deterministic curriculum fallbacks when LLM book/topic generation fails or returns empty" — see `apps/api/src/services/book-generation-fallbacks.ts` and the `buildFallbackSubjectStructure` import at `subject.ts:33`. This addresses the "Preparing your first lesson..." hang root cause (empty/failed LLM generation). However, the bug is grounded in a Playwright probe artifact that was not retained; the underlying UI-flow assertion ("never reached pick-book-screen") cannot be confirmed fixed without a re-run.
- **Confidence:** MEDIUM
- **Notion sync action:** Investigate further (likely fixed in `e5fc843a5`; confirm via fresh broad-subject Playwright probe before resolving)

### #267 — BUG-35 follow-up: pressKey: Enter does not submit on ChatShell
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/e2e/flows/learning/start-session.yaml:20,50; apps/mobile/e2e/flows/learning/first-session.yaml:13,71
- **Evidence:** Both flows still carry `# DEMOTED 2026-05-19: ...BUG-35 flake — pressKey: Enter is not reliably...` comments and still use `- pressKey: Enter` (line 50 / line 71). No flow uses the `send-button` testID that exists at `ChatShell.tsx:1088`. The promotion gate ("re-tag both to pr-blocking, remove the DEMOTED comments") has not been met.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #396 — [CR-2026-05-19-M12] Test infrastructure gaps
- **Verdict:** STILL_OPEN
- **File(s):** tests/integration/setup.ts:42; tests/integration/api-setup.ts:34; tests/integration/billing-lifecycle.integration.test.ts:34; tests/integration/stripe-webhook.integration.test.ts:26; tests/integration/fetch-interceptor.ts:166-174
- **Evidence:** (1) `setup.ts:42` and `api-setup.ts:34` still `jest.mock('@eduagent/database', ...)` with NO `gc1-allow` comment. (2) Stripe mocks at billing-lifecycle:34 and stripe-webhook:26 still carry the placeholder reason `/* gc1-allow: pattern-a conversion */` — exactly the meaningless rationale called out. (3) `restoreFetch()` at `fetch-interceptor.ts:166` still globally resets handlers/installed state unconditionally with no per-suite guard; the parallel-worker race window persists. Note: page body contains a Worker-2 verification mismatch — the resolution text actually describes FK indexes for bug #393, not M12; the title-scope issues above were never addressed.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open (status already "In progress" with stale/wrong resolution body)

### #455 — [CR-2026-05-21-050] X-Quota-Remaining under-reports on top-up source
- **Verdict:** STILL_OPEN
- **File(s):** apps/api/src/middleware/metering.ts:629; apps/api/src/services/billing/metering.ts:291
- **Evidence:** `metering.ts:629` still sets `remaining: decrement.remainingMonthly + decrement.remainingTopUp`. The decrement service at `services/billing/metering.ts:291` populates `remainingTopUp: updatedTopUp.remaining` — only the single batch consumed. A user with multiple top-up batches whose consumed batch is exhausted will see `0` in the header despite other unspent batches. The fix (`getTopUpCreditsRemaining(db, subscriptionId)`) is not present in either file. No CR-2026-05-21-050 reference found in git log.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #505 — [CR-2026-05-21-100] scheduleDeletion NotFoundError unhandled
- **Verdict:** ALREADY_FIXED
- **File(s):** apps/api/src/services/deletion.ts:30-47
- **Evidence:** Commit `07993f2bb` ("fix(apps/api): harden env-validation, deletion race, and empty-reply-fallback payload [CR-2026-05-21-099] [CR-2026-05-21-100] [CR-2026-05-21-025]") added a try/catch around `getDeletionStatus(db, accountId)` that catches `NotFoundError` and returns a successful `gracePeriodEnds` payload with `scheduledNow: false`. Comment block lines 30-35 explicitly cites the finding ID.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (fixed in `07993f2bb`)

### #548 — [CR-2026-05-21-143] sign-out-cleanup misses bookmark-nudge-shown legacy variant
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/lib/sign-out-cleanup.ts:35
- **Evidence:** Line 35 still only registers the sanitized form: `(id) => sanitizeSecureStoreKey(\`bookmark-nudge-shown:${id}\`)`. By contrast, the rating-recall pattern at lines 40-43 registers BOTH the `-` and `:` variants. The legacy raw-colon form is not enumerated, so any pre-sanitization writes (or test paths bypassing the sanitiser) persist forever. No commit references CR-2026-05-21-143.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #588 — [CR-2026-05-21-183] createMockDb chain proxy silently RLS-bypasses tests
- **Verdict:** STILL_OPEN
- **File(s):** packages/test-utils/src/lib/neon-mock.ts:20-62
- **Evidence:** Code matches finding exactly: `chain()` returns a proxy whose every property access returns `chainFn()` resolving to empty arrays; the `queryProxy` returns `findFirst: jest.fn().mockResolvedValue(undefined)` and `findMany: ... ([])` for every table. No delete, rename, or `non-test source` import guard has been added. No commit references CR-2026-05-21-183.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #603 — [LEARN-21] Child vocabulary chip opens adult-scoped browser
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/app/(app)/progress/vocabulary.tsx:6,102
- **Evidence:** `vocabulary.tsx:102` calls `useProgressInventory()` with no child-scoping argument — the hook returns the active-profile (adult) inventory. The screen does not read any `childProfileId` route param or context. The Family Progress chip on `progress/index.tsx` (cited in evidence) still routes here, so the chip-tap from a selected-child context lands on the adult inventory.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #616 — [ACCOUNT-19] Consent route renders parent-email form while signed out
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/app/consent.tsx:1-80; apps/mobile/src/app/_layout.tsx:287-293
- **Evidence:** `consent.tsx` imports `useUser` from `@clerk/clerk-expo` but never checks `isSignedIn` / `isLoaded` — grep for `isSignedIn|SignedIn|SignedOut|redirect.*sign-in|isLoaded` in the file returns zero matches. The `_layout.tsx` Stack.Screen entry at line 287-293 lives at the root layout (alongside `create-profile`, `delete-account`, etc.) — no auth-gating wrapper segments this route. Compare to `/create-profile` which correctly redirects (per bug body). Bug pattern is fully present.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

---

## Summary Table

| BugId | CR | Verdict | Confidence |
|---|---|---|---|
| #71 | SUBJECT-06 | NEEDS_REVIEW | MEDIUM |
| #267 | BUG-35 follow-up | STILL_OPEN | HIGH |
| #396 | CR-2026-05-19-M12 | STILL_OPEN | HIGH |
| #455 | CR-2026-05-21-050 | STILL_OPEN | HIGH |
| #505 | CR-2026-05-21-100 | ALREADY_FIXED | HIGH |
| #548 | CR-2026-05-21-143 | STILL_OPEN | HIGH |
| #588 | CR-2026-05-21-183 | STILL_OPEN | HIGH |
| #603 | LEARN-21 | STILL_OPEN | HIGH |
| #616 | ACCOUNT-19 | STILL_OPEN | HIGH |
