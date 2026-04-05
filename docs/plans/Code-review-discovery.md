# Code Review Discovery — Epics 1-5

**Date:** 2026-04-05
**Reviewer:** 5 parallel code-reviewer agents against FR requirements, ARCH rules, and UX specs
**Scope:** Full implementation audit of Epics 1-5 (FR13-FR117)

---

## Summary by Epic

| Epic | Health | Highs | Meds | Lows | Key Concern |
|------|--------|-------|------|------|-------------|
| 1 — Onboarding & Curriculum | Good | 1 | 3 | 8 | Missing ownership check in `persistCurriculum`; draft completion ordering bug |
| 2 — Learning & Homework | Good | 0 | 4 | 11 | Review reminders unwired; streaming path untested; N+1 in coaching cards |
| 3 — Assessment & Retention | Good | 0 | 2 | 7 | No mobile screens for EVALUATE/TEACH_BACK; coaching cards use DB not KV (DELIBERATE) |
| 4 — Progress & Dashboard | Substantial | 2 | 6 | 4 | Push notification cron missing; review reminder trigger missing; N+1 patterns |
| 5 — Billing & Subscriptions | Good | 1 | 4 | 5 | Profile-cap not enforced; state machine unused; quota mismatch FIXED |

**Cross-epic theme:** Review reminders (FR42/FR91/FR95) are wired but have no trigger — the Inngest function exists but nothing emits the `app/retention.review-due` event or schedules a daily cron scan.

### Validation Pass (2026-04-05)

All High and Medium findings were re-verified against latest specs and code:
- **25 CONFIRMED** — real issues still in code
- **3 INVALID** — finding was wrong or already fixed (marked inline with ~~strikethrough~~)
- **2 DELIBERATE** — intentional product/architecture decisions (marked inline)

---

## Findings

| Epic | Category | Severity | File:Line | Description |
|------|----------|----------|-----------|-------------|
| Epic 1 | SECURITY | High | `apps/api/src/services/interview.ts:373` | `persistCurriculum` does not verify that `subjectId` belongs to the calling profile. It receives `subjectId` directly and inserts into `curricula` and `curriculumTopics` without ownership check. The caller (route handler) verifies via `getSubject`, but the service function itself has no guard — a refactor that calls `persistCurriculum` from a different context could write curriculum data to another user's subject. |
| Epic 1 | BUG | Med | `apps/api/src/routes/interview.ts:56-66` | Non-streaming interview endpoint marks draft as `completed` BEFORE calling `persistCurriculum`. If `persistCurriculum` fails, the draft is already marked completed and the user cannot retry — the curriculum is lost. The streaming endpoint correctly handles ordering (save history -> persist curriculum -> mark completed). |
| Epic 1 | BUG | Med | `apps/mobile/src/hooks/use-resolve-subject.ts:15` | `useResolveSubject` does not call `assertOk(res)` before reading response JSON. 4xx/5xx errors will silently return error body as if it were a valid `SubjectResolveResult`. |
| Epic 1 | BUG | Low | `apps/mobile/src/hooks/use-classify-subject.ts:15` | `useClassifySubject` also missing `assertOk(res)` — same silent error swallowing as above. |
| Epic 1 | PERF | Med | `apps/api/src/services/curriculum.ts:1065-1077` | `adaptCurriculumFromPerformance` updates each topic's `sortOrder` individually in a loop inside a transaction. For 15 topics, this is 15 sequential UPDATEs. Batch UPDATE with CASE expression would be more efficient. |
| Epic 1 | ARCH_VIOLATION | Low | `apps/api/src/services/interview.ts:1` | Interview service writes via raw ORM (`db.update`/`db.insert`) with manual `eq(onboardingDrafts.profileId, profileId)`. Functionally correct but inconsistent with repository pattern. |
| Epic 1 | MISSING_TEST | Med | `apps/api/src/routes/curriculum.test.ts` | No test for `POST /v1/subjects/:subjectId/curriculum/adapt` endpoint (FR21). Service-level tests exist but route-level validation, auth, and error handling are untested. |
| Epic 1 | MISSING_TEST | Low | `apps/mobile/src/app/(learner)/onboarding/interview.tsx` | InterviewScreen has no co-located test. SSE streaming, draft resumption, expiration, and restart only tested indirectly via hook tests. |
| Epic 1 | MISSING_TEST | Low | `apps/mobile/src/hooks/use-resolve-subject.ts` | No test file for `useResolveSubject` hook. |
| Epic 1 | MISSING_TEST | Low | `apps/mobile/src/hooks/use-classify-subject.ts` | No test file for `useClassifySubject` hook. |
| Epic 1 | MISSING | Low | `apps/api/src/services/curriculum.ts:76` | `generateCurriculum` parses LLM response with `JSON.parse` but does not validate against `GeneratedTopic` schema. Malformed LLM output passes through unvalidated into DB. A `z.array(generatedTopicSchema).parse()` call would catch this. |
| Epic 1 | MISSING | Low | `apps/api/src/services/subject-resolve.ts:63-64` | `resolveSubjectName` parses LLM JSON without full Zod validation. Defensive helpers partially mitigate, but a full schema parse would be more robust. |
| Epic 2 | MISSING | Med | N/A | FR42 (review reminder notifications): Push notification infrastructure exists (`review-reminder.ts` Inngest function + `notifications.ts` service), but no Inngest cron or event trigger dispatches `app/retention.review-due` events. The reminder function exists but is never invoked. |
| Epic 2 | ~~MISSING~~ | ~~Med~~ | N/A | **DELIBERATE.** UX-10 (session length caps): Hard caps deliberately removed per `project_session_lifecycle_decisions.md` / Epic 13. `SessionTimer` is display-only. Adaptive silence detection (UX-12) IS implemented. |
| Epic 2 | MISSING_TEST | Med | `apps/api/src/services/session.ts` | `streamMessage()` has no dedicated unit tests. The streaming path with different persistence timing (onComplete callback) is untested. |
| Epic 2 | PERF | Med | `apps/api/src/services/coaching-cards.ts:306-333` | `findContinueBookCard()` uses nested loop: for each book, queries all topics, then for each topic queries if a session exists. O(N*M) queries. Use single query with LEFT JOIN instead. |
| Epic 2 | ARCH_VIOLATION | Low | `apps/api/src/services/session.ts:139-176` | `buildBookLearningHistoryContext()` reads `learningSessions` filtered by `profileId` manually rather than via scoped repo. Same pattern at `buildHomeworkLibraryContext()` lines 206-227. |
| Epic 2 | ARCH_VIOLATION | Low | `apps/api/src/services/session.ts:1289-1294` | `closeStaleSessions()` reads all active sessions across all profiles without scoping. Intentional batch cron pattern but should be documented as exception. |
| Epic 2 | ARCH_VIOLATION | Low | `apps/api/src/services/session.ts:307-316, 418-424` | `insertSessionEvent()` uses direct `db.insert(sessionEvents)` without scoped repo. ProfileId manually included — data integrity maintained but inconsistent. |
| Epic 2 | PERF | Low | `apps/api/src/services/session.ts:501-561` | `prepareExchangeContext()` fires 10 parallel queries on every exchange. Profile/subject/curriculum lookups are static during session — could use session-scoped cache. |
| Epic 2 | PERF | Low | `apps/api/src/services/session.ts:571-584` | Vocabulary query for `four_strands` pedagogy is unbounded before `.slice(0, 60)`. If learner has thousands of entries, all are fetched. Add SQL `.limit(60)`. |
| Epic 2 | MISSING | Low | N/A | FR33: Sessions should be marked as "guided problem-solving" in Library. Homework sessions use `sessionType: 'homework'` but the specific "guided problem-solving" display label is not implemented. |
| Epic 2 | MISSING | Low | N/A | FR36 (guided self-correction): System prompt includes "Not Yet" framing but no explicit self-correction prompt step. Partially fulfilled via escalation ladder. |
| Epic 2 | MISSING | Low | N/A | FR37 (skip summary consequences): Skip is implemented with counter and warnings, but actual behavioral consequences (reduced XP, affected streak) are not enforced server-side beyond the skip counter. |
| Epic 2 | BUG | Low | `apps/api/src/services/session.ts:1064-1069` | `closeSession()` re-reads raw session row after already calling `getSession()` (scoped repo), duplicating profile-filter logic for metadata access. |
| Epic 2 | MISSING_TEST | Low | `apps/api/src/services/recall-bridge.ts` | No integration test for full flow from `/sessions/:sessionId/recall-bridge` through service with homework session guard. |
| Epic 2 | SECURITY | Low | `apps/api/src/routes/homework.ts:48-89` | OCR endpoint `/ocr` does not require `profileId` check via `requireProfileId()`. Authenticated but not profile-scoped. |
| Epic 2 | STALE_TEST | Low | `apps/api/src/services/session.test.ts:1` | Test uses heavy mocking (8+ modules). Mock for `buildPriorLearningContext` always returns empty context, so FR40 (prior learning references) is never exercised. |
| Epic 3 | ~~ARCH_VIOLATION~~ | ~~Med~~ | `apps/api/src/services/coaching-cards.ts:395-432` | **DELIBERATE.** ARCH-11 specified Workers KV, but DB table (`home_surface_cache`) is a conscious architectural adaptation documented in gap analysis. |
| Epic 3 | MISSING_TEST | Med | `apps/api/src/inngest/functions/session-completed.test.ts` | ARCH-25 requires Inngest integration tests using `inngest/test`. Test file uses manual step extraction instead of `InngestTestEngine`. Does not test step-level retries or Inngest-specific behaviors. |
| Epic 3 | MISSING | Med | Mobile | FR138-143 (Feynman Stage / TEACH_BACK) has no dedicated mobile screen. `useSpeechRecognition` and `useTextToSpeech` hooks exist, but no `teach-back.tsx` screen with voice I/O UI. Backend processes TEACH_BACK results, but learner-facing screen is not implemented. |
| Epic 3 | MISSING | Low | `apps/api/src/services/retention.ts` | FR49: SM-2 produces dynamic intervals that may not match the specified 2-week/6-week checkpoints. No explicit scheduling triggers for these intervals. `review-reminder.ts` is event-driven but nothing schedules `app/retention.review-due` at those intervals. |
| Epic 3 | MISSING | Low | `apps/api/src/services/assessments.ts:309-328` | `createAssessment` uses raw `db.insert()` without scoped repo. ProfileId explicitly set (safe), but inconsistent with pattern. |
| Epic 3 | MISSING | Low | `apps/api/src/services/assessments.ts:286-307` | `loadTopicTitle` accepts optional `profileId`. When called without it, ownership check is skipped. Currently only called with profileId from route context. |
| Epic 3 | BUG | Low | `apps/api/src/services/retention-data.ts:396-398` | `processRecallTest` returns hardcoded `masteryScore` (0.75 pass / 0.4 fail) instead of computing from SM-2 or `calculateMasteryScore`. Inconsistent with FR48 (0-1 mastery score per topic). |
| Epic 3 | MISSING | Low | Mobile | No dedicated EVALUATE (Devil's Advocate) mobile screen. API has full eligibility checking and difficulty rung management, but no `evaluate-challenge.tsx` screen. |
| Epic 3 | PERF | Low | `apps/api/src/services/retention-data.ts:529-552` | `getSubjectNeedsDeepening` fetches ALL needs-deepening topics then filters in JS. Should use DB-level WHERE for `subjectId`. |
| Epic 3 | MISSING | Low | `apps/api/src/services/retention-data.ts:462-527` | `startRelearn` does not check `checkNeedsDeepeningCapacity`. Per FR61-63, max 10 active needs-deepening topics per subject with promotion at capacity. |
| Epic 4 | MISSING | High | N/A | FR95 (Daily push notifications): No Inngest cron function for daily push reminders. `review-reminder.ts` is event-triggered, not scheduled. No cron scans profiles for fading topics or streak warnings. `formatDailyReminderBody` exists in `notifications.ts` but is never called from any Inngest function. |
| Epic 4 | MISSING | High | N/A | FR91 (Review reminders for fading topics): `review-reminder` Inngest function exists but is event-triggered. No code emits `app/retention.review-due` event. No scheduled scan identifies profiles with fading/overdue topics. Reminder pathway wired but has no trigger. |
| Epic 4 | MISSING | Med | `apps/api/src/services/progress.ts:53-58` | FR70 (Blocked struggle status): `TopicProgress` schema defines `struggleStatus: 'normal' | 'needs_deepening' | 'blocked'`, but `getTopicProgress` never returns `'blocked'`. No logic transitions topics to `'blocked'` after repeated failures. |
| Epic 4 | MISSING | Med | N/A | FR68 ("Your Words" summaries): `topicProgressSchema` has `summaryExcerpt` from session summaries, but these are AI-generated, not learner-authored. FR68 envisions the learner's own words displayed in library. |
| Epic 4 | MISSING | Med | N/A | FR90 (Knowledge decay visualization): Retention statuses (strong/fading/weak/forgotten) displayed via `RetentionSignal`, but no visual "decay bar" showing time-based progression toward fading. Only categorical indicators exist. |
| Epic 4 | MISSING_TEST | Med | `apps/api/src/services/streaks.test.ts:346-354` | `getStreakData` and `getXpSummary` DB-aware query functions have only `.todo` tests. These are called from `/streaks` and `/xp` routes with no unit test coverage. |
| Epic 4 | MISSING_TEST | Med | N/A | Coaching card service (`coaching-cards.ts`) has no co-located test file. Precompute logic with 5 priority tiers is untested at unit level. |
| Epic 4 | ~~MISSING_TEST~~ | ~~Med~~ | N/A | **INVALID.** `progress.test.ts` does have tests for `getOverallProgress` exercising multi-subject scenarios. Finding overstated the gap. |
| Epic 4 | PERF | Med | `apps/api/src/services/progress.ts:456-498` | `getContinueSuggestion` has N+1 pattern: iterates subjects, then queries curricula/topics/retention per subject individually. Should use batched approach from `getOverallProgress`. |
| Epic 4 | PERF | Med | `apps/api/src/services/dashboard.ts:378-394` | `getChildDetail` re-queries ALL children when only one is requested. Should query only the requested child. |
| Epic 4 | PERF | Med | `apps/api/src/services/interleaved.ts:101-122` | `selectInterleavedTopics` resolves titles with N individual `findFirst` queries. Should batch with `inArray`. |
| Epic 4 | BUG | Low | `apps/api/src/services/coaching-cards.ts:231` | Challenge card fallback uses `profileId` as `topicId`. Semantically incorrect — downstream topic lookups with a profileId will fail silently. |
| Epic 4 | MISSING | Low | N/A | FR83: Restore archived subjects should be in Settings per spec. Currently only available via Library "Manage" modal. May be intentional UX consolidation. |
| Epic 4 | MISSING | Low | N/A | UX-13: Dashboard reads live from DB with batched queries rather than pre-computed cache. Justifiable deviation given optimization, but deviates from spec. |
| Epic 4 | MISSING | Low | N/A | ARCH-11: Coaching card cache uses DB table (`home_surface_cache`) rather than Workers KV. Acceptable adaptation but noted as deviation. |
| Epic 5 | BUG | High | `apps/api/src/services/subscription.ts:29` | **FIXED 2026-04-05.** Free tier `monthlyQuota` was stale at `50` — should be `100` per dual-cap decision (10/day + 100/month, 2026-03-25). DB default of 100 was correct. `subscription.ts`, `stripe-webhook.test.ts`, and `trial-expiry.test.ts` updated. |
| Epic 5 | BUG | High | `apps/api/src/services/billing.ts:1294-1323` | `addProfileToSubscription` checks tier eligibility and account ownership but never calls `canAddProfile` to enforce max profile limit. A family subscription (max 4) could have 5+ profiles since the function returns current count without checking against `maxProfiles`. |
| Epic 5 | ARCH_VIOLATION | Med | `apps/api/src/services/subscription.ts:97-98` | `isValidTransition` defines rigorous state machine but is never called from any production code. Webhooks can set arbitrary status transitions without guard. State machine exists only in tests. |
| Epic 5 | BUG | Med | `apps/api/src/middleware/metering.ts:187-193` | `checkQuota` called with `topUpCreditsRemaining: 0` hardcoded, then `decrementQuota` called unconditionally. `result.allowed` boolean is never checked — `checkQuota` is dead code. More critically, passing `0` for top-ups means its result is wrong for users who have top-ups. If someone later adds an early-return on `result.allowed`, users with top-ups would be incorrectly blocked. |
| Epic 5 | BUG | Med | `apps/api/src/middleware/metering.ts:210-214` | 402 response always reports `topUpCreditsRemaining: 0` even when user may have unexpired top-up credits. Never queries `getTopUpCreditsRemaining`. Client receives inaccurate quota info. |
| Epic 5 | MISSING | Med | `apps/api/src/services/trial.ts:204-215` | `getTrialWarningMessage` only returns messages for exactly 3, 1, and 0 days remaining. No warning at 7 or 2 days. FR110 spec met minimally but missing opportunity for additional milestones. |
| Epic 5 | SECURITY | Med | `apps/api/src/routes/revenuecat-webhook.ts:47` | `constantTimeCompare` uses hardcoded HMAC key `'webhook-compare'`. While purpose is only timing-attack prevention, source code compromise reveals comparison mechanism. Using actual webhook secret as HMAC key would be more robust. |
| Epic 5 | PERF | Med | `apps/api/src/services/billing.ts:756-795` | `resetExpiredQuotaCycles` fetches all due-for-reset quota pools then issues individual SELECT + UPDATE per pool (N+1). Will bottleneck at scale. Batch with single UPDATE...FROM join. |
| Epic 5 | STALE_TEST | Low | `apps/api/src/services/billing.test.ts:78-97` | `mockQuotaPoolRow` missing `dailyLimit` and `usedToday` fields added with dual-cap. Tests using this mock get `undefined` for daily fields. |
| Epic 5 | MISSING_TEST | Med | Multiple | No unit test for `addProfileToSubscription` max profile cap (because cap not enforced — see bug). No test for `removeProfileFromSubscription` throwing `ProfileRemovalNotImplementedError`. |
| Epic 5 | ~~MISSING_TEST~~ | ~~Med~~ | `apps/api/src/middleware/metering.test.ts` | **INVALID.** Test exists at `metering.test.ts:370-407` — mocks `daily_exceeded`, asserts 402 + `reason: 'daily'` + daily-specific message. |
| Epic 5 | MISSING_TEST | Low | `apps/api/src/services/billing.ts:1548-1601` | `updateSubscriptionFromRevenuecatWebhook` has no dedicated unit test. Exercised indirectly through webhook route tests but timestamp-based idempotency and partial update logic untested directly. |
| Epic 5 | ARCH_VIOLATION | Low | `apps/api/src/services/stripe.ts:23-29` | `getWebhookStripeClient` uses module-level singleton initialized with `createStripeClient('unused')`. Leaks Stripe instance with bogus API key. Used only for `constructEventAsync` but misleading. |
| Epic 5 | MISSING | Low | General | FR117: `/v1/usage` returns monthly limits and usage, but no per-profile usage breakdown for family plans. Family endpoint returns members without individual usage data. |
| Epic 5 | BUG | Low | `apps/api/src/routes/billing.ts:236-239` | Cancel route reads `periodEndTs` from `updated.items?.data?.[0]?.current_period_end`. With Stripe SDK v20, may not be populated on cancel response. Fallback `new Date().toISOString()` gives incorrect expiry info. |

---

## UX Flow Audit — Dead-End & Stuck States

**Date:** 2026-04-05
**Reviewer:** 4 parallel Explore agents auditing all major mobile flows
**Scope:** Every user-facing flow reviewed for dead-end states where the user has no actionable escape hatch
**Trigger:** Consent flow bug (PENDING state with no path to enter parent email) — fixed same day, then expanded audit to all flows

### Summary

| Flow Area | Critical | High | Medium | Low | Key Concern |
|-----------|----------|------|--------|-----|-------------|
| Learning Sessions | 2 | 3 | 5 | 2 | "Tap to reconnect" message is not tappable; session close failure traps user |
| Library & Topics | 2 | 4 | 3 | 1 | Book generation hangs indefinitely; topic deleted shows no back button |
| Onboarding & Auth | 3 | 1 | 5 | 1 | SSO session activation failures trap user; interview stream error leaves input active |
| Parent Dashboard | 3 | 3 | 4 | 2 | Child profile deleted shows "Loading..." forever; subscription offerings fail with no purchase CTA |
| **Total** | **10** | **11** | **17** | **6** | |

---

### Critical Findings

| # | Flow | File:Line | Description |
|---|------|-----------|-------------|
| UX-01 | Session | `apps/mobile/src/app/(learner)/session/index.tsx:930-934` | **"Tap to reconnect" is not tappable.** When `streamMessage` fails, the error text says "Tap to reconnect" but it renders as a static AI bubble with no `onPress` handler. User is stranded mid-session with no recovery mechanism. |
| UX-02 | Session | `apps/mobile/src/app/(learner)/session/index.tsx:1210-1238` | **Session close failure traps user on session screen.** When `closeSession.mutateAsync()` fails, the alert dismisses back to the active session. "I'm Done" re-enables but the user has no way to force-navigate home or to the summary. |
| UX-03 | Library | `apps/mobile/src/app/(learner)/library.tsx:225-232, 476-493` | **Book generation hangs indefinitely.** If `generateBookTopics.mutate()` errors and then UI falls through to `renderSubjectCards()` (wrong context), user sees a blank state with no error, no retry, no back button. |
| UX-04 | Library | `apps/mobile/src/app/(learner)/library.tsx:506-577` | **Library shelf blank after load failure.** When `booksQuery` fails and `flatSubjectTopics` is also empty, no fallback UI renders — user sees a blank screen. |
| UX-05 | Auth | `apps/mobile/src/app/(auth)/sign-up.tsx:130-135` | **SSO session activation failure traps user.** After email verification succeeds, if `setActive({ session })` throws, user sees "Could not activate your session" but has no retry button, no back-to-sign-in link. |
| UX-06 | Auth | `apps/mobile/src/app/(auth)/sign-in.tsx:217-222` | **Sign-in verification session activation failure.** Same pattern as UX-05 — if MFA/2FA `setActive()` fails, user is stuck on verification screen. |
| UX-07 | Auth | `apps/mobile/src/app/(auth)/sign-up.tsx:77-85` | **OAuth (Google/Apple) session activation failure.** After successful OAuth redirect, if `setActive()` fails, OAuth cannot be retried without closing app. No "Try another method" fallback. |
| UX-08 | Parent | `apps/mobile/src/app/(parent)/child/[profileId]/index.tsx:172-228` | **Child profile deleted shows "Loading..." forever.** When `getChildDetail()` returns null (child deleted/link revoked), header shows "Loading..." as child name. Only "No subjects yet" appears. No error message, no back prompt. |
| UX-09 | Parent | `apps/mobile/src/app/(parent)/child/[profileId]/session/[sessionId].tsx:83-91` | **Empty session transcript shows blank screen.** When `transcript.exchanges.length === 0`, no else clause renders — user sees header but blank scrollView with no explanation. |
| UX-10 | Parent | `apps/mobile/src/app/(parent)/_layout.tsx:150` | **Parent with no linked children bounced to learner home.** Redirect to `/(learner)/home` drops parent out of their context with no "Add a child" CTA from the parent dashboard itself. |

### High Findings

| # | Flow | File:Line | Description |
|---|------|-----------|-------------|
| UX-11 | Session | `apps/mobile/src/lib/sse.ts:240-249` | **SSE stream timeout is silent.** XHR times out after 30s, sets `done = true`, but no user-facing message appears. Last AI response may be incomplete with no explanation. |
| UX-12 | Session | `apps/mobile/src/app/(learner)/session/index.tsx:309` | **Expired session resume shows no "session expired" message.** When recovery marker points to a server-side garbage-collected session, transcript fetch 404s silently. User sees loading spinner or old opening message. |
| UX-13 | Session | `apps/api/src/services/session.ts:881-893` | **Exchange limit (50) hit mid-session shows "Lost connection" error.** Server returns 429 `SessionExchangeLimitError` but mobile displays the same vague "Lost connection" message. User may retry indefinitely. |
| UX-14 | Session | `apps/mobile/src/hooks/use-homework-ocr.ts:145-168` | **OCR fails with no manual entry fallback.** When both on-device ML Kit and server OCR fail, user can only retry or navigate back (losing the image). No "I'll type this myself" option. |
| UX-15 | Topic | `apps/mobile/src/app/(learner)/topic/[topicId].tsx:125-136` | **Topic deleted server-side shows "Not found" with no back button.** User sees "Topic not found" but has no navigation affordance — must rely on OS back gesture. |
| UX-16 | Topic | `apps/mobile/src/app/(learner)/topic/[topicId].tsx:70-75` | **Retention data load fails silently.** `useTopicRetention()` error leaves retention card with null/missing values. No error indicator or skeleton fallback. |
| UX-17 | Library | `apps/mobile/src/app/(learner)/library.tsx:326-336` | **Subject archive/pause fails with no user feedback.** `updateSubject.mutateAsync()` catch block clears `pendingSubjectId` but shows no error message. User assumes action succeeded. |
| UX-18 | Topic | `apps/mobile/src/app/(learner)/topic/relearn.tsx:100-145` | **Relearn session start fails silently.** `startRelearn.mutate()` failure sets `isSubmitting(false)` but shows no error. User can retry indefinitely with no feedback. |
| UX-19 | Subscription | `apps/mobile/src/app/(learner)/subscription.tsx:928-972` | **RevenueCat offerings fail → static tier cards with no purchase button.** Fallback shows feature comparison `<View>` cards (not `<Pressable>`). User sees tiers but cannot subscribe. No retry or error message. |
| UX-20 | Parent | `apps/mobile/src/app/(learner)/subscription.tsx:316-332` | **Child paywall "Notify parent" cooldown stalls.** Timer updates every 60s. After 24h cooldown expires, button stays disabled for up to 1 minute before re-enabling. |
| UX-21 | Parent | `apps/mobile/src/app/(parent)/dashboard.tsx:140-173` | **Dashboard load timeout → only "Retry" available.** 10s timeout shows error with only retry button. No navigation to Library or More tab. User stuck if server is slow. |

### Medium Findings

| # | Flow | File:Line | Description |
|---|------|-----------|-------------|
| UX-22 | Session | `apps/mobile/src/app/(learner)/session/index.tsx:803-818` | **Subject inactive → generic "connection error" message.** `SubjectInactiveError` from server is stripped and replaced with "Check your connection" in the session UI. Specific reason (paused/archived) not surfaced. |
| UX-23 | Session | `apps/mobile/src/app/(learner)/session/index.tsx:249-250` | **Offline state shown reactively, not proactively.** User goes offline mid-session but warning appears only after they try sending a message. |
| UX-24 | Session | `apps/mobile/src/lib/session-recovery.ts:61-67` | **30-minute recovery window expires silently.** Sessions older than 30 minutes are unrecoverable. No "You had a session in progress" prompt — user starts fresh unknowingly. |
| UX-25 | Session | `apps/mobile/src/app/(learner)/session/index.tsx:535-548` | **Recovery marker cleared before close API succeeds.** If app is offline, `clearSessionRecoveryMarker()` runs locally even though server close failed. Reopening app = session lost. |
| UX-26 | Session | `apps/mobile/src/app/(learner)/homework/camera.tsx:102-131` | **Homework classification fails → subject picker has no "Create New Subject" option.** If no enrolled subjects match the homework, user cannot add a new one from this flow. |
| UX-27 | Library | `apps/mobile/src/app/(learner)/library.tsx:479-493` | **Book generation has no cancel or timeout.** LLM curriculum generation shows "Writing your book..." indefinitely. No cancel button, no auto-timeout. |
| UX-28 | Library | `apps/mobile/src/app/(learner)/library.tsx:127-137` | **Empty topics view ambiguous.** "No topics" message identical whether topics genuinely don't exist or retention queries failed. |
| UX-29 | Onboarding | `apps/mobile/src/app/(learner)/onboarding/interview.tsx:162-170` | **Interview stream fails but input stays active.** After stream error, `inputDisabled` remains false. User can type and send messages that silently fail. |
| UX-30 | Onboarding | `apps/mobile/src/app/(learner)/onboarding/interview.tsx:89-101` | **Interview expired draft restart has no error recovery.** "Restart Interview" button has no try/catch — if restart fails, button appears to do nothing. |
| UX-31 | Onboarding | `apps/mobile/src/app/(learner)/onboarding/language-setup.tsx:68-83` | **Language setup API failure allows duplicate submissions.** Error shown briefly but button re-enables immediately, allowing rapid-fire duplicate requests. |
| UX-32 | Profile | `apps/mobile/src/app/create-profile.tsx:120-160` | **Profile creation error doesn't guard `switchProfile()` call.** If API creation fails but `switchProfile()` still executes, local state becomes inconsistent. |
| UX-33 | Profile | `apps/mobile/src/app/profiles.tsx:17-24` | **Profile switch failure silently ignored.** `handleSwitch()` doesn't check `switchProfile()` result or show error alert. |
| UX-34 | Profile | `apps/mobile/src/app/delete-account.tsx:35-43` | **Delete account cancellation navigates away despite API failure.** `router.back()` executes even when `cancelDeletion.mutateAsync()` fails. Account stays in deletion-pending state. |
| UX-35 | Settings | `apps/mobile/src/app/(learner)/more.tsx:329-338` | **Sign-out has no error handling.** `signOut()` called without try/catch. If Clerk fails, button appears to do nothing. |
| UX-36 | Parent | `apps/mobile/src/app/(parent)/child/[profileId]/index.tsx:305-336` | **Consent grace period expired → no action.** When `daysRemaining === 0`, deletion banner shows "processing" with no buttons, no dismiss, no refresh. |
| UX-37 | Subscription | `apps/mobile/src/app/(learner)/subscription.tsx:598-672` | **Top-up purchase polling stalls → "processing" alert with no next step.** 30s polling gives a vague "being processed" fallback alert if webhook doesn't arrive. No "Check your usage" button. |
| UX-38 | Create Subject | `apps/mobile/src/app/create-subject.tsx:59-108` | **Subject limit error has no guidance.** "Subject limit reached" error shown but no hint to delete an old subject first. |

### Low Findings

| # | Flow | File:Line | Description |
|---|------|-----------|-------------|
| UX-39 | Session | `apps/mobile/src/app/(learner)/session/index.tsx:1293-1315` | Quick chip event recording fails silently (bare `catch {}`). Chip executes but server doesn't record the event. |
| UX-40 | Session | `apps/mobile/src/app/(learner)/session/index.tsx:802-818` | Input field stays enabled when no session can be created. Every send fails with the same error. |
| UX-41 | Onboarding | `apps/mobile/src/app/(learner)/onboarding/analogy-preference.tsx:20-29` | Analogy preference mutation failure is silent — `onSettled` navigates away regardless. |
| UX-42 | Profile | `apps/mobile/src/app/(learner)/_layout.tsx:721-728` | Profile-removed alert may reappear on every re-render if acknowledgement state becomes inconsistent. |
| UX-43 | Home | `apps/mobile/src/components/home/LearnerScreen.tsx:78-96` | No "review" intent card when library is empty. No guidance to add a subject first. |
| UX-44 | Home | `apps/mobile/src/hooks/use-home-cards.ts:16-35` | Coaching cards query fails silently — home screen shows only basic intent cards with no error indicator. |

 # Code Review Discovery — Epics 6-13                                                                                                                                                           
                                                                                                                                                                                                 
  **Date:** 2026-04-05
  **Reviewer:** 8 parallel code-reviewer agents against FR requirements, ARCH rules, and UX specs
  **Scope:** Full implementation audit of Epics 6-13

  ---

  ## Summary by Epic

  | Epic | Health | Criticals | Highs | Meds | Lows | Key Concern |
  |------|--------|-----------|-------|------|------|-------------|
  | 6 — Language Learning | Functional, undertested | 0 | 8 | 3 | 4 | Zero unit tests for 7 service files (vocabulary, curriculum, detect, prompts, extract). Route tests exist but service logic
   untested. |
  | 7 — Self-Building Library | Good | 0 | 2 | 5 | 3 | Stale closure in `useGenerateBookTopics`; missing error case tests for LLM JSON parsing. |
  | 8 — Full Voice Mode | Good | 0 | 3 | 8 | 4 | VoiceRecordButton/VoiceToggle untested; screen-reader lifecycle untested; VoiceOver/TalkBack coexistence deferred. |
  | 9 — Subscription/IAP | Risky | 2 | 4 | 8 | 6 | Webhook signature never tested; null accountId path; family pool removal unimplemented; KV cache stale writes. |
  | 10 — UX Polish | Good | 0 | 3 | 5 | 3 | Consent animation ignores reduced-motion; E2E flows reference stale BYOK section; hardcoded ActivityIndicator colors. |
  | 11 — Brand/Theme | Good | 0 | 1 | 2 | 2 | Muted color fallback mismatch in global.css; splash bg doesn't match tokens. |
  | 12 — Persona Removal | Debt-laden | 4 | 4 | 4 | 4 | personaType still in factory, schemas, DB, theme derivation, profile UI, consent deep links. Cascade blocks 12.2/12.3/12.4. |
  | 13 — Session Lifecycle | Good, undertested | 0 | 2 | 10 | 7 | Celebration components zero test coverage; stale-session cron race conditions; crash recovery edge cases. |

  **Cross-epic themes:**
  - Service-level unit tests are sparse across all new epics (6, 7, 8, 13). Route-level tests exist but don't cover edge cases.
  - `as never` type casts in mobile hooks (epics 6, 7) to work around Hono RPC typing.
  - personaType debt (Epic 12) touches factory, schemas, theme, DB — blocks 3 downstream stories.

  ---

  ## Findings — Epic 6: Language Learning (Four Strands)

  | Epic | Area | Severity | Type | File:Line | Finding |
  |------|------|----------|------|-----------|---------|
  | 6 | Mobile Hooks | HIGH | MISSING_TEST | apps/mobile/src/hooks/use-vocabulary.ts | No unit tests exist for `useVocabulary`, `useCreateVocabulary`, or `useReviewVocabulary` hooks. These are 
  critical data-fetching hooks used throughout the vocabulary feature. |
  | 6 | Mobile Hooks | HIGH | MISSING_TEST | apps/mobile/src/hooks/use-language-progress.ts | No unit tests for `useLanguageProgress` hook, which is used to fetch CEFR milestone progress. |    
  | 6 | Services | HIGH | MISSING_TEST | apps/api/src/services/vocabulary.ts | Core service functions (`listVocabulary`, `createVocabulary`, `updateVocabulary`, `reviewVocabulary`,
  `ensureVocabularyRetentionCard`, `upsertExtractedVocabulary`, `getVocabularyDueForReview`) have no unit tests. Only route-level tests exist. |
  | 6 | Services | HIGH | MISSING_TEST | apps/api/src/services/language-curriculum.ts | No unit tests for `generateLanguageCurriculum`, `regenerateLanguageCurriculum`,
  `getCurrentLanguageProgress`, or `getCurrentLanguageMilestoneId`. These are critical curriculum generation and progress tracking functions. |
  | 6 | Services | HIGH | MISSING_TEST | apps/api/src/services/language-detect.ts | No unit tests for `detectLanguageSubject` function. Language detection is essential for routing subjects to  
  language learning mode. |
  | 6 | Services | HIGH | MISSING_TEST | apps/api/src/services/vocabulary-extract.ts | No unit tests for `extractVocabularyFromTranscript` function, despite it being a complex LLM-based feature
   with JSON parsing and type filtering. |
  | 6 | Services | HIGH | MISSING_TEST | apps/api/src/services/language-prompts.ts | No unit tests for `buildFourStrandsPrompt` function, which constructs critical system prompts for language  
  teaching. |
  | 6 | Inngest | HIGH | MISSING_TEST | apps/api/src/inngest/functions/session-completed.ts:262-350 | The `update-vocabulary-retention` step that auto-extracts vocabulary from four_strands     
  sessions has no explicit test coverage. |
  | 6 | Routes | MEDIUM | MISSING_TEST | apps/api/src/routes/subjects.ts:97-124 | The PUT `/subjects/:id/language-setup` endpoint is tested only implicitly. No direct API route tests verify    
  error handling for invalid pedagogy modes or missing language codes. |
  | 6 | Mobile UI | MEDIUM | MISSING_TEST | apps/mobile/src/app/(learner)/onboarding/language-setup.test.tsx:26-30 | Test mocks `useConfigureLanguageSubject` with resolved mutation but doesn't 
  test error scenarios (failed API calls, validation errors). |
  | 6 | Mobile Components | MEDIUM | MISSING_TEST | apps/mobile/src/components/language/FluencyDrill.test.tsx | Test doesn't verify timeout callback is actually invoked when timer expires (only
   tests initial render and manual submit). |
  | 6 | Architecture | MEDIUM | TYPE_SAFETY | apps/mobile/src/hooks/use-vocabulary.ts:24 | Use of `as never` type cast to work around Hono client type system. Bypasses type checking for the API
   client call. |
  | 6 | Architecture | MEDIUM | TYPE_SAFETY | apps/mobile/src/hooks/use-language-progress.ts:20 | Same `as never` type cast issue. Hono RPC interface may need better typing for optional route  
  parameters. |
  | 6 | Services | LOW | DEAD_CODE | apps/api/src/services/subject.ts:206 | `configureLanguageSubject` returns subject before curriculum regeneration completes. Returned subject doesn't reflect
   updated curriculum state. |
  | 6 | Schema | LOW | TYPE_SAFETY | packages/schemas/src/language.ts:57 | `vocabularyCreateSchema` defines `cefrLevel: cefrLevelSchema.optional()` (not nullable), but database schema allows   
  NULL. Runtime handling `input.cefrLevel ?? null` masks the schema imprecision. |

  ## Findings — Epic 7: Self-Building Library

  | Epic | Area | Severity | Type | File:Line | Finding |
  |------|------|----------|------|-----------|---------|
  | 7 | Mobile Hooks | HIGH | BUG | apps/mobile/src/hooks/use-books.ts:102-110 | Stale closure in `useGenerateBookTopics` mutation's `onSuccess` callback. When `subjectId` or `bookId` change,  
  the callback captures old values from previous render, causing query invalidations to use wrong keys. |
  | 7 | Services | HIGH | MISSING_TEST | apps/api/src/services/book-generation.test.ts:1-151 | Missing error case tests: (1) LLM returning malformed JSON, (2) LLM returning JSON that fails     
  schema validation, (3) `extractJson()` matching partial/invalid JSON. Code has error handling but no test coverage. |
  | 7 | Mobile Screen | MEDIUM | BUG | apps/mobile/src/app/(learner)/library.tsx:235 | Missing dependency in useEffect. `generateBookTopics.isPending` is read without being in the dependency   
  array. |
  | 7 | Services | MEDIUM | MISSING_TEST | apps/api/src/services/curriculum.ts:515-654 | Missing test for `persistBookTopics` idempotency edge case. Function has special handling for existing  
  topics but no test verifying idempotent behavior or race condition handling. |
  | 7 | Services | MEDIUM | MISSING_TEST | apps/api/src/routes/books.test.ts:155-354 | Missing test for NotFoundError propagation. Tests cover 404 but don't explicitly verify NotFoundError from
   services is properly caught and converted to notFound() response. |
  | 7 | Inngest | MEDIUM | MISSING_TEST | apps/api/src/inngest/functions/book-pre-generation.ts:1-89 | Function lacks test coverage: (1) pre-generation for next 1-2 books, (2) early return when
   no unbuilt books remain, (3) error handling if book lookup fails, (4) age calculation fallback when birthYear is null. |
  | 7 | Mobile Hooks | MEDIUM | MISSING_TEST | apps/mobile/src/hooks/use-books.ts:18-112 | Missing test coverage for all three hooks: error states, disabled queries when IDs are undefined,     
  cache invalidation on mutation success. |
  | 7 | Services | LOW | ARCHITECTURE | apps/api/src/services/curriculum.ts:406-427 | `claimBookForGeneration` verifies subject ownership but doesn't verify book belongs to that subject in the 
  same query. Relies on separate subject existence check. |
  | 7 | Mobile Screen | LOW | DEAD_CODE | apps/mobile/src/app/(parent)/library.tsx:1-2 | Parent library route just re-exports learner library. No custom logic or deferred stories scaffolding. |
  | 7 | Architecture | LOW | ARCHITECTURE | apps/api/src/routes/books.ts:1-17 | Route file follows best practices correctly — only imports Database type, not ORM primitives. Good pattern       
  adherence. |

  ## Findings — Epic 8: Full Voice Mode

  | Epic | Area | Severity | Type | File:Line | Finding |
  |------|------|----------|------|-----------|---------|
  | 8 | Voice Components | HIGH | MISSING_TEST | apps/mobile/src/components/session/VoiceRecordButton.tsx | No unit tests exist. Only indirectly tested via ChatShell.test.tsx. Missing: haptic  
  feedback verification, button disabled state, animation states during listening. |
  | 8 | Voice Components | HIGH | MISSING_TEST | apps/mobile/src/components/session/VoiceToggle.tsx | No unit tests exist. Only indirectly tested via ChatShell.test.tsx. Missing: accessibility 
  label correctness, toggle state transitions, voice mode persistence integration. |
  | 8 | Voice Accessibility | HIGH | MISSING_TEST | apps/mobile/src/components/session/ChatShell.tsx:176-196 | No test coverage for screen-reader detection lifecycle. Tests don't verify: (1)   
  TTS suppression when screen reader activates mid-session, (2) cleanup of AccessibilityInfo listener on unmount, (3) auto-play to manual-only transition. |
  | 8 | Voice Accessibility | HIGH | MISSING_ITEM | apps/mobile/src/hooks/use-text-to-speech.ts:31-35 | TODO: VoiceOver/TalkBack coexistence gap (FR149). Deferred to Story 8.4. No audio ducking
   or priority negotiation with accessibility services. Physical device testing required before production. |
  | 8 | Voice Hooks | MEDIUM | MISSING_TEST | apps/mobile/src/hooks/use-speech-recognition.ts | No test coverage for race condition when `loadModule` completes but hook is unmounted, or when   
  multiple `startListening` calls occur rapidly. |
  | 8 | Voice Hooks | MEDIUM | MISSING_TEST | apps/mobile/src/hooks/use-text-to-speech.ts:113 | `setRate()` only updates for next `speak()` call, not currently-playing audio. No documentation  
  or test verifies this limitation. |
  | 8 | Voice Session | MEDIUM | ARCHITECTURE | apps/mobile/src/app/(learner)/session/index.tsx:735 | `setSessionInputMode` mutation fires without error handling beyond generic toast. If API   
  call fails, local `inputMode` and session state diverge. |
  | 8 | Voice Hooks | MEDIUM | MISSING_TEST | apps/mobile/src/hooks/use-speech-recognition.ts:91-137 | No test for listener cleanup when `loadModule` changes (hot reload). Could leak
  subscriptions in development. |
  | 8 | Voice STT | MEDIUM | BUG | apps/mobile/src/hooks/use-speech-recognition.ts:106-121 | Event parsing assumes `results` is array with optional `transcript`. Malformed native events        
  silently filtered to empty string without logging. |
  | 8 | Voice Controls | MEDIUM | MISSING_TEST | apps/mobile/src/components/session/ChatShell.tsx:252-256 | Race condition possible between STT stopping and useEffect syncing transcript. If    
  `stopListening()` completes but transcript not yet in state, `setPendingTranscript` uses stale data. |
  | 8 | Voice Routes | MEDIUM | MISSING_TEST | apps/api/src/routes/sessions.ts:267-281 | POST `/sessions/:sessionId/input-mode` has no explicit test for invalid input modes. Schema validation  
  should be tested for proper 400 error. |
  | 8 | Voice DB Schema | MEDIUM | ARCHITECTURE | packages/database/src/schema/sessions.ts:133 | `inputMode` stored as text column (not enum). Historical sessions may have NULL. Mapper defaults
   NULL to `'text'`, masking data quality issue. |
  | 8 | Voice Controls | LOW | DEAD_CODE | apps/mobile/src/components/session/ChatShell.tsx:166-170 | `inputMode` effect redundant with initial state initialization at line 131-135.
  Re-synchronizes on each change but no test verifies correct behavior. |
  | 8 | Voice Components | LOW | MISSING_TEST | apps/mobile/src/components/session/VoicePlaybackBar.test.tsx | Rate cycling test doesn't cover: cycling from rate outside standard cycle,        
  `nextRate()` with invalid input, UI update latency when rate changes while speaking. |
  | 8 | Voice Session | MEDIUM | MISSING_TEST | apps/mobile/src/app/(learner)/session/index.tsx | No test for `inputMode` parameter being passed to `startSession` API call. Should verify voice 
  mode selection propagates to API. |

  ## Findings — Epic 9: Subscription / Native IAP

  | Epic | Area | Severity | Type | File:Line | Finding |
  |------|------|----------|------|-----------|---------|
  | 9 | RevenueCat Webhook | CRITICAL | MISSING_TEST | apps/api/src/routes/revenuecat-webhook.test.ts:150+ | No test cases for webhook signature verification. `constantTimeCompare` function is 
  implemented but never tested. Should verify both valid and invalid Authorization headers. |
  | 9 | RevenueCat Webhook | CRITICAL | TYPE_SAFETY | apps/api/src/routes/revenuecat-webhook.ts:598-613 | `isRevenuecatEventProcessed` called before checking if accountId exists. If
  `resolveAccountId` returns null (anonymous $-prefixed app_user_id), function proceeds with null accountId, causing unexpected behavior. |
  | 9 | Billing Service | HIGH | BUG | apps/api/src/services/billing.ts:1631-1633 | `activateSubscriptionFromRevenuecat` throws if `isTrial=true` but `trialEndsAt` missing. Check happens AFTER 
  function is called from webhook — crashes webhook handler instead of returning graceful error. |
  | 9 | Quota Decrement | HIGH | MISSING_TEST | apps/api/src/services/billing.test.ts + apps/api/src/middleware/metering.test.ts | No tests for `decrementQuota` edge cases: (1) concurrent      
  over-decrement, (2) daily limit hit before monthly, (3) race with top-up expiry, (4) negative quota scenarios. |
  | 9 | Family Billing | HIGH | MISSING_ITEM | apps/api/src/services/billing.ts:1332-1376 | Family pool removal intentionally not implemented (`ProfileRemovalNotImplementedError`). No row-level
   locking for concurrent modification of family quota during profile addition. Should use `SELECT ... FOR UPDATE`. |
  | 9 | RevenueCat Webhook | HIGH | MISSING_TEST | apps/api/src/routes/revenuecat-webhook.test.ts | No tests for idempotency edge cases: (1) same event out-of-order (older timestamp after      
  newer), (2) null `event_timestamp_ms`, (3) duplicate transaction IDs for top-up grants. |
  | 9 | KV Cache | HIGH | ARCHITECTURE | apps/api/src/middleware/metering.ts:225-235 | KV cache updated AFTER `decrementQuota` succeeds. If response sent before KV write completes, concurrent  
  requests see stale cache. Should await KV write before continuing. |
  | 9 | Stripe Webhook | MEDIUM | MISSING_TEST | apps/api/src/routes/stripe-webhook.test.ts:150+ | No test coverage for signature verification failures. Mock always succeeds; should test       
  missing signature header and invalid signature. |
  | 9 | Trial Expiry | MEDIUM | MISSING_TEST | apps/api/src/inngest/functions/trial-expiry.ts | No test for timezone edge cases in `computeTrialEndDate`. Day boundary handling complex; should  
  test UTC+12, UTC-12, DST transitions. |
  | 9 | Top-Up Credits | MEDIUM | MISSING_TEST | apps/api/src/services/billing.test.ts | No tests for `purchaseTopUpCredits` idempotency: concurrent calls with same transactionId, collision    
  edge cases, free-tier purchase (should return null). |
  | 9 | Webhook Handlers | MEDIUM | ARCHITECTURE | apps/api/src/routes/stripe-webhook.ts:350-365 + apps/api/src/routes/revenuecat-webhook.ts:307-314 | Webhooks update `cancelledAt` but don't   
  always sync to KV cache immediately (e.g., `handleCancellation`). Subsequent requests may see stale "active" status. |
  | 9 | Metering | MEDIUM | MISSING_TEST | apps/api/src/middleware/metering.test.ts | No tests for KV cache write failures. `safeWriteKV` swallows exceptions; should verify fallback to DB works
   when KV unavailable. |
  | 9 | Billing Service | MEDIUM | TYPE_SAFETY | apps/api/src/services/billing.ts:1535-1541 | `isRevenuecatEventProcessed` assumes `lastRevenuecatEventTimestampMs` is string but compares with  
  number. Line 1536 coerces to `Number()`, but schema column type is `text`. Inconsistent. |
  | 9 | Top-Up Ledger | MEDIUM | MISSING_TEST | apps/api/src/services/billing.test.ts | No tests for `getTopUpCreditsRemaining` when credits expire during query. Edge case: top-up near expiry  
  boundary with concurrent request. |
  | 9 | Family Billing | MEDIUM | MISSING_ITEM | apps/api/src/routes/billing.ts:530-579 | `removeProfileFromSubscription` always throws `ProfileRemovalNotImplementedError`. Route catches with  
  422. No path forward — should document timeline. |
  | 9 | RevenueCat | LOW | DEAD_CODE | apps/mobile/src/lib/revenuecat.ts:34-46 | `configureRevenueCat` silently returns if API key not set. Never logs anything — should at least warn in dev    
  mode when unconfigured. |
  | 9 | Billing Routes | LOW | ARCHITECTURE | apps/api/src/routes/billing.ts:131-206 | Stripe checkout endpoints marked "Dormant for mobile" but fully implemented and not guarded. If web client
   never ships, this is confusing dead code. |
  | 9 | Trial Service | LOW | MISSING_TEST | apps/api/src/services/trial.ts | `computeTrialEndDate` uses complex Intl.DateTimeFormat logic. No property-based tests for timezone correctness. |  
  | 9 | Quota Reset | LOW | MISSING_TEST | apps/api/src/inngest/functions/quota-reset.ts | No test for DST transitions when daily quota resets at 01:00 UTC. Reset might trigger twice or not at 
  all across DST boundary. |

  ## Findings — Epic 10: Pre-launch UX Polish

  | Epic | Area | Severity | Type | File:Line | Finding |
  |------|------|----------|------|-----------|---------|
  | 10 | Consent Animation | HIGH | ARCHITECTURE | apps/mobile/src/app/consent.tsx:59-80 | Consent phase transition animations (Animated.timing 300ms) do NOT respect `useReducedMotion()`.      
  AnimatedFade component respects it, but consent.tsx uses raw Animated.timing. Violates accessibility requirement per ux-design-specification.md:591,1792. |
  | 10 | E2E Test Docs | HIGH | OUTDATED_TEST | docs/E2Edocs/e2e-bug-fix-plan.md:130,149 | Bug fix plan references commented-out BYOK section in subscription.tsx (lines 873-908). If code still 
  has these lines, E2E flows may still fail. Verify subscription.tsx state and whether E2E flows updated. |
  | 10 | E2E Test Docs | HIGH | OUTDATED_TEST | docs/E2Edocs/e2e-bug-fix-plan.md:180-189 | Bug fix plan references potential DB schema drift (raw_input column). No integration test validates   
  schema consistency. Pre-flight schema check missing from test setup. |
  | 10 | Hardcoded Colors | MEDIUM | ARCHITECTURE | apps/mobile/src/app/index.tsx:13 | ActivityIndicator hardcoded `color="#71717a"` instead of using `useThemeColors()`. Same issue in
  [topicId].tsx:80. |
  | 10 | Hardcoded Colors | MEDIUM | ARCHITECTURE | apps/mobile/src/app/(learner)/topic/[topicId].tsx:80 | ActivityIndicator hardcoded `color="#71717a"` instead of `useThemeColors().muted`.    
  Violates NativeWind semantic class requirement. |
  | 10 | Subject Management | MEDIUM | BUG | apps/mobile/src/app/create-subject.tsx:376-388 | "Just use my words" Pressable has inadequate touch target (py-2 ~8px). Total height <44px minimum. 
  Same button in no-match state (line 405-412) correctly uses Button component. |
  | 10 | Consent Flow | MEDIUM | MISSING_TEST | apps/mobile/src/app/consent.test.tsx | No test coverage for reduced-motion behavior. 23 test cases exist but none verify animations respect      
  `prefers-reduced-motion`. |
  | 10 | Subject Management | MEDIUM | MISSING_TEST | apps/mobile/src/app/create-subject.test.tsx | No test coverage for touch target accessibility on suggestion cards. Tests cover suggestion  
  logic but don't verify min-height constraints. |
  | 10 | Consent Form | MEDIUM | BUG | apps/mobile/src/app/consent.tsx:229-236 | Error "This is your own email..." appears as plain Text without `accessibilityRole="alert"`. Main error
  container has it, but inline validation error won't announce to screen readers. |
  | 10 | Consent Copy | LOW | TYPE_SAFETY | apps/mobile/src/lib/consent-copy.ts:53-85 | Copy functions accept generic `persona: Persona` but consent.tsx hardcodes variants. Persona selection   
  could be more explicit. |
  | 10 | Animation | LOW | MISSING_ITEM | apps/mobile/src/app/consent.tsx:59-80 | No evidence of Galaxy S10e 5.8" performance validation for consent animation (300ms fade x2). |

  ## Findings — Epic 11: Brand Identity / Theme Unification

  | Epic | Area | Severity | Type | File:Line | Finding |
  |------|------|----------|------|-----------|---------|
  | 11 | Fallback CSS Variables | HIGH | BUG | apps/mobile/global.css:27 | Muted color fallback is `#525252` but should be `#94a3b8` (matches tokens.teen.dark). Unauthenticated screens before  
  JS loads render with wrong text color. |
  | 11 | App Config | MEDIUM | ARCHITECTURE | apps/mobile/app.json:40,55 | Splash screen and adaptive icon background colors hardcoded to `#1e1b4b`, doesn't match any current design token.     
  Should be `#1a1a3e` (teen dark background). Visual mismatch during splash dismissal. |
  | 11 | Theme System | MEDIUM | MISSING_TEST | apps/mobile/src/lib/theme.ts | No unit tests for `useTheme()`, `useThemeColors()`, or `useTokenVars()` hooks. Should test persona switching,     
  color scheme changes, accent preset application. |
  | 11 | Theme System | LOW | ARCHITECTURE | apps/mobile/src/lib/design-tokens.ts:48 | Persona-indexed tokens structure creates implicit coupling. Personas cannot be added without updating the 
  type. |
  | 11 | Splash Screen | LOW | MISSING_TEST | apps/mobile/src/components/AnimatedSplash.tsx | No tests for splash color accuracy in light/dark modes or accent preset fallback. Hardcoded brand  
  colors (lines 75-107) should have contract tests. |

  ## Findings — Epic 12: Remove Persona Enum

  | Epic | Area | Severity | Type | File:Line | Finding |
  |------|------|----------|------|-----------|---------|
  | 12 | Create Profile Form | CRITICAL | BUG | apps/mobile/src/app/create-profile.tsx:135 | Mobile app still submits `personaType` in profile creation request. Persona picker UI commented out,
   but field auto-detected and sent. |
  | 12 | Factory Default | CRITICAL | BUG | packages/factory/src/profiles.ts:11 | `buildProfile()` still defaults `personaType: 'LEARNER'` — must be removed per FR206.8. Affects all test       
  compatibility. |
  | 12 | Profile Schema | CRITICAL | ARCHITECTURE | packages/schemas/src/profiles.ts:4,24,77 | `personaTypeSchema` still exported (line 4), `personaType` in `profileCreateSchema` (line 24) and 
  `profileSchema` (line 77). Should be removed per FR206. |
  | 12 | DB Schema | CRITICAL | ARCHITECTURE | packages/database/src/schema/profiles.ts:16,64 | Database still has `personaTypeEnum` (line 16) and `personaType` column with default 'LEARNER'   
  (line 64). Migration not executed — blocks all downstream deletions. |
  | 12 | Theme Derivation | HIGH | BUG | apps/mobile/src/app/_layout.tsx:114-129 | Theme derived from `activeProfile.personaType.toLowerCase()` (line 119). Story 12.3 is NOT STARTED but code   
  depends on personaType for theme selection. |
  | 12 | Theme Decoupling | HIGH | ARCHITECTURE | apps/mobile/src/app/_layout.tsx:86-96 | `schemeForPersona()` function explicitly maps persona enum to color schemes. Depends on personaType    
  existing. |
  | 12 | Profile Switcher UI | HIGH | BUG | apps/mobile/src/app/profiles.tsx:74 | Profile role label derived from `personaType` (`'PARENT' ? 'Parent' : 'Student'`). Should derive from `isOwner`
   or age bracket. |
  | 12 | Consent-Web Deep Link | HIGH | MISSING_ITEM | apps/api/src/routes/consent-web.ts:279 | Deep link still hardcodes `mentomate://parent/dashboard`. Should be updated to post-merge route  
  per FR206.6. |
  | 12 | Test Seed Service | MEDIUM | MISSING_ITEM | apps/api/src/services/test-seed.ts:335,340,352,696,765,1154,1213,1297 | 8 references to `personaType` remain (5 hardcoded `'PARENT'`, 3 in  
  type/options). Not fully migrated per FR206.8. |
  | 12 | Home Cards | MEDIUM | MISSING_TEST | apps/api/src/routes/home-cards.test.ts:81,126 | Tests for home cards are skipped (`.skip`) due to middleware mock limitations. No active tests     
  validate precomputeHomeCards or card ranking logic. |
  | 12 | Profile Consent | MEDIUM | TYPE_SAFETY | apps/api/src/services/profile.ts:179 | Logic prevents minors from selecting PARENT persona. Still assumes personaType in request. Becomes dead 
  code once schema changes. |
  | 12 | Session Service | MEDIUM | ARCHITECTURE | apps/api/src/services/session.ts:775 | Falls back from `profile?.birthYear` to `birthYearFromDateLike(profile?.birthDate)`. Both fields exist 
  as fallback; should clean up when birthDate removed. |
  | 12 | Profile Schema (response) | MEDIUM | ARCHITECTURE | packages/schemas/src/profiles.ts:77 | API response schema still includes `personaType` field. Clients depend on this for rendering. 
  |
  | 12 | Test Infrastructure | MEDIUM | MISSING_ITEM | apps/api/src/services/profile.test.ts | 22 test references to personaType remain. Tests need refactoring to use birthYear/isOwner
  patterns. |
  | 12 | Routing (parent layout) | LOW | ARCHITECTURE | apps/mobile/src/app/(parent)/_layout.tsx:121-124 | Story 12.5 verified correct: routing uses `isOwner` + `hasLinkedChildren`, NOT        
  personaType. |
  | 12 | Exchanges (age voice) | LOW | MISSING_TEST | apps/api/src/services/exchanges.test.ts:54-70 | Tests for `getAgeVoice` exist (youth vs adult), but `resolveAgeBracket` not directly       
  tested. Coverage adequate via integration. |

  ## Findings — Epic 13: Session Lifecycle Overhaul

  | Epic | Area | Severity | Type | File:Line | Finding |
  |------|------|----------|------|-----------|---------|
  | 13 | Celebration Components | HIGH | MISSING_TEST | apps/mobile/src/components/common/celebrations/ | Zero test coverage for `CelestialCelebration`, `PolarStar`, `TwinStars`, `Comet`,      
  `OrionsBelt`. Reanimated animation lifecycle and `onComplete` callback cleanup untested. |
  | 13 | Stale Session Cron | HIGH | MISSING_TEST | apps/api/src/inngest/functions/session-stale-cleanup.ts | Inngest cron not tested for: (1) race where session resumed before closeSession    
  call, (2) multiple stale sessions on same profile closed concurrently, (3) failure handling if inngest.send fails after partial closure. |
  | 13 | Crash Recovery | MEDIUM | ARCHITECTURE | apps/mobile/src/lib/session-recovery.ts:37-46 | Fallback to profile-less recovery key may cause wrong-session recovery if user switches        
  profiles rapidly. Profile A's marker doesn't exist but profile-less marker from profile B could match. |
  | 13 | Silence Threshold | MEDIUM | MISSING_TEST | apps/api/src/services/session-lifecycle.test.ts | No test for `normalizeExpectedResponseMinutes` boundary at MIN (2 min). When input is 1,  
  it clamps to 1 (not 2), contradicting spec claim of 2-min minimum. |
  |