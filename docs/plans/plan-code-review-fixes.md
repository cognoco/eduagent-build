# Implementation Plan: Code Review Fixes

**Source:** `docs/plans/Code-review-discovery.md` (Epics 1-13 + UX Dead-End Audit)
**Date:** 2026-04-05
**Ordering:** Coding dependency sequence (not end-user value)
**Approach:** 4 phases, each internally parallelizable via work streams

---

## How to Read This Plan

- **Phases are sequential** — Phase 2 depends on Phase 1 completing, etc.
- **Streams within a phase are parallel** — assign to different agents/developers.
- Items marked `FIXED`, `INVALID`, or `DELIBERATE` in the discovery doc are excluded.
- Epic 13 findings beyond the 4 captured in discovery are noted as `[TRUNCATED]`.
- Severity from discovery doc preserved. `Cx` = Critical, `Hx` = High, `Mx` = Medium, `Lx` = Low.

---

## Dependency Diagram

```
Phase 1: Shared Contracts & Security
  |-- 1A: Epic 12 persona schema cascade (sequential: DB -> schemas -> factory)
  |-- 1B: Security & data-integrity fixes (parallel)
  +-- 1C: Billing/metering correctness (parallel)
        |
        v
Phase 2: API Backend -- Bugs, Performance & New Features
  |-- 2A: API bug fixes (parallel)
  |-- 2B: N+1 / performance fixes (parallel)
  |-- 2C: New Inngest crons -- review reminders & daily push (internal ordering)
  |-- 2D: Epic 12 API service cleanup (depends on 1A)
  +-- 2E: Architecture violation cleanup (parallel)
        |
        v
Phase 3: Mobile -- UX Dead-Ends, Persona & Missing Screens
  |-- 3A: Critical UX dead-ends (parallel)
  |-- 3B: High UX dead-ends (parallel)
  |-- 3C: Medium UX dead-ends (parallel)
  |-- 3D: Epic 12 mobile persona cleanup (depends on 1A + 2D)
  |-- 3E: Missing mobile screens & features (parallel)
  |-- 3F: Accessibility & polish (parallel)
  +-- 3G: Low UX dead-ends (parallel)
        |
        v
Phase 4: Test Coverage & Validation
  |-- 4A: Epic 6 service & hook tests -- 8 HIGH gaps (parallel)
  |-- 4B: Epic 7-8 tests (parallel)
  |-- 4C: Epic 9 billing/webhook tests (parallel)
  |-- 4D: Epic 1-5 missing tests (parallel)
  |-- 4E: Epic 10-13 tests + celebrations (parallel)
  |-- 4F: Stale test fixes (parallel)
  +-- 4G: Integration & E2E validation
```

---

## Phase 1: Shared Contracts & Security Hardening ✅ COMPLETE (2026-04-05)

> **Goal:** Fix the schema foundation and close all security/data-integrity gaps before any feature work.
> **Estimated scope:** ~18 items. Phase 1A is sequential; 1B and 1C are fully parallel with each other and with 1A's later steps.
> **Result:** All 18 items done. API tests: 1891 pass. Lint: clean. Typecheck: only expected Phase 2D persona cascade errors remain.

### Stream 1A — Epic 12 Persona Removal Cascade ✅

| Step | Severity | Status | Fix |
|------|----------|--------|-----|
| 1A.1 | CRITICAL | ✅ DONE | Migration `0012_tan_exodus.sql` drops `personaType` column + `persona_type` enum. |
| 1A.2 | CRITICAL | ✅ DONE | Removed `personaTypeSchema`, `PersonaType` type, and `personaType` fields from `profileCreateSchema` + `profileSchema`. |
| 1A.3 | CRITICAL | ✅ DONE | Removed `personaType: 'LEARNER'` from `buildProfile()` + updated factory test. |

**After 1A completes:** Streams 2D and 3D are now unblocked. Expected TS errors in `profile.ts`, `export.ts`, `test-seed.ts` until 2D is done.

### Stream 1B — Security & Data-Integrity Fixes ✅

| ID | Severity | Status | Fix Applied |
|----|----------|--------|-------------|
| 1B.1 | HIGH | ✅ DONE | `persistCurriculum` now takes `profileId`, verifies subject ownership via `db.query.subjects.findFirst`. Both route callers updated. |
| 1B.2 | HIGH | ✅ DONE | `addProfileToSubscription` calls `canAddProfile(db, subscriptionId)` before returning. Returns null when limit reached. |
| 1B.3 | CRITICAL | ✅ DONE | Null `accountId` now returns early with `{ received: true, error: 'Unknown app_user_id' }` + `console.warn`. HTTP 200 to avoid webhook retries. |
| 1B.4 | MED | ✅ DONE | `constantTimeCompare` takes `secret` parameter; caller passes `webhookSecret`. No more hardcoded `'webhook-compare'`. |
| 1B.5 | LOW | ✅ DONE | `requireProfileId(c.get('profileId'))` added at top of OCR endpoint. Updated 10 test requests with `X-Profile-Id` header. |
| 1B.6 | LOW | ✅ DONE | `loadTopicTitle` `profileId` parameter changed from optional to required. All callers already passed it. |

### Stream 1C — Billing & Metering Correctness ✅

| ID | Severity | Status | Fix Applied |
|----|----------|--------|-------------|
| 1C.1 | MED | ✅ DONE | `checkQuota` now receives real `topUpCreditsRemaining` from `getTopUpCreditsRemaining(db, subscriptionId)`. Added fast-path rejection via `result.allowed` before `decrementQuota`. |
| 1C.2 | MED | ✅ DONE | Both 402 responses (fast-path + decrement-failure) include actual `topUpCreditsRemaining`. |
| 1C.3 | MED | ✅ DONE | `isValidTransition()` wired into `updateSubscriptionFromRevenuecatWebhook`. Invalid transitions log a warning and return existing subscription unchanged. |
| 1C.4 | HIGH | ✅ NO-OP | KV write was already `await`-ed. Added clarifying comment. |
| 1C.5 | HIGH | ✅ DONE | `isTrial && !trialEndsAt` now logs error and falls back to non-trial activation instead of throwing. |
| 1C.6 | MED | ✅ DONE | Added `Number.isNaN(lastTs)` guard before timestamp comparison. |
| 1C.7 | MED | ✅ NO-OP | Both webhook files already call `refreshKvCache` after every `cancelledAt` update. No change needed. |
| 1C.8 | LOW | ✅ DONE | `periodEndTs` now reads subscription-level `current_period_end` via safe cast, falling back to item-level. |
| 1C.9 | LOW | ✅ DONE | `mockQuotaPoolRow` now includes `dailyLimit: null` and `usedToday: 0` defaults. |

### Tests updated alongside Phase 1

| Test File | What Changed |
|-----------|-------------|
| `factory/src/profiles.test.ts` | Removed `personaType: 'LEARNER'` from expected output |
| `routes/homework.test.ts` | Added `X-Profile-Id` header to all OCR test requests |
| `routes/profiles.test.ts` | Removed "invalid personaType" test, removed `personaType` from age-validation test body |
| `routes/sessions.test.ts` | Added `getTopUpCreditsRemaining` mock to billing mock |
| `middleware/metering.test.ts` | Added `getTopUpCreditsRemaining` mock, updated top-up/streaming tests for fast-path rejection |
| `services/interview.test.ts` | Updated `persistCurriculum` calls to pass `profileId`, added `subjects.findFirst` to mock DB |

---

## Phase 2: API Backend — Bugs, Performance & New Features

> **Goal:** Fix all API-side bugs, eliminate N+1 queries, and add missing Inngest cron triggers.
> **Estimated scope:** ~36 items. Streams 2A-2C and 2E are fully parallel. Stream 2D depends on Phase 1A.
> **Status (verified 2026-04-14):** 21/31 ✅ done, 2 ⚠️ partial, 8 ❌ open.

### Stream 2A — API Bug Fixes (PARALLEL) — 3/4 ✅

> ⚠️ **Adversarial review (2026-04-05):** 5 of original 9 items were invalid or misclassified (>50% error rate).
> Items sourced from the discovery doc should be re-verified against current code before implementation.

| ID | Epic | Severity | File | Fix | Verified By |
|----|------|----------|------|-----|-------------|
| 2A.1 | 1 | ~~MED~~ | `apps/api/src/routes/interview.ts:56-71` | ❌ **INVALID — ghost bug.** Code already does: (1) save history, (2) persistCurriculum, (3) mark completed. Both endpoints have explicit comment: "Only mark complete after curriculum is persisted." Implementing this "fix" would risk regression. | `review: interview.ts:57-71 verified correct ordering` |
| 2A.2 | 3 | ~~LOW~~ | `apps/api/src/services/retention-data.ts:333` | ❌ **INVALID — hardcoded values don't exist.** Mastery computed dynamically via `calculateMasteryScore('recall', quality / 5)`. DEPTH_CAPS in assessments.ts uses `recall: 0.5`, not 0.75/0.4. Discovery read wrong code. | `review: retention-data.ts:333, assessments.ts:33-37 verified dynamic` |
| ✅ 2A.3 | 4 | LOW | `apps/api/src/services/coaching-cards.ts:231` | Fix challenge card fallback: uses `profileId` as `topicId`. Replace with correct topic lookup. | `verified 2026-04-14: fallbackTopicId from allCards[0].topicId [BUG-55]` |
| ✅ 2A.4 | 3 | LOW | `apps/api/src/services/retention-data.ts:462-527` | Add `checkNeedsDeepeningCapacity` call in `startRelearn`. Per FR61-63, max 10 active needs-deepening topics per subject. | `verified 2026-04-14: checkNeedsDeepeningCapacity at line 519` |
| 2A.5 | 2 | ~~LOW~~ | `apps/api/src/services/session.ts:1285-1306` | ❌ **INVALID — misidentified CAS guard.** The UPDATE...WHERE status='active'...RETURNING (labeled BD-05 in code) is a compare-and-swap concurrency guard, not a duplicate read. Removing it would introduce a race condition allowing double-close. | `review: session.ts:1281-1309 verified CAS pattern` |
| 2A.6 | 4 | ~~MED~~ | `apps/api/src/services/progress.ts:254-258` | ❌ **INVALID — feature already exists.** `activeDeepening && retentionCard.failureCount >= 3 → 'blocked'` already implemented at line 254-258. | `review: progress.ts:254-258 verified blocked transition exists` |
| ✅ 2A.7 | 5 | MED | `apps/api/src/services/trial.ts:204-215` | Extend `getTrialWarningMessage` to include 7-day and 2-day milestones (currently only 3, 1, 0). | `verified 2026-04-14: handles 0,1,2,3,7 days [BUG-59]` |
| ~~2A.8~~ | 11 | HIGH | `apps/mobile/global.css:27` | ⚠️ **RECLASSIFIED → Phase 3** (mobile file, not API). Fix muted color fallback: change `#525252` to `#94a3b8` to match `tokens.teen.dark`. | |
| ~~2A.9~~ | 11 | MED | `apps/mobile/app.json:40,55` | ⚠️ **RECLASSIFIED → Phase 3** (mobile file, not API). Update splash/adaptive icon background from `#1e1b4b` to `#1a1a3e` (teen dark bg token). | |
| ❌ 2A.10 | 9 | HIGH | `apps/api/src/services/billing.ts:1332-1376` | Add `SELECT ... FOR UPDATE` row-level locking in `addProfileToSubscription` to prevent concurrent family quota pool corruption. 1B.2 added cap check but not the lock. | `verified 2026-04-14: no locking, sequential reads only` |

### Stream 2B — N+1 & Performance Fixes (PARALLEL) — 6/8 ✅

All independent — different service files, no shared callers.

| ID | Epic | Severity | File | Fix | Size | Verified By |
|----|------|----------|------|-----|------|-------------|
| ❌ 2B.1 | 1 | MED | `services/curriculum.ts:1065-1077` | Batch UPDATE with CASE expression instead of per-topic loop in `adaptCurriculumFromPerformance`. | S | `verified 2026-04-14: still per-topic UPDATE in loop inside tx` |
| ✅ 2B.2 | 2 | MED | `services/coaching-cards.ts:306-333` | Replace nested loop in `findContinueBookCard()` with single JOIN query (books -> topics -> sessions). | M | `verified 2026-04-14: batched inArray queries [BUG-63]` |
| 2B.3 | 2 | ~~LOW~~ | `services/session.ts:772` | ❌ **INVALID — LIMIT already exists.** Query at line 772 already has `.limit(60)`. The `.slice(0, 60)` at line 974 is redundant but harmless. No optimization needed. | — | `review: session.ts:772 verified .limit(60) in SQL` |
| ✅ 2B.4 | 3 | LOW | `services/retention-data.ts:529-552` | Move `subjectId` filter from JS to SQL WHERE in `getSubjectNeedsDeepening`. | S | `verified 2026-04-14: SQL WHERE on subjectId + status` |
| ✅ 2B.5 | 4 | MED | `services/progress.ts:456-498` | Batch `getContinueSuggestion`: query all subjects/curricula in one pass instead of per-subject loop. | M | `verified 2026-04-14: batched inArray queries` |
| ❌ 2B.6 | 4 | MED | `services/dashboard.ts:378-394` | Fix `getChildDetail` to query single child profile directly instead of fetching ALL children and filtering. | M | `verified 2026-04-14: still calls getChildrenForParent then .find()` |
| ✅ 2B.7 | 4 | MED | `services/interleaved.ts:101-122` | Replace N individual `findFirst` in `selectInterleavedTopics` with single `inArray` batch query. | M | `verified 2026-04-14: inArray batch [BUG-68]` |
| ✅ 2B.8 | 5 | MED | `services/billing.ts:756-795` | Replace N individual SELECT+UPDATE in `resetExpiredQuotaCycles` with single batch UPDATE...FROM join. | M | `verified 2026-04-14: single UPDATE...FROM join` |
| ✅ 2B.9 | 2 | LOW | `services/session.ts:501-561` | Add session-scoped cache for static lookups (profile/subject/curriculum) in `prepareExchangeContext`. | M | `verified 2026-04-14: sessionStaticContextCache [BUG-70]` |

### Stream 2C — New Inngest Crons: Review Reminders & Daily Push (INTERNAL ORDERING) — 0/4 ❌

Items have internal dependencies: FR42 must come first, then FR95 can follow.

> **Note (2026-04-14):** `recall-nudge.ts` exists and scans overdue retention cards, but emits `app/recall.nudge` (not `app/retention.review-due`). It does NOT satisfy 2C.1/2C.2 which require dedicated review-due and daily-reminder scan functions.

| ID | Epic | Severity | What | Build Order | Est. Lines | Verified By |
|----|------|----------|------|-------------|------------|-------------|
| ❌ 2C.1 | 2+4 | HIGH | **FR42/FR91: `review-due-scan` cron function.** New file. Cron scans `retentionCards` for `nextReviewAt <= now`, groups by profileId, emits `app/retention.review-due` events. | **First** | ~120 | `verified 2026-04-14: function does not exist` |
| ❌ 2C.2 | 4 | HIGH | **FR95: `daily-reminder-scan` cron function.** New file. Cron scans profiles with active streaks, emits daily reminder events. Calls existing `formatDailyReminderBody()`. | **Second** (or parallel with 2C.1) | ~150 | `verified 2026-04-14: function does not exist` |
| ❌ 2C.3 | 3 | LOW | **FR49: Verify SM-2 intervals.** No code change — verify that SM-2 naturally produces 14-day and 42-day intervals. If not, adjust `processRecallResult` parameters. | After 2C.1 | ~0 | `verified 2026-04-14: no verification done` |
| ❌ 2C.4 | — | — | **Register new functions.** Add `reviewDueScan` and `dailyReminderScan` to `apps/api/src/inngest/index.ts` exports. | After 2C.1+2C.2 | ~5 | `blocked by 2C.1+2C.2` |

**What already exists (no changes needed):**
- `review-reminder.ts` Inngest handler (event-triggered, complete)
- `notifications.ts` service (push delivery, formatting, logging)
- `settings.ts` (push token management, daily cap enforcement)

#### Failure Modes — 2C.1: `review-due-scan` cron

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Large scan timeout | >10k retention cards due | Nothing (background) | Paginate scan with cursor-based batching; emit partial results per page. Add Inngest step timeout. |
| Duplicate events on retry | Inngest retries after partial success | Duplicate push notifications | Make event emission idempotent: include `retentionCardId` + `scheduledDate` in event dedup key. |
| DST double-fire | Cron fires twice in DST spring-forward window | Duplicate scan | Idempotency key on `(profileId, scanDate)` — second scan is a no-op if events already emitted for that date. |
| No cards due | No retention cards with `nextReviewAt <= now` | Nothing | Early return, no events emitted. Log scan completion with zero-card count. |

#### Failure Modes — 2C.2: `daily-reminder-scan` cron

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Duplicate events on retry | Inngest retries after partial emission | Duplicate daily reminders | Include `(profileId, date)` dedup key in emitted events. Notification service enforces daily cap. |
| DST double-fire | Cron fires twice in DST transition | Duplicate scan | Same date-based idempotency as 2C.1. |
| Profile with no active streak | Streak data is stale or zero | Nothing | Filter profiles with `currentStreak > 0` in query. Don't emit events for inactive learners. |
| Push token expired | Profile's push token is stale | No notification delivered | Existing `notifications.ts` handles token expiry. Log failed deliveries for monitoring. |
| Scan timeout | Large user base, slow query | Delayed/missing reminders | Paginate by accountId ranges. Add step-level timeout with alerting. |

### Stream 2D — Epic 12 API Service Cleanup (DEPENDS ON 1A) ✅ ALL VERIFIED

All items depend on Phase 1A (schema removal) completing first. Within this stream, items are parallel.

| ID | Severity | File | Fix | Verified By |
|----|----------|------|-----|-------------|
| ✅ 2D.1 | HIGH | `apps/api/src/routes/consent-web.ts:279` | Review deep link `mentomate://home` post-persona-removal. ⚠️ Discovery cited wrong URL (`mentomate://parent/dashboard` — does not exist). Actual URL is `mentomate://home`. Verify this is correct for the post-persona routing; also check `mentomate://onboarding` at line 282. | `verified 2026-04-14: mentomate://home + mentomate://onboarding, no persona in URL` |
| ✅ 2D.2 | MED | `apps/api/src/services/profile.ts:179,188,200` | Remove persona age-gate check, remove `inferLegacyPersonaType` from input, compute from birthYear only. | `verified 2026-04-14: no personaType refs in file` |
| ✅ 2D.3 | MED | `apps/api/src/services/session.ts:775` | Simplify to `birthYearFromDateLike()` only — remove personaType-based computation. | `verified 2026-04-14: uses profile?.birthYear directly` |
| ✅ 2D.4 | MED | `apps/api/src/services/test-seed.ts:335,340,352,696,765,1154,1213,1297` | Remove 8 `personaType` references. Let personaType be auto-computed from birthYear. | `verified 2026-04-14: zero personaType matches` |
| ✅ 2D.5 | MED | `apps/api/src/services/profile.test.ts` | Update 22 test references to use birthYear/isOwner patterns instead of personaType. | `verified 2026-04-14: zero personaType matches` |
| ✅ 2D.6 | MED | `apps/api/src/services/export.ts` + `export.test.ts` | **MISSING FROM ORIGINAL PLAN.** Clean up persona references. | `verified 2026-04-14: zero personaType matches in both files` |
| ✅ 2D.7 | LOW | `apps/api/src/services/billing.test.ts:153` | **MISSING FROM ORIGINAL PLAN.** Mock profile builder includes `personaType: 'LEARNER'`. Remove after migration drops the column. | `verified 2026-04-14: makeProfile has no personaType` |

### Stream 2E — Architecture Violation Cleanup (PARALLEL) — 3/8 ✅

Low-priority consistency fixes. All independent.

| ID | Epic | Severity | File | Fix | Verified By |
|----|------|----------|------|-----|-------------|
| ⚠️ 2E.1 | 1 | LOW | `services/interview.ts:1` | Migrate raw ORM writes to scoped repository pattern. | `verified 2026-04-14: reads use scoped repo, writes still raw db.insert` |
| ⚠️ 2E.2 | 2 | LOW | `services/session.ts:139-176, 206-227` | Replace manual `profileId` filtering in `buildBookLearningHistoryContext` + `buildHomeworkLibraryContext` with scoped repo. | `verified 2026-04-14: still raw db.query with manual profileId filtering` |
| ⚠️ 2E.3 | 2 | LOW | `services/session.ts:307-316, 418-424` | Replace direct `db.insert(sessionEvents)` with scoped repo in `insertSessionEvent`. | `verified 2026-04-14: still direct db.insert, profileId set manually` |
| ✅ 2E.4 | 2 | LOW | `services/session.ts:1289-1294` | Document `closeStaleSessions` as intentional cross-profile batch exception. | `verified 2026-04-14: explicit comment at line 1736` |
| ⚠️ 2E.5 | 3 | LOW | `services/assessments.ts:309-328` | Replace raw `db.insert()` in `createAssessment` with scoped repo. | `verified 2026-04-14: still raw db.insert, profileId set manually` |
| 2E.6 | 5 | ~~LOW~~ | `services/stripe.ts:16-21` | ❌ **INVALID — bug doesn't exist.** Code is a clean factory function `createStripeClient(secretKey: string)` with no hardcoded key and no singleton. Discovery fabricated or referred to prior code state. | `review: stripe.ts:16-21 verified clean factory` |
| ✅ 2E.7 | 9 | LOW | `routes/billing.ts:131-206` | Guard or remove dormant Stripe checkout endpoints (marked "for mobile" but fully implemented). | `verified 2026-04-14: guarded by STRIPE_SECRET_KEY check, returns 404 if unconfigured` |
| ✅ 2E.8 | 9 | LOW | `mobile/src/lib/revenuecat.ts:34-46` | Add dev-mode warning when RevenueCat API key not configured (currently silent return). | `verified 2026-04-14: console.warn in __DEV__, console.error in prod` |
| ❌ 2E.9 | — | MED | Multiple service files | **MISSING FROM ORIGINAL PLAN.** 24 direct `console.warn`/`console.error` calls across 12 service files despite `services/logger.ts` existing. Replace with structured logger. | `verified 2026-04-14: all 4 sampled files still use console.* directly` |

---

## Phase 3: Mobile — UX Dead-Ends, Persona & Missing Screens

> **Goal:** Fix all user-facing dead-end states and complete persona removal on the mobile side.
> **Estimated scope:** ~53 items (includes 2 reclassified from 2A + 6 LOW UX added 2026-04-14). All streams are parallel except 3D (depends on 1A + 2D).
> **Status (verified 2026-04-14):** 47/53 ✅ done, 2 ⚠️ partial, 4 ❌ open.
>
> **Reclassified from Phase 2A** (mobile files, not API):
> - ~~2A.8~~ → **3F.12** | HIGH | `apps/mobile/global.css:27` | Fix muted color fallback: change `#525252` to `#94a3b8` to match `tokens.teen.dark`.
> - ~~2A.9~~ → **3F.13** | MED | `apps/mobile/app.json:40,55` | Update splash/adaptive icon background from `#1e1b4b` to `#1a1a3e` (teen dark bg token).

### Stream 3A — Critical UX Dead-Ends (PARALLEL) ✅ ALL VERIFIED

These are the 10 states where users get permanently stuck with no escape.

| ID | Flow | File | Fix | Needs API? |
|----|------|------|-----|------------|
| 3A.1 | Session | `session/index.tsx:930-934` | Make "Tap to reconnect" text an actual `Pressable` with `onPress` that retries `streamMessage`. | No |
| 3A.2 | Session | `session/index.tsx:1210-1238` | Add "Go Home" button in close-failure alert. Fallback: navigate to home even if server close failed. | No |
| 3A.3 | Library | `library.tsx:225-232, 476-493` | Add error state + retry button for `generateBookTopics` failure. Show timeout after 60s. | No |
| 3A.4 | Library | `library.tsx:506-577` | Add error fallback UI when `booksQuery` fails — show retry button instead of blank screen. | No |
| 3A.5 | Auth | `sign-up.tsx:130-135` | Add "Try Again" + "Back to Sign In" buttons when `setActive()` fails after email verification. | No |
| 3A.6 | Auth | `sign-in.tsx:217-222` | Add retry + "Back to Sign In" for `setActive()` failure after MFA verification. Same pattern as 3A.5. | No |
| 3A.7 | Auth | `sign-up.tsx:77-85` | Add "Try another method" fallback when OAuth `setActive()` fails. Cannot retry OAuth from same state. | No |
| 3A.8 | Parent | `child/[profileId]/index.tsx:172-228` | Detect null child (deleted/revoked) and show "Profile no longer available" with back navigation. | No |
| 3A.9 | Parent | `child/.../session/[sessionId].tsx:83-91` | Add empty-state message when `transcript.exchanges.length === 0` instead of blank ScrollView. | No |
| 3A.10 | Parent | `(parent)/_layout.tsx:150` | Replace redirect to learner home with "Add a child" CTA within parent dashboard context. | No |

### Stream 3B — High UX Dead-Ends (PARALLEL) ✅ ALL VERIFIED

| ID | Flow | File | Fix | Needs API? |
|----|------|------|-----|------------|
| 3B.1 | Session | `lib/sse.ts:240-249` | Surface timeout-specific error message instead of generic "Lost connection". | No |
| 3B.2 | Session | `session/index.tsx:309` | Detect 404 on session transcript fetch (expired session) and show "Session expired — start a new one". | No |
| 3B.3 | Session | `session.ts:881-893` + `session/index.tsx` | API: return `EXCHANGE_LIMIT_EXCEEDED` error code (not generic 429). Mobile: parse and show "Session limit reached" message. | **Yes** — coordinated API+mobile |
| 3B.4 | Session | `use-homework-ocr.ts:145-168` | Add "Type it yourself" manual entry fallback when both ML Kit and server OCR fail. | No |
| 3B.5 | Topic | `topic/[topicId].tsx:125-136` | Add back-navigation button to "Topic not found" state (currently relies on OS gesture). | No |
| 3B.6 | Topic | `topic/[topicId].tsx:70-75` | Add error/skeleton fallback when `useTopicRetention()` fails. | No |
| 3B.7 | Library | `library.tsx:326-336` | Show error toast when `updateSubject.mutateAsync()` fails (archive/pause). Currently silent. | No |
| 3B.8 | Topic | `topic/relearn.tsx:100-145` | Show error message when `startRelearn` mutation fails. Currently sets `isSubmitting(false)` silently. | No |
| 3B.9 | Subscription | `subscription.tsx:928-972` | Add retry button + "Contact support" link when RevenueCat offerings fail. Static cards need purchase CTA. | No |
| 3B.10 | Parent | `subscription.tsx:316-332` | Fix cooldown timer: update every 1s near expiry (not 60s). Ensure button enables immediately at 0. | No |
| 3B.11 | Parent | `dashboard.tsx:140-173` | Add navigation to Library/More tabs in timeout error state (not just "Retry"). | No |

### Stream 3C — Medium UX Dead-Ends (PARALLEL) — 16/17 ✅

| ID | Flow | File | Fix |
|----|------|------|-----|
| ✅ 3C.1 | Session | `session/index.tsx:803-818` | Surface `SubjectInactiveError` reason (paused/archived) instead of generic "connection error". |
| ✅ 3C.2 | Session | `session/index.tsx:249-250` | Show offline banner proactively (on connectivity change), not just after failed send. |
| ✅ 3C.3 | Session | `lib/session-recovery.ts:61-67` | Show "You had a session in progress" prompt when recovery window (30 min) recently expired. |
| ✅ 3C.4 | Session | `session/index.tsx:535-548` | Don't clear recovery marker until server close API succeeds. Currently clears optimistically. |
| ✅ 3C.5 | Session | `homework/camera.tsx:102-131` | Add "Create New Subject" option in homework classification picker when no subjects match. |
| ✅ 3C.6 | Library | `library.tsx:479-493` | Add cancel button + 90s auto-timeout for book generation "Writing your book..." state. |
| ⚠️ 3C.7 | Library | `library.tsx:127-137` | Distinguish "no topics" from "failed to load topics" in empty state message. **PARTIAL: TopicsTab shows same empty state for both; retention query errors produce silent empty.** |
| ✅ 3C.8 | Onboarding | `onboarding/interview.tsx:162-170` | Disable input field when stream error occurs. Currently stays active, messages fail silently. |
| ✅ 3C.9 | Onboarding | `onboarding/interview.tsx:89-101` | Add try/catch to "Restart Interview" button. Currently no error recovery. |
| ✅ 3C.10 | Onboarding | `onboarding/language-setup.tsx:68-83` | Disable submit button during API call to prevent duplicate language-setup submissions. |
| ✅ 3C.11 | Profile | `create-profile.tsx:120-160` | Guard `switchProfile()` call — don't execute if API creation failed. |
| ✅ 3C.12 | Profile | `profiles.tsx:17-24` | Add error handling to `handleSwitch()` — show alert if `switchProfile()` fails. |
| ✅ 3C.13 | Profile | `delete-account.tsx:35-43` | Don't navigate away (`router.back()`) if `cancelDeletion.mutateAsync()` fails. |
| ✅ 3C.14 | Settings | `more.tsx:329-338` | Add try/catch to `signOut()`. Show error if Clerk sign-out fails. |
| ✅ 3C.15 | Parent | `child/[profileId]/index.tsx:305-336` | Add refresh button when consent grace period expires (daysRemaining === 0). |
| ✅ 3C.16 | Subscription | `subscription.tsx:598-672` | Add "Check your usage" button in top-up polling stall fallback alert. |
| ✅ 3C.17 | Subject | `create-subject.tsx:59-108` | Add guidance ("delete an old subject first") when subject limit error appears. |

### Stream 3D — Epic 12 Mobile Persona Cleanup (DEPENDS ON 1A + 2D) ✅ ALL VERIFIED

| ID | Severity | File | Fix |
|----|----------|------|-----|
| ✅ 3D.1 | CRITICAL | `apps/mobile/src/app/create-profile.tsx:34-135` | Remove `personaType` state, auto-detection, and request body field. Delete commented persona picker. |
| ✅ 3D.2 | HIGH | `apps/mobile/src/app/profiles.tsx:74` | Derive role label from `birthYear` / `isOwner` instead of `personaType`. |
| ✅ 3D.3 | HIGH | `apps/mobile/src/app/_layout.tsx:86-129` | Remove `schemeForPersona()`. Derive theme from `activeProfile.birthYear` age bracket. |

### Stream 3E — Missing Mobile Screens & Features (PARALLEL) — 0/4 ❌

| ID | Epic | Severity | Description |
|----|------|----------|-------------|
| ❌ 3E.1 | 3 | MED | **TEACH_BACK screen.** Create `teach-back.tsx` with voice I/O UI. Backend processes TEACH_BACK results but no learner-facing screen exists. Wire `useSpeechRecognition` + `useTextToSpeech`. |
| ❌ 3E.2 | 3 | LOW | **EVALUATE screen.** Create `evaluate-challenge.tsx` (Devil's Advocate). API has eligibility checking + difficulty rung management but no mobile screen. |
| ❌ 3E.3 | 4 | MED | **"Your Words" summaries (FR68).** Display learner-authored words in topic progress, not just AI-generated `summaryExcerpt`. |
| ❌ 3E.4 | 4 | MED | **Knowledge decay visualization (FR90).** Add time-based decay bar to `RetentionSignal`, not just categorical strong/fading/weak/forgotten. |

### Stream 3F — Accessibility, Voice & Polish (PARALLEL) — 12/13 ✅

| ID | Epic | Severity | File | Fix |
|----|------|----------|------|-----|
| ✅ 3F.1 | 10 | HIGH | `consent.tsx:59-80` | Respect `useReducedMotion()` in consent phase transition animations. Raw `Animated.timing` ignores it. |
| ✅ 3F.2 | 10 | MED | `index.tsx:13`, `topic/[topicId].tsx:80` | Replace hardcoded `color="#71717a"` with `useThemeColors().muted` on ActivityIndicators. |
| ✅ 3F.3 | 10 | MED | `create-subject.tsx:376-388` | Increase touch target on "Just use my words" button (py-2 ~8px is below 44px minimum). |
| ✅ 3F.4 | 10 | MED | `consent.tsx:229-236` | Add `accessibilityRole="alert"` to inline email validation error text. |
| ✅ 3F.5 | 8 | MED | `session/index.tsx:735` | Add error handling to `setSessionInputMode` mutation. Currently diverges local/server state on failure. |
| ✅ 3F.6 | 8 | MED | `use-speech-recognition.ts:106-121` | Log (don't silently filter) malformed native STT events. |
| ✅ 3F.7 | 7 | HIGH | `hooks/use-books.ts:102-110` | Fix stale closure in `useGenerateBookTopics` — `subjectId`/`bookId` captured from wrong render in `onSuccess`. |
| ⚠️ 3F.8 | 7 | MED | `library.tsx:235` | Add `generateBookTopics.isPending` to useEffect dependency array. **PARTIAL: isPending guard is in effect body, not dep array; code lives in book/[bookId].tsx, not library.tsx.** |
| ✅ 3F.9 | 13 | MED | `lib/session-recovery.ts:37-46` | Scope recovery key to profileId to prevent cross-profile marker collision on rapid switch. |
| ✅ 3F.10 | 1 | MED | `hooks/use-resolve-subject.ts:15` | Add `assertOk(res)` before reading response JSON. 4xx/5xx errors currently swallowed silently. |
| ✅ 3F.11 | 1 | LOW | `hooks/use-classify-subject.ts:15` | Same `assertOk(res)` fix as 3F.10. |
| ✅ 3F.12 | 11 | HIGH | `global.css:27` | Fix muted color fallback: change `#525252` to `#94a3b8` to match `tokens.teen.dark`. *(Reclassified from 2A.8)* |
| ✅ 3F.13 | 11 | MED | `app.json:40,55` | Update splash/adaptive icon background from `#1e1b4b` to `#1a1a3e` (teen dark bg token). *(Reclassified from 2A.9)* |

### Stream 3G — Low UX Dead-Ends (PARALLEL) — 4/6 ✅

> **Added 2026-04-14.** These 6 LOW UX findings from the discovery audit were missing from the original plan. All follow the same anti-pattern: silent failures without user feedback.

| ID | UX# | Flow | File | Fix |
|----|------|------|------|-----|
| ✅ 3G.1 | UX-39 | Session | `session/index.tsx:1293-1315` | Add error toast when quick chip event recording fails. **Best-effort with confirmation toast fires unconditionally.** |
| ✅ 3G.2 | UX-40 | Session | `session/index.tsx:802-818` | Disable input field when no session can be created. |
| ⚠️ 3G.3 | UX-41 | Onboarding | `onboarding/analogy-preference.tsx:20-29` | Add error handling to analogy preference mutation. **OPEN: `onSettled` navigates regardless of success/failure, no error feedback.** |
| ✅ 3G.4 | UX-42 | Profile | `(app)/_layout.tsx:721-728` | Prevent profile-removed alert from reappearing on every re-render. |
| ✅ 3G.5 | UX-43 | Home | `components/home/LearnerScreen.tsx:78-96` | Show guidance to add a subject when library is empty. **"Start learning" intent card always present.** |
| ✅ 3G.6 | UX-44 | Home | `hooks/use-home-cards.ts:16-35` | Show error indicator when coaching cards query fails. **N/A: coaching cards removed; intent cards with error state replace them.** |

---

## Phase 4: Test Coverage & Validation

> **Goal:** Close all test gaps identified in the review. Can start partially during Phase 2-3 for items that don't depend on code changes.
> **Estimated scope:** ~58 items (includes items added 2026-04-14). All streams fully parallel.
> **Status (verified 2026-04-14):** 45/58 ✅ done, 6 ⚠️ partial, 7 ❌ open.

### Stream 4A — Epic 6 Service & Hook Tests (8 HIGH gaps) — 7/8 ✅

These are the highest-severity test gaps in the entire review.

| ID | File | Tests Needed |
|----|------|-------------|
| ✅ 4A.1 | `services/vocabulary.ts` | Unit tests for `listVocabulary`, `createVocabulary`, `updateVocabulary`, `reviewVocabulary`, `ensureVocabularyRetentionCard`, `upsertExtractedVocabulary`, `getVocabularyDueForReview`. |
| ✅ 4A.2 | `services/language-curriculum.ts` | Unit tests for `generateLanguageCurriculum`, `regenerateLanguageCurriculum`, `getCurrentLanguageProgress`, `getCurrentLanguageMilestoneId`. |
| ✅ 4A.3 | `services/language-detect.ts` | Unit tests for `detectLanguageSubject`. |
| ⚠️ 4A.4 | `services/vocabulary-extract.ts` | Unit tests for `extractVocabularyFromTranscript` including malformed LLM JSON. **PARTIAL: malformed JSON tested, but no `extractJson()` partial-match test.** |
| ✅ 4A.5 | `services/language-prompts.ts` | Unit tests for `buildFourStrandsPrompt`. |
| ✅ 4A.6 | `inngest/functions/session-completed.ts:262-350` | Tests for `update-vocabulary-retention` step. |
| ✅ 4A.7 | `hooks/use-vocabulary.ts` | Unit tests for `useVocabulary`, `useCreateVocabulary`, `useReviewVocabulary`. |
| ✅ 4A.8 | `hooks/use-language-progress.ts` | Unit tests for `useLanguageProgress`. |

### Stream 4B — Epic 7-8 Tests (PARALLEL) — 9/13 ✅

| ID | Epic | File | Tests Needed |
|----|------|------|-------------|
| ✅ 4B.1 | 7 | `services/book-generation.test.ts` | Error cases: malformed LLM JSON, schema validation failure, `extractJson()` partial match. |
| ✅ 4B.2 | 7 | `services/curriculum.ts:515-654` | Test `persistBookTopics` idempotency and race condition handling. |
| ✅ 4B.3 | 7 | `inngest/functions/book-pre-generation.ts` | Test pre-generation for next books, early return, error handling, null birthYear fallback. |
| ✅ 4B.4 | 7 | `hooks/use-books.ts` | Tests for error states, disabled queries, cache invalidation on mutation success. |
| ✅ 4B.5 | 8 | `components/session/VoiceRecordButton.tsx` | Tests for haptic feedback, disabled state, animation states during listening. |
| ✅ 4B.6 | 8 | `components/session/VoiceToggle.tsx` | Tests for accessibility labels, toggle state transitions, voice mode persistence. |
| ✅ 4B.7 | 8 | `components/session/ChatShell.tsx:176-196` | Tests for screen-reader detection lifecycle: TTS suppression, listener cleanup, auto->manual transition. |
| ✅ 4B.8 | 8 | `hooks/use-speech-recognition.ts` | Tests for unmount race condition, rapid `startListening` calls, listener cleanup on hot reload. |
| ⚠️ 4B.9 | 7 | `routes/books.test.ts:155-354` | Test `NotFoundError` propagation: verify service error converted to `notFound()` response. **PARTIAL: 404 tests exist but stub null return, not NotFoundError.** |
| ✅ 4B.10 | 8 | `hooks/use-text-to-speech.ts:113` | Test that `setRate()` only affects next `speak()` call, not currently-playing audio. |
| ❌ 4B.11 | 8 | `components/session/ChatShell.tsx:252-256` | Test STT-to-transcript race condition: `stopListening()` completes but transcript not yet in state. |
| ✅ 4B.12 | 8 | `routes/sessions.ts:267-281` | Test POST `/sessions/:sessionId/input-mode` with invalid input modes — verify 400. |
| ❌ 4B.13 | 8 | `session/index.tsx` | Test `inputMode` parameter propagation to `startSession` API call. |

### Stream 4C — Epic 9 Billing & Webhook Tests (PARALLEL) ✅ ALL VERIFIED

| ID | File | Tests Needed |
|----|------|-------------|
| ✅ 4C.1 | `routes/revenuecat-webhook.test.ts` | **Webhook signature verification** — valid + invalid Authorization headers. |
| ✅ 4C.2 | `services/billing.test.ts` + `middleware/metering.test.ts` | `decrementQuota` edge cases: concurrent over-decrement, daily before monthly, race with top-up expiry. |
| ✅ 4C.3 | `routes/revenuecat-webhook.test.ts` | Idempotency: out-of-order events, null `event_timestamp_ms`, duplicate transaction IDs. |
| ✅ 4C.4 | `routes/stripe-webhook.test.ts` | Signature verification failure tests (mock currently always succeeds). |
| ✅ 4C.5 | `services/billing.test.ts` | `purchaseTopUpCredits` idempotency: concurrent same transactionId, free-tier purchase. |
| ✅ 4C.6 | `services/billing.test.ts` | `getTopUpCreditsRemaining` with credits expiring during query. |
| ✅ 4C.7 | `middleware/metering.test.ts` | KV cache write failures — verify `safeWriteKV` fallback to DB. |
| ✅ 4C.8 | `services/billing.test.ts` | `addProfileToSubscription` max profile cap test (after 1B.2 implements the cap). |
| ✅ 4C.9 | `services/billing.test.ts` | `removeProfileFromSubscription` throws `ProfileRemovalNotImplementedError` test. |
| ✅ 4C.10 | `services/billing.ts:1548-1601` | `updateSubscriptionFromRevenuecatWebhook` — timestamp idempotency, partial update logic. |
| ✅ 4C.11 | `inngest/functions/trial-expiry.ts` | Timezone edge cases: UTC+12, UTC-12, DST transitions in `computeTrialEndDate`. |
| ✅ 4C.12 | `inngest/functions/quota-reset.ts` | DST transition handling for daily quota reset at 01:00 UTC. |

### Stream 4D — Epic 1-5 Missing Tests (PARALLEL) — 7/9 ✅

| ID | Epic | File | Tests Needed |
|----|------|------|-------------|
| ✅ 4D.1 | 1 | `routes/curriculum.test.ts` | Route-level test for `POST /v1/subjects/:subjectId/curriculum/adapt` (FR21). |
| ✅ 4D.2 | 1 | `hooks/use-resolve-subject.ts` | Co-located hook test file. |
| ✅ 4D.3 | 1 | `hooks/use-classify-subject.ts` | Co-located hook test file. |
| ✅ 4D.4 | 2 | `services/session.ts` | Unit tests for `streamMessage()` streaming path with onComplete callback. |
| ⚠️ 4D.5 | 2 | `services/recall-bridge.ts` | Integration test for full `/sessions/:sessionId/recall-bridge` flow with homework guard. **PARTIAL: unit test with mocks exists, not true integration test.** |
| ⚠️ 4D.6 | 3 | `inngest/functions/session-completed.test.ts` | Migrate from manual step extraction to `InngestTestEngine`. Test step-level retries. **PARTIAL: still manual step extraction; `inngest/test` not installed.** |
| ✅ 4D.7 | 4 | `services/streaks.test.ts:346-354` | Implement `.todo` tests for `getStreakData` and `getXpSummary`. |
| ✅ 4D.8 | 4 | `services/coaching-cards.ts` | Create co-located test file. Test precompute logic with 5 priority tiers. |
| ✅ 4D.9 | 1 | `apps/mobile/src/app/(app)/onboarding/interview.tsx` | Co-located InterviewScreen test. Cover SSE streaming, draft resumption, expiration, and restart flows. |

### Stream 4E — Epic 10-13 Tests (PARALLEL) — 6/8 ✅

| ID | Epic | File | Tests Needed |
|----|------|------|-------------|
| ✅ 4E.1 | 10 | `consent.test.tsx` | Add reduced-motion behavior tests (23 tests exist but none verify animation respects `prefers-reduced-motion`). |
| ✅ 4E.2 | 10 | `create-subject.test.tsx` | Touch target accessibility tests on suggestion cards. |
| ✅ 4E.3 | 11 | `lib/theme.ts` | Unit tests for `useTheme()`, `useThemeColors()`, `useTokenVars()` — persona switching, color scheme changes. |
| ❌ 4E.4 | 12 | `routes/home-cards.test.ts:81,126` | Unskip tests when middleware mock infrastructure is ready. **Test file does not exist.** |
| ✅ 4E.5 | 13 | `components/common/celebrations/` | Tests for `CelestialCelebration`, `PolarStar`, `TwinStars`, `Comet`, `OrionsBelt` — animation lifecycle + `onComplete` cleanup. |
| ✅ 4E.6 | 13 | `inngest/functions/session-stale-cleanup.ts` | Test race (session resumed before close), concurrent closures on same profile, failure handling. |
| ✅ 4E.7 | 13 | `services/session-lifecycle.test.ts` | Test `normalizeExpectedResponseMinutes` boundary at MIN (currently clamps to 1, spec says 2). |
| ❌ 4E.8 | 11 | `components/AnimatedSplash.tsx` | Contract tests for splash color accuracy in light/dark modes and accent preset fallback. **Test file does not exist.** |

### Stream 4F — Stale Test & Type Safety Fixes (PARALLEL) — 4/8 ✅

| ID | Epic | File | Fix |
|----|------|------|-----|
| ⚠️ 4F.1 | 2 | `services/session.test.ts` | Replace heavy mocking (8+ modules). Mock for `buildPriorLearningContext` always returns empty — FR40 never exercised. **PARTIAL: still 10 mocks, buildPriorLearningContext still empty.** |
| ✅ 4F.2 | 6 | `hooks/use-vocabulary.ts:24` | Fix `as never` type cast — improve Hono RPC typing for optional route parameters. |
| ✅ 4F.3 | 6 | `hooks/use-language-progress.ts:20` | Same `as never` type cast fix. |
| ✅ 4F.4 | 6 | `routes/subjects.ts:97-124` | Add direct route tests for PUT `/subjects/:id/language-setup` error scenarios. |
| ❌ 4F.5 | 6 | `components/language/FluencyDrill.test.tsx` | Test timeout callback invocation. **Component and test file both do not exist.** |
| ✅ 4F.6 | 10 | E2E docs | Verify `docs/E2Edocs/e2e-bug-fix-plan.md` references against current code — BYOK section, raw_input column. |
| ❌ 4F.7 | 6 | `apps/mobile/src/app/(app)/onboarding/language-setup.test.tsx` | Add error scenario tests — failed API calls, validation errors. **Only happy-path tests exist (60 lines).** |
| ⚠️ 4F.8 | 8 | `packages/database/src/schema/sessions.ts:133` | Document or address `inputMode` stored as text column (not enum). **PARTIAL: still text column, no documentation comment.** |

---

## Low-Priority / Deferred Items

These items from the discovery doc are intentionally deferred or informational only.

| ID | Epic | Reason | Description |
|----|------|--------|-------------|
| DEF-1 | 8 | DEFERRED Story 8.4 | VoiceOver/TalkBack coexistence — audio ducking, priority negotiation. Requires physical device testing. |
| DEF-2 | 9 | UNIMPLEMENTED | `removeProfileFromSubscription` — always throws `ProfileRemovalNotImplementedError`. Document timeline. |
| DEF-3 | 9 | DORMANT | Stripe checkout endpoints — fully implemented but web client may never ship. Guard or document. |
| DEF-4 | 1 | LOW | LLM JSON validation — `generateCurriculum` + `resolveSubjectName` parse without full Zod validation. Defensive helpers partially mitigate. |
| DEF-5 | 2 | LOW | FR33 "guided problem-solving" display label in Library. Homework sessions use `sessionType: 'homework'` but label not implemented. |
| DEF-6 | 2 | LOW | FR37 skip-summary consequences — counter + warnings exist but no server-side XP/streak penalties. |
| DEF-7 | 4 | LOW | FR83 restore archived subjects — in Library "Manage" modal, spec says Settings. May be intentional UX consolidation. |
| DEF-8 | 5 | LOW | FR117 per-profile usage breakdown for family plans — not surfaced in `/v1/usage`. |
| DEF-9 | 13 | TRUNCATED | Epic 13 discovery truncated at 4/19 findings. Remaining 15 items (8 med + 7 low) need separate discovery pass. |
| DEF-10 | 2 | LOW | FR36 guided self-correction — system prompt includes "Not Yet" framing but no explicit self-correction prompt step. Partially fulfilled via escalation ladder. |
| DEF-11 | 6 | LOW | `configureLanguageSubject` returns subject before curriculum regeneration completes. Returned subject doesn't reflect updated curriculum state. |
| DEF-12 | 6 | LOW | `vocabularyCreateSchema` defines `cefrLevel` as optional (not nullable), but DB allows NULL. Runtime `?? null` masks the schema imprecision. |
| DEF-13 | 7 | LOW | `claimBookForGeneration` verifies subject ownership but doesn't verify book belongs to that subject in the same query. Relies on separate check. |
| DEF-14 | 7 | LOW | Parent library route (`(parent)/library.tsx`) just re-exports learner library. No custom logic — dead code candidate. |
| DEF-15 | 8 | LOW | `inputMode` effect in `ChatShell.tsx:166-170` redundant with initial state initialization at line 131-135. |
| DEF-16 | 8 | LOW | `VoicePlaybackBar.test.tsx` — rate cycling test doesn't cover: cycling from rate outside standard cycle, `nextRate()` with invalid input, UI update latency. |
| DEF-17 | 9 | LOW | `computeTrialEndDate` uses complex `Intl.DateTimeFormat` logic. No property-based tests for timezone correctness (4C.11 covers specific edges only). |
| DEF-18 | 10 | LOW | `consent-copy.ts:53-85` — copy functions accept generic `Persona` but consent.tsx hardcodes variants. Persona selection could be more explicit. |
| DEF-19 | 10 | LOW | No evidence of Galaxy S10e 5.8" performance validation for consent animation (300ms fade x2). |
| DEF-20 | 11 | LOW | `design-tokens.ts:48` — persona-indexed tokens structure creates implicit coupling. Personas cannot be added without updating the type. |
| DEF-21 | 12 | LOW | `resolveAgeBracket` not directly tested. Discovery notes "coverage adequate via integration." |

---

## Execution Notes

### Parallelization Strategy

| Phase | Parallel Streams | Sequential Dependencies |
|-------|-----------------|------------------------|
| 1 | 1B + 1C run parallel with each other and with 1A steps 2-3 | 1A is internally sequential (DB -> schemas -> factory) |
| 2 | 2A + 2B + 2C + 2E all parallel | 2D waits for 1A. 2C has internal ordering (FR42 -> FR95). |
| 3 | 3A + 3B + 3C + 3E + 3F + 3G all parallel | 3D waits for 1A + 2D. |
| 4 | All streams parallel | 4C.8 waits for 1B.2. 4E.4 waits for middleware fix. |

### Critical Path

The longest dependency chain determines minimum calendar time:

```
1A.1 (DB migration) -> 1A.2 (schemas) -> 1A.3 (factory)
  -> 2D (API persona cleanup) -> 3D (mobile persona cleanup)
```

Everything else runs in parallel alongside this chain.

### Item Counts by Phase (updated 2026-04-14)

| Phase | Valid Items | ✅ Done | ⚠️ Partial | ❌ Open | Invalid/Reclassified |
|-------|-------------|---------|------------|--------|---------------------|
| Phase 1 | 18 | 18 | 0 | 0 | 0 |
| Phase 2 | 31 | 21 | 2 | 8 | 8 (6 INVALID + 2 reclassified to P3) |
| Phase 3 | 53 | 47 | 2 | 4 | 0 (+ 2 received from P2) |
| Phase 4 | 58 | 45 | 6 | 7 | 0 |
| Deferred | 22 | — | — | — | — |
| **Total** | **182** | **131 (72%)** | **10 (5%)** | **19 (10%)** | **8** |

*Note: Excludes 5 FIXED/INVALID/DELIBERATE items from discovery doc + 15 truncated Epic 13 items.*
*2026-04-14: Full code verification audit. Added 29 missing discovery items (Stream 3G, items 2A.10, 4B.9-13, 4D.9, 4E.8, 4F.7-8, DEF-10 through DEF-21). All 160 non-deferred items verified against current code.*

### Discovery Reliability Warning

> ⚠️ **Stream 2A had a >50% error rate** (5 of 9 items were invalid or misclassified). This raises
> questions about the reliability of the discovery document that sourced these findings. Streams 2B–2E
> were presumably sourced from the same analysis. **Recommendation:** Verify each remaining Phase 2
> item against current code before implementation, not just after.
