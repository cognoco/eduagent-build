# Batch 7 verification

Verified at `codex/h1-progress-contract-migration` HEAD `343b0502f` (briefed branch name was stale; HEAD hash matches).

### #77 — [QA-06] Focused-book subject creation hangs on first lesson
- **Verdict:** NEEDS_REVIEW
- **File(s):** Runtime E2E flow (no code anchor in Notion body)
- **Evidence:** Bug is a Playwright runtime hang on `Preparing your first lesson…` — depends on focused-book curriculum path. Empty-curriculum determinism landed in commit `e5fc843a5` (same root cause as batch-5's #71), which likely fixes this, but no Playwright spec is committed to confirm. Recommend re-running the j19-flow-inventory-focused-book probe.
- **Confidence:** LOW
- **Notion sync action:** Investigate further (re-run probe).

### #363 — [CR-2026-05-19-H14] Dedup pairKey doesn't include category
- **Verdict:** ALREADY_FIXED
- **File(s):** `apps/api/src/services/memory/dedup-pass.ts:50`; `apps/api/drizzle/0088_bug363_dedup_pairkey_category.sql`
- **Evidence:** `dedupPairKey(category, a, b)` now JSON-stringifies `[category, low, high]` (line 50, with explicit `BUG-363` comment at line 48). Migration `0088_bug363_dedup_pairkey_category.sql` is present at HEAD. Commits `82dff9757` and `a590042ac` both tag `[BUG-363]`. The Notion page's "Worker 1 verification FAILED 2026-05-22" note was written from the `i18n-translations` branch where the stash got GC-wiped — on THIS branch (`codex/h1-progress-contract-migration`), the fix exists.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (fixed in `82dff9757` / `a590042ac`).

### #402 — [CR-2026-05-19-M18] Memory dedup memo INSERT onConflictDoNothing race
- **Verdict:** STILL_OPEN
- **File(s):** `apps/api/src/services/memory/dedup-pass.ts:202-212`
- **Evidence:** INSERT still uses `.onConflictDoNothing()` (line 212). No re-read of the memo row before `applyDedupAction`. The transaction block at line 215-235 reads fresh candidate/neighbour rows but NOT the memo. Notion's suggested fix (re-read after conflict OR switch to `onConflictDoUpdate`) is not implemented.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open.

### #468 — [CR-2026-05-21-063] solo-progress-reports.ts and self-progress-reports.ts are duplicates
- **Verdict:** ALREADY_FIXED
- **File(s):** `apps/api/src/services/solo-progress-reports.ts` (only file remaining at HEAD)
- **Evidence:** `git ls-tree HEAD --name-only -r` shows only `solo-progress-reports.ts` and its test. `self-progress-reports.ts` was removed; remaining `_self-progress-reports.*.disabled` rename artefacts were also deleted in commit `9a84e093f` ("fix(mobile): add missing i18n keys, remove duplicate test content, clean up moved files").
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (cleaned up in `9a84e093f`).

### #514 — [CR-2026-05-21-109] create-profile silently switches profile after navigation
- **Verdict:** PARTIALLY_FIXED
- **File(s):** `apps/mobile/src/app/create-profile.tsx:218-234`
- **Evidence:** Code at lines 212-217 now carries a long comment block explaining why navigation deliberately runs BEFORE `await switchProfile` — describes a different concern (CreateProfileGate flash during the switch window) that the team decided takes priority. However, the Notion bug's specific ask — a `mountedRef` guard before `platformAlert` at line 229 — is NOT implemented. Alert still fires from a possibly-torn-down screen.
- **Confidence:** HIGH
- **Notion sync action:** Investigate further — design intent diverged from CR-109; decide whether to enforce mountedRef or formally close as Won't Fix.

### #557 — [CR-2026-05-21-152] OutboxDrainProvider replaySessionEntry silent skip
- **Verdict:** ALREADY_FIXED
- **File(s):** `apps/mobile/src/providers/OutboxDrainProvider.tsx:183-195`
- **Evidence:** The `if (!activeProfile?.id)` guard at line 184 now emits a `Sentry.addBreadcrumb({ category: 'outbox', level: 'info', message: 'drain skipped — no activeProfile', data: { isRunning: runningRef.current } })` before returning — exactly the suggested fix. Snapshot-profileId pattern (commits `#540/#542`) further hardens the race.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved.

### #590 — [AUTH-04] Web email sign-in returns to sign-in with session-expired banner
- **Verdict:** NEEDS_REVIEW
- **File(s):** Runtime Playwright (no code anchor)
- **Evidence:** Reported from branch `i18n-translations @ ae5cacc8a` — a separate branch from the current one. Could be Clerk-session/staging-API integration, not a code defect. Cannot be verified from grep alone; needs a re-run of the seeded sign-in Playwright project against `api-stg.mentomate.com`.
- **Confidence:** LOW
- **Notion sync action:** Investigate further (re-run E2E).

### #606 — [BILLING-04] Mobile web shows Restore Purchases even though RevenueCat cannot run
- **Verdict:** STILL_OPEN
- **File(s):** `apps/mobile/src/hooks/use-revenuecat.ts:237-249`; `apps/mobile/src/app/(app)/subscription.tsx:1752-1780`
- **Evidence:** `useRestorePurchases` mutationFn calls `Purchases.restorePurchases()` directly with NO `isRevenueCatAvailable()` guard (line 239). The Pressable that renders `Restore Purchases` (lines 1752-1780) is wrapped only in `<View className="mt-4">` — no `Platform.OS !== 'web'` check, unlike the Manage-billing row mentioned in the bug body.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open.

---

## Summary

| BugId | CR / Tag           | Verdict          | Confidence |
|-------|--------------------|------------------|------------|
| #77   | QA-06              | NEEDS_REVIEW     | LOW        |
| #363  | CR-2026-05-19-H14  | ALREADY_FIXED    | HIGH       |
| #402  | CR-2026-05-19-M18  | STILL_OPEN       | HIGH       |
| #468  | CR-2026-05-21-063  | ALREADY_FIXED    | HIGH       |
| #514  | CR-2026-05-21-109  | PARTIALLY_FIXED  | HIGH       |
| #557  | CR-2026-05-21-152  | ALREADY_FIXED    | HIGH       |
| #590  | AUTH-04            | NEEDS_REVIEW     | LOW        |
| #606  | BILLING-04         | STILL_OPEN       | HIGH       |

**Net: 3 silently fixed (#363, #468, #557), 2 still open, 1 partial, 2 need runtime re-verification.**
