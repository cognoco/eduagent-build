### #67 — [PARENT-13] Seeded weekly report card opens gone fallback
- **Verdict:** NEEDS_REVIEW
- **File(s):** apps/api/src/services/test-seed.ts:2413-2482; apps/api/src/routes/dashboard.ts (GET weekly-report); apps/mobile/e2e-web/flows/journeys/j19-flow-inventory-parent.spec.ts (missing)
- **Evidence:** Server-side seed and route look correct end-to-end: `seedParentWithWeeklyReport` now populates `weekStart: reportWeek` at test-seed.ts:2440 (added in commit 9171071f0 "fix(parent): align weekly report flow seed", 2026-05-14) satisfying `weeklyReportDataSchema`. The Notion `resolution` field already records "Could not reproduce. Returning to Not started" because the WSL Playwright spec referenced in the bug (`j19-flow-inventory-parent.spec.ts`) doesn't exist in this repo — only `j19-subscription-paywall-ui.spec.ts` exists. Code paths are fixed; the original WSL repro environment is not tracked here.
- **Confidence:** MEDIUM
- **Notion sync action:** Investigate further — code path fixed in `9171071f0`, but the WSL repro spec is unrecoverable; consider closing as "cannot reproduce" rather than "fixed in commit".

### #266 — E2E helper rewrite — dismiss-post-approval.yaml taps button that no longer exists
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/e2e/flows/_setup/dismiss-post-approval.yaml:5-6; apps/mobile/src/app/(app)/_layout.tsx:515-561 (PostApprovalLanding); apps/mobile/e2e/flows/onboarding/view-curriculum.yaml:21 (still has `# DEMOTED 2026-05-19` comment)
- **Evidence:** Helper still does `tapOn: text: "Let's Go"` literal. Source `PostApprovalLanding` renders text via `t('tabs.postApproval.letsGo')` (i18n) — drifts under non-English locales — and exposes a stable `testID="post-approval-continue"` (line 551) that the helper does NOT use. The bug's recommended fix (switch to testID anchor) is not applied; `view-curriculum.yaml` still carries the demotion comment.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #395 — [CR-2026-05-19-M11] Quota race / TOCTOU in 3 sites
- **Verdict:** STILL_OPEN
- **File(s):** apps/api/src/services/billing/metering.ts:196-219; apps/api/src/services/billing/revenuecat.ts:51-72; apps/api/src/routes/stripe-webhook.ts:120-208
- **Evidence:** (1) `metering.ts:198` still does a non-transactional `findQuotaPool__unscoped` after the failed atomic UPDATE — no SELECT FOR UPDATE / SERIALIZABLE wrapping. (2) `revenuecat.ts:51-72` still does idempotency check + update as separate calls. (3) `stripe-webhook.ts:141-143` still relies solely on `lastStripeEventTimestamp` — no `lastStripeEventId` column exists anywhere in the codebase (grep returns zero matches). None of the three suggested fixes have been applied.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #435 — [CR-2026-05-21-030] trialExpiry uses local-TZ setDate/getDate
- **Verdict:** STILL_OPEN
- **File(s):** apps/api/src/inngest/functions/trial-expiry.ts:267-268, 311-312
- **Evidence:** Line 268: `targetDate.setDate(targetDate.getDate() + daysRemaining);` and line 312: `targetDate.setDate(targetDate.getDate() - daysSinceEnd);` — both still use local-TZ `setDate`/`getDate`. The recommended `setUTCDate(getUTCDate() + n)` fix matching `weekly-progress-push.ts:113-119` is not applied.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #504 — [CR-2026-05-21-099] env-validation skipped in dev
- **Verdict:** ALREADY_FIXED
- **File(s):** apps/api/src/middleware/env-validation.ts:55-89
- **Evidence:** The file now contains an explicit `[CR-2026-05-21-099]` comment block (lines 62-67) explaining the fix: "Previously this block was gated on `process.env['NODE_ENV'] !== 'test' && c.env?.ENVIRONMENT !== 'development'` which silently skipped Zod validation in Wrangler dev. The fix: (1) validateEnv (Zod) — always run when NODE_ENV !== 'test'." The current gate at line 68 is only `if (process.env['NODE_ENV'] !== 'test')`, and `validateProductionBindings` does its own ENVIRONMENT-conditional internally.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (fixed in env-validation.ts; commit author tagged the change with CR-2026-05-21-099 in the source code)

### #535 — [CR-2026-05-21-130] useReviewVocabulary / useDeleteVocabulary invalidate language-progress with bare key
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/hooks/use-vocabulary.ts:85, 107
- **Evidence:** Both hooks still call `queryClient.invalidateQueries({ queryKey: ['language-progress'] })` with a bare unscoped key. Source comments at lines 80-84 and 105-107 explicitly mark it as "PR-10 deferred" and rationalize keeping it broad until "a workflow test proves the precise key." Fix not applied.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #586 — [CR-2026-05-21-181] profileSchema exposes accountId
- **Verdict:** STILL_OPEN
- **File(s):** packages/schemas/src/profiles.ts:110-112
- **Evidence:** `profileSchema = z.object({ id: z.string().uuid(), accountId: z.string().uuid(), displayName: z.string(), ... })` — `accountId` is still a public field on every profile response payload. No audit / boolean replacement / sign-out clearing has been added.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #602 — [LEARN-17] Family Progress exposes adult self progress via Mine pill
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/components/progress/ProgressPillRow.tsx:25-31; apps/mobile/src/app/(app)/progress/index.tsx:892-900
- **Evidence:** `ProgressPillRow` unconditionally appends `{ id: ownProfileId, label: t('progress.ownProfilePill') }` (line 30) to the pills array. The caller in `progress/index.tsx:895-900` passes `ownProfileId={activeProfile?.id}` even when `navigationContract.gates.showProgressProfilePicker` is true OR `mode !== 'study'` (i.e. family mode) — there's no Family-mode short-circuit suppressing the Mine pill.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #615 — [ACCOUNT-03] Preview Both setup choice opens unmatched route
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/app/preview/intent.tsx:96; apps/mobile/src/app/preview/ (no `both.tsx` exists)
- **Evidence:** `intent.tsx:96` still calls `router.push('/preview/both')`, but the `apps/mobile/src/app/preview/` directory only contains `_layout.tsx`, `index.tsx`, `intent.tsx`, `topic.tsx`, `value-prop.tsx` (plus tests). No `both.tsx` route exists, so Expo Router still renders the unmatched-route page. The push site was last added in commit `22545aae0` and has not been corrected.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

## Summary

| BugId | CR | Verdict | Confidence |
|-------|----|---------|------------|
| #67 | PARENT-13 | NEEDS_REVIEW | MEDIUM |
| #266 | (no CR — M1-B close-out) | STILL_OPEN | HIGH |
| #395 | CR-2026-05-19-M11 | STILL_OPEN | HIGH |
| #435 | CR-2026-05-21-030 | STILL_OPEN | HIGH |
| #504 | CR-2026-05-21-099 | ALREADY_FIXED | HIGH |
| #535 | CR-2026-05-21-130 | STILL_OPEN | HIGH |
| #586 | CR-2026-05-21-181 | STILL_OPEN | HIGH |
| #602 | LEARN-17 | STILL_OPEN | HIGH |
| #615 | ACCOUNT-03 | STILL_OPEN | HIGH |
