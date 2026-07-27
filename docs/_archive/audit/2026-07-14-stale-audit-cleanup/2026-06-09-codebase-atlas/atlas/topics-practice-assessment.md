# Topics, Practice & Assessment — Functional Atlas

> Branch reviewed: `new-llm`. Date: 2026-06-09.
> All file paths are repo-root-relative unless otherwise noted.

---

## Screens (route → purpose)

### Topic stack — `/(app)/topic/`

| Route | File | Purpose |
|---|---|---|
| `/(app)/topic` (index) | `apps/mobile/src/app/(app)/topic/index.tsx` | Redirect guard only. Sends the user back to `/(app)/library`. Never renders meaningful UI. Exists solely to seed the Expo Router stack so `router.back()` from `[topicId]` has a parent to return to (BUG-685). |
| `/(app)/topic/[topicId]` | `apps/mobile/src/app/(app)/topic/[topicId].tsx` | **Topic detail**: title, chapter, retention pill, last-studied text, challenge-verified badge, "practiced often" hint, collapsible Notes / Bookmarks / Sessions strips, related-topics horizontal rail, sticky Study CTA button. |
| `/(app)/topic/recall-test` | `apps/mobile/src/app/(app)/topic/recall-test.tsx` | **Recall test**: chat-style interface. User types a free-form answer from memory; server evaluates it. Three failure paths: encourage-retry, remediation-card with relearn CTA, success with library return. |
| `/(app)/topic/relearn` | `apps/mobile/src/app/(app)/topic/relearn.tsx` | **Relearn wizard**: multi-phase screen (subjects → topics → teaching-method). Can be entered with a specific `topicId` (direct entry, skips subject/topic phases) or without (full discovery mode). Calls `startRelearn` which returns a session ID for a `mode=relearn` session. |

Layout file: `apps/mobile/src/app/(app)/topic/_layout.tsx:8` exports `unstable_settings = { initialRouteName: 'index' }` to seed the stack.

### Practice stack — `/(app)/practice/`

| Route | File | Purpose |
|---|---|---|
| `/(app)/practice` (index) | `apps/mobile/src/app/(app)/practice/index.tsx` | **Practice Hub**: single scrollable menu with five areas: (1) Review card → `topic/relearn`, (2) Assessment row → `practice/assessment-picker` or library if none eligible, (3) Quiz card with Capitals / Guess Who sub-tiles, (4) Other Practice horizontal slider (vocabulary quiz per language subject, Dictation, Recitation), (5) Recent Progress row → `quiz/history`. |
| `/(app)/practice/assessment-picker` | `apps/mobile/src/app/(app)/practice/assessment-picker.tsx` | **Assessment picker**: FlatList of topics eligible for a formal assessment (completed session ≤ 30 days ago). Each row navigates to the assessment run screen. Shows in-progress badge if an active assessment exists. |
| `/(app)/practice/assessment` | `apps/mobile/src/app/(app)/practice/assessment/index.tsx` | **Assessment run**: chat-style screen. Handles: resuming an in-progress assessment, creating a new one on first real answer, sequential answer submission with streamed evaluation feedback, depth escalation (recall → explain → transfer), terminal result card (passed / borderline / failed_exhausted), gap-fill session launch, decline-refresh, reward burst on pass. |

Helper (non-route) files inside `/(app)/practice/assessment/`:
- `_assessment-readiness.ts` — regex to detect "ok/ready/yes" readiness signals before the real evaluation starts.
- `_assessment-copy.ts` — client-side prompt assembly for opening/first-question/next-action text.

Layout file: `apps/mobile/src/app/(app)/practice/_layout.tsx:4` — `unstable_settings = { initialRouteName: 'index' }`.

---

## Capabilities (user task → backend process, file:line)

### 1. View a topic's detail

**Action:** User taps a topic row in the book/shelf screen.  
**Route:** `/(app)/topic/[topicId]?subjectId=...&bookId=...&chapter=...`

| Data fetched | Hook | API endpoint | Service / file:line |
|---|---|---|---|
| Topic progress (completionStatus, retention status, mastery, strongReviews) | `useTopicProgress` | `GET /subjects/:subjectId/topics/:topicId/progress` | `apps/api/src/routes/progress.ts` → `apps/api/src/services/progress.ts` |
| Retention card (SM-2 state, nextReviewAt, failureCount) | `useTopicRetention` | `GET /topics/:topicId/retention` | `apps/api/src/routes/retention.ts:93` → `apps/api/src/services/retention-data.ts` |
| Active session (resume target) | `useActiveSessionForTopic` | `GET /sessions/active?topicId=...` | `apps/api/src/routes/sessions.ts` |
| Learning resume target | `useLearningResumeTarget` | `GET /progress/resume-target?subjectId=...&topicId=...` | `apps/api/src/routes/progress.ts` |
| Notes (topic-scoped) | `useTopicNotes` | `GET /subjects/:subjectId/topics/:topicId/notes` | `apps/api/src/routes/notes.ts` |
| Concept mastery signals | `useConceptMasterySignals` | `GET /topics/concept-mastery?topicIds=...` | `apps/api/src/routes/notes.ts` |
| Sessions for topic | `useTopicSessions` | `GET /subjects/:subjectId/topics/:topicId/sessions` | `apps/api/src/routes/sessions.ts` |
| Bookmarks (paginated) | `useBookmarks` | `GET /bookmarks?subjectId=...&topicId=...&limit=50` | `apps/api/src/routes/bookmarks.ts` |
| Book+topics (for related topics rail) | `useBookWithTopics` | `GET /subjects/:subjectId/books/:bookId` | `apps/api/src/routes/books.ts` |
| Topic resolve (deep-link without subjectId) | `useResolveTopicSubject` | `GET /topics/:topicId/subject` | `apps/api/src/routes/progress.ts` |

**Write actions:**
- Create note → `POST /subjects/:subjectId/notes` → `apps/api/src/routes/notes.ts` → `apps/api/src/services/notes.ts`
- Update note → `PUT /notes/:noteId` → `apps/api/src/routes/notes.ts`
- Delete note → `DELETE /notes/:noteId` → `apps/api/src/routes/notes.ts`

**CTA routing** (`[topicId].tsx:438-492`):
- `not_started` → push `/(app)/session?mode=learning`
- Overdue (`completed/verified/stable` + `nextReviewAt` in past) → push `/(app)/session?mode=review`
- Active session → push `/(app)/session?sessionId=...` (resume)
- Otherwise → push `/(app)/session?mode=learning` (with optional `sessionId` if paused)

---

### 2. Recall test (delayed free-recall check)

**Action:** Triggered from overdue-topic notifications or retention cues.  
**Route:** `/(app)/topic/recall-test?topicId=...`

| Step | Backend | File:line |
|---|---|---|
| Submit answer | `POST /retention/recall-test` body: `{topicId, answer}` | `apps/api/src/routes/retention.ts:106` → `apps/api/src/services/retention-data.ts:processRecallTest` |
| "I don't remember" tap | Same endpoint with `{topicId, attemptMode: 'dont_remember'}` | Same |
| Outcome: `passed` | Animate success, show "Go to Library" | Client only |
| Outcome: `feedback_only` (< 3 failures) | Animate encouragement hint, re-enable input | Client only |
| Outcome: `redirect_to_library` (≥ 3 failures) | Show `RemediationCard` with `onRelearnTopic` | Client routes to `/(app)/topic/relearn` |

Timeout guard: 30s hard timeout surfaces `ErrorFallback` with retry. (`recall-test.tsx:102-106`)

---

### 3. Relearn (start a fresh re-explanation session)

**Action:** User picks teaching method in the relearn wizard.  
**Route:** `/(app)/topic/relearn?topicId=...&subjectId=...`

| Step | Backend | File:line |
|---|---|---|
| Load overdue topics (for non-direct entry) | `GET /retention/overdue` | `apps/api/src/routes/retention.ts` → `apps/api/src/services/overdue-topics.ts:getOverdueTopicsGrouped` |
| Load teaching preference | `GET /subjects/:subjectId/teaching-preference` | `apps/api/src/routes/retention.ts:148` → `apps/api/src/services/retention-data.ts:getTeachingPreference` |
| Start relearn | `POST /retention/relearn` body: `{topicId, method: 'same'|'different', preferredMethod?}` | `apps/api/src/routes/retention.ts:121` → `apps/api/src/services/retention-data.ts:startRelearn` |
| Navigate to session | Reads `result.sessionId` from response, pushes `/(app)/session?mode=relearn` | `relearn.tsx:315` |

Gating (`relearn.tsx:374-397`):
- V1 mode: `navigationContract.canEnter('topic/relearn', {for: 'self'|'child'})` — blocked if fails.
- V0 mode fallback: blocked if `navigationContract.isParentProxy`.
- Blocked → silent redirect to `/(app)/home` with Sentry breadcrumb.

Age-based copy: `computeAgeBracket(birthYear)` from `@eduagent/schemas` — minors get `COPY_LEARNER` and `TEACHING_METHODS_LEARNER`. (`relearn.tsx:153-157`)

---

### 4. Practice Hub index

**Action:** User taps "Practice" tab (learner shape) or navigates to `/(app)/practice`.  
**Route:** `/(app)/practice`

Gating (`practice/index.tsx:444-449`):
- V1: `navigationContract.canEnter('practice')` — redirects to `/(app)/home` if false.
- V0 fallback: `navigationContract.isParentProxy`.

Data fetched (all read, no writes on this screen):

| Data | Hook | API |
|---|---|---|
| Review summary (overdue count, next review at) | `useReviewSummary` | `GET /progress/review-summary` |
| Quiz stats (per activity type: bestScore, roundsPlayed, totalXp) | `useQuizStats` | `GET /quiz/stats` |
| All subjects (to find language subjects) | `useSubjects` | `GET /subjects` |
| Assessment eligible topics (count for badge) | `useAssessmentEligibleTopics` | `GET /retention/assessment-eligible` → `apps/api/src/routes/retention.ts:69` → `apps/api/src/services/retention-data.ts:getAssessmentEligibleTopics` |

Navigation out:
- Review card → `/(app)/topic/relearn`
- Assessment row (eligible > 0) → `/(app)/practice/assessment-picker`
- Assessment row (none eligible, subject exists) → `/(app)/shelf/[subjectId]`
- Assessment row (none eligible, no subjects) → `/(app)/library`
- Quiz card → `/(app)/quiz`
- Capitals sub-tile → `/(app)/quiz/launch?activityType=capitals`
- Guess Who sub-tile → `/(app)/quiz/launch?activityType=guess_who`
- Vocabulary card per language subject → `/(app)/quiz/launch?activityType=vocabulary&subjectId=...`
- Dictation tile → `/(app)/dictation`
- Recitation tile → `/(app)/session?mode=recitation`
- History row → `/(app)/quiz/history`

---

### 5. Assessment picker

**Action:** User taps Assessment row from Practice Hub when eligible topics > 0.  
**Route:** `/(app)/practice/assessment-picker`

Data fetched:
- `useAssessmentEligibleTopics()` → `GET /retention/assessment-eligible` (`retention.ts:69`)
  - Eligibility criteria (`retention-data.ts:632-720`): topic has a completed/auto-closed session with `exchangeCount >= MIN_EXCHANGES_FOR_TOPIC_COMPLETION` within the last 30 days AND the topic is owned by the profile.

Each topic row navigates to `/(app)/practice/assessment` with params: `subjectId`, `topicId`, `topicTitle`, `topicDescription`, `pedagogyMode`, `languageCode`.

---

### 6. Assessment run (topic verification interview)

**Action:** User taps a topic in the assessment picker (or resumes an in-progress assessment).  
**Route:** `/(app)/practice/assessment?subjectId=...&topicId=...`

| Step | Backend | File:line |
|---|---|---|
| Load active assessment (resume) | `GET /subjects/:subjectId/topics/:topicId/assessments/active` | `apps/api/src/routes/assessments.ts:76` → `apps/api/src/services/assessments.ts:getActiveAssessmentForTopic` |
| Create assessment (first real answer) | `POST /subjects/:subjectId/topics/:topicId/assessments` | `apps/api/src/routes/assessments.ts:51` → `apps/api/src/services/assessments.ts:createAssessment` |
| Submit answer | `POST /assessments/:assessmentId/answer` | `apps/api/src/routes/assessments.ts:92` |
| Decline refresh | `PATCH /assessments/:assessmentId/decline-refresh` | `apps/api/src/routes/assessments.ts:299` |

**Submit answer pipeline** (`assessments.ts:92-296`):
1. App-help query guard: if user asks "how do I..." → returns `buildAssessmentAppHelpEvaluation` without LLM call.
2. Load topic context (title, description, subject name, pedagogy mode, language code).
3. `db.transaction` with `SELECT ... FOR UPDATE` lock on the assessment row (`lockAssessmentForAnswerSubmission`, WI-136 H4).
4. Check for "I don't remember" / acknowledgement-only patterns → `buildNeedsReviewEvaluation` (no LLM).
5. `evaluateAssessmentAnswer` → `routeAndCall(messages, rung=2, {flow:'assessment.evaluate'})` using `ASSESSMENT_EVAL_SYSTEM_PROMPT` (+ `LANGUAGE_ASSESSMENT_EVAL_PROMPT` if `pedagogyMode === 'four_strands'`).
6. `resolveAssessmentStatus` to decide `in_progress / passed / borderline / failed_exhausted`.
7. If terminal (not forceReview): `updateRetentionFromSession` (SM-2 update) + `insertSessionXpEntry` — both inside the SAME transaction (CR #8 atomicity fix).
8. Post-transaction: `recordAssessmentCompletionActivity` → `recordPracticeActivityEvent` (`practice-activity-events.ts:43`).

**Depth progression** (`assessments.ts:50-58`): recall (cap 0.5) → explain (cap 0.8) → transfer (cap 1.0). Max 4 exchanges (`MAX_ASSESSMENT_EXCHANGES = 4`, `assessments.ts:59`).

**Terminal outcomes and UI branches** (`assessment/index.tsx:490-530`):
- `passed` → "Done" button back to Practice + `RewardBurst` celebration.
- `borderline` → "Gap fill session" CTA (`/(app)/session?mode=gap_fill`) or "Decline refresh".
- `failed_exhausted` → "Start a session" CTA (`/(app)/session?mode=learning`) or "Not now".

Language assessment: additional `LANGUAGE_ASSESSMENT_EVAL_PROMPT` appended when `pedagogyMode === 'four_strands'` (`assessments.ts:145-148`). Greeting-topic special casing for greetings/introductions topics (`assessments.ts:136-143`).

---

### 7. Topic completion / verification (session-embedded)

**Action:** Session ends after sufficient exchanges; topic marked as completed or verified.

**Service:** `apps/api/src/services/topic-completion.ts`
- `isMeaningfulCompletedSession`: `exchangeCount >= MIN_EXCHANGES_FOR_TOPIC_COMPLETION` AND terminal status (`completed` or `auto_closed`).
- Called from the session-lifecycle Inngest function to gate topic completion crediting.

**Teach-back verification** (`teach-back.ts`, triggered inside sessions via Inngest):
- `shouldTriggerTeachBack`: `easeFactor >= 2.3 && repetitions > 0` (`teach-back.ts:29-33`).
- Session-embedded — runs as part of an active learning session (session type `teach_back`), not a standalone screen.
- Post-session: `processTeachBackCompletion` (`verification-completion.ts:193`) — reads last 5 `ai_response` events, parses `teach_back_assessment` signal from metadata or envelope, maps to SM-2 via `mapTeachBackRubricToSm2` (weighted: accuracy 50%, completeness 30%, clarity 20%).

**Evaluate (Devil's Advocate) verification** (`evaluate.ts`, `evaluate-data.ts`, triggered inside sessions):
- `shouldTriggerEvaluate`: `easeFactor >= 2.5 && repetitions > 0` (`evaluate.ts:28-33`).
- Session type `evaluate` — also runs inside a learning session.
- Post-session: `processEvaluateCompletion` (`verification-completion.ts:37`) — parses `evaluate_assessment` signal, maps to SM-2 with modified floor (failure never drops below quality 2), escalates difficulty rung (1–4) on success or de-escalates/resets on failure.

---

### 8. Topic suggestions (in-book discovery)

**Action:** User views a book screen and sees suggested next topics.  
**API:** `GET /subjects/:subjectId/books/:bookId/topic-suggestions` → `apps/api/src/routes/topic-suggestions.ts:25` → `apps/api/src/services/suggestions.ts:getUnusedTopicSuggestions`

Returns unused suggestions for a book (AI-generated at book-creation time, marked as used once the topic session starts).

---

### 9. Overdue topics query (used by Relearn and Practice Hub)

**API:** `GET /retention/overdue` → `apps/api/src/services/overdue-topics.ts:getOverdueTopicsGrouped`
- Queries `retentionCards` joined through `curriculumTopics → curriculumBooks → curricula → subjects.profileId` for ownership (`overdue-topics.ts:37-51`).
- Returns up to 500 overdue cards, truncation-aware.
- Groups by subject, sorts by overdueDays descending.

---

### 10. Recall nudge (Inngest cron)

**Function:** `apps/api/src/inngest/functions/recall-nudge.ts:45` — `recall-nudge`, cron `0 * * * *` (hourly).
- Scans all profiles where local time is ~8 AM AND there are overdue retention cards AND push notifications enabled AND consent granted.
- Fans out `recall-nudge.send` per profile.
- Cross-profile by design; see `@inngest-admin: cross-profile` annotation.

---

### 11. Topic probe extraction (Inngest)

**Function:** `apps/api/src/inngest/functions/topic-probe-extract.ts` — fires on `topic.probe.requested` event.
- Extracts signals from session exchange history via `extractSignalsFromExchangeHistory`.
- Calls `ensureRetentionCard` + `evaluateRecallQuality` to update the SM-2 retention card.

---

## Navigation depth map

Depth is counted from the tab root (tap 1 = the tab icon itself).

| Capability | Entry point | Taps from tab root | Exceeds 2 deep? |
|---|---|---|---|
| Topic detail | Library tab → book screen → topic row | 3 | YES |
| Topic detail (via progress tab overdue widget) | Progress tab → overdue topic | 2 | No |
| Start a study session (from topic detail) | Library → book → topic → CTA | 4 | YES |
| Recall test | Notification → `/(app)/topic/recall-test` (deep link) | 1 | No |
| Relearn from recall test failure | Library → book → topic → recall test → relearn | 5 | YES (very deep) |
| Relearn from Practice Hub | Practice tab → Practice Hub → Review card | 2 | No |
| Relearn (direct from notification) | Notification → `/(app)/topic/relearn` | 1 | No |
| Practice Hub | Practice tab | 1 | No |
| Assessment picker | Practice tab → Practice Hub → Assessment row | 2 | No |
| Assessment run | Practice tab → Practice Hub → Assessment → Picker row | 3 | YES |
| Assessment run (resume from picker) | Same | 3 | YES |
| Quiz (capitals/guess who) | Practice tab → Practice Hub → Quiz sub-tile | 2 | No |
| Quiz hub (full) | Practice tab → Practice Hub → Quiz card | 2 | No |
| Quiz launch | Practice tab → Practice Hub → Quiz → Launch | 3 | YES |
| Quiz play | Practice tab → Practice Hub → Quiz → Launch → Play | 4 | YES |
| Dictation | Practice tab → Practice Hub → Other Practice slider → Dictation | 2 (but slider is horizontal) | No (horizontal) |
| Recitation | Practice tab → Practice Hub → Other Practice slider → Recitation | 2 (slider) | No (horizontal) |
| Vocabulary quiz | Practice tab → Practice Hub → Other Practice slider → Language card | 2 (slider) | No (horizontal) |
| Quiz history | Practice tab → Practice Hub → History row | 2 | No |
| Quiz round results | Practice tab → Practice Hub → Quiz → Launch → Play → Results | 5 | YES |
| Teach-back (embedded in session) | Library → book → topic → session (auto-triggered) | 4+ | YES |
| Evaluate (embedded in session) | Library → book → topic → session (auto-triggered) | 4+ | YES |

---

## Backend processes & data model

### Tables written in this domain

| Table | Written by | Gating |
|---|---|---|
| `assessments` | `createAssessment`, `updateAssessment` in `services/assessments.ts` | `profileId` column + ownership pre-check via `curriculumTopics → curricula → subjects.profileId` before insert |
| `retention_cards` | `processRecallTest`, `updateRetentionFromSession`, `ensureRetentionCard` | `eq(retentionCards.profileId, profileId)` in every write |
| `practice_activity_events` | `recordPracticeActivityEvent` | `profileId` in values; dedupe key prevents double-recording |
| `session_events` (structuredAssessment column) | `processEvaluateCompletion`, `processTeachBackCompletion` | `eq(sessionEvents.profileId, profileId)` in WHERE |
| `teaching_preferences` | `setTeachingPreference`, `deleteTeachingPreference` | `subjects.profileId` enforced via foreign key chain |
| `needs_deepening_topics` | `adaptive-teaching.ts` (Challenge Round + Evaluate) | `profileId` |
| `xp_ledger` | `insertSessionXpEntry` | `profileId` |

### LLM calls in this domain

| Call | Rung | Flow tag | Where |
|---|---|---|---|
| Assessment answer evaluation | 2 | `assessment.evaluate` | `services/assessments.ts:340` |
| Quick-check answer evaluation (session-embedded) | 2 | `assessment.evaluate` | `services/assessments.ts:446` |
| Quick-check question generation | 2 | `assessment.evaluate` | `services/assessments.ts:287` |
| Relearn session generation | Via session infra | (session LLM routing) | `retention-data.ts:startRelearn` → session creation |
| Recall bridge question generation | Via `routeAndCall` | (session context) | `services/recall-bridge.ts:37` |
| Teach-back session responses | Via exchange infra | (session LLM routing) | session exchanges |
| Evaluate (Devil's Advocate) session responses | Via exchange infra | (session LLM routing) | session exchanges |
| Topic probe extraction | Via Inngest | `topic.probe.requested` | `inngest/functions/topic-probe-extract.ts` |

### SM-2 quality mappings

| Source | Mapping function | File:line |
|---|---|---|
| Assessment evaluation | `mapEvaluateQualityToSm2(passed, masteryScore*5)` | `services/evaluate.ts:68` (used in `assessments.ts:217`) |
| Recall test | `processRecallResult` | `services/retention.ts` → `retention-data.ts:processRecallTest` |
| Teach-back | `mapTeachBackRubricToSm2` (accuracy 50%, completeness 30%, clarity 20%) | `services/teach-back.ts:46` |
| Evaluate | `mapEvaluateQualityToSm2` with failure floor | `services/evaluate.ts:68`, used in `verification-completion.ts:100` |

---

## Complexity signals & redesign notes

### 1. The topic-detail screen is a mini-dashboard (7 concurrent API calls)

`apps/mobile/src/app/(app)/topic/[topicId].tsx` fires at least **9 parallel queries** on mount: progress, retention card, active session, resume target, book-with-topics, notes, concept signals, sessions, bookmarks. Each section (Notes, Bookmarks, Sessions) is a collapsible strip — collapsed by default, meaning the data is fetched but hidden until the user taps. This is classic premature-fetch complexity that could be deferred to on-expand.

### 2. Assessment entry requires 3 taps from Practice Hub (4 from Library)

Path: Practice Hub → Assessment row → Assessment Picker → tap a topic → Assessment screen. This is 3 taps after reaching Practice. From Library the path is: Library tab → book → topic → study button → session. The formal "assessment" mode has a distinct, separate entry flow that many users may never discover.

### 3. Two separate recall/review entry paths with different UX

- `/(app)/topic/recall-test` — chat-based recall test, reached via notifications or recall-surface entry points.
- `/(app)/topic/relearn` — wizard-style picker before starting a session.
These are conceptually the same learning activity (reviewing a topic you've already covered) but split into two different screens with different flows. A user who fails the recall test is redirected to `relearn`; a user who comes from Practice Hub goes directly to `relearn`. The `recall-test` screen also functions as a gate: pass → done, fail → route to relearn. This double-screen pattern could be merged.

### 4. The Practice Hub is a launcher-only screen with no content of its own

`/(app)/practice/index.tsx` is entirely composed of navigation buttons. It has no interactive content — every card immediately launches a different route. It's an indirection layer that could collapse into the tabs themselves or a single unified action surface.

### 5. Assessment eligibility logic is duplicated across client and server

The Practice Hub shows a count badge and adjusts the assessment CTA copy based on `useAssessmentEligibleTopics()` count, but the actual eligibility check (last 30 days, min exchanges) lives server-side in `retention-data.ts:632`. There is no client-side guard — if the server returns 0 topics, the client routes to the library instead of the picker. If the server returns stale data, the picker shows an empty state. The eligibility count surfaces in two places: the Practice Hub badge AND the Assessment Picker screen itself.

### 6. Modal-on-modal potential: Assessment CTA from within a session

The Assessment screen's `borderline` result offers a "Gap fill session" CTA that pushes `/(app)/session?mode=gap_fill`. This means: Practice Hub → Assessment Picker → Assessment (chat) → result card → new Session screen. Five screens deep, all opened progressively. The back navigation would unwind all of them.

### 7. The Relearn screen has three internal phases rendered as state, not routes

`relearn.tsx` renders `phase === 'subjects' | 'topics' | 'method'` as local state. From the user's perspective this is a 3-step wizard, but back-navigation is handled via custom `handleBack` with phase-backtracking logic. This pattern is correct for a wizard but is invisible to Expo Router (no URL change per phase). It means the URL is `/(app)/topic/relearn` throughout all three phases — deep linking cannot target a specific phase.

### 8. Teach-back and Evaluate are invisible features

Neither Teach-back nor Evaluate has any mobile screen. They are triggered automatically inside a session when the SM-2 thresholds are met (`easeFactor >= 2.3` / `>= 2.5`). Users have no way to see these features exist, what triggered them, or what the outcome was. The structured assessment is written to `session_events.structuredAssessment` (server-side only) and never surfaced in the mobile UI.

### 9. The "Other Practice" horizontal slider contains 3+ modalities that are harder to discover

Vocabulary quizzes (per language subject), Dictation, and Recitation are in a horizontal-scroll slider at the bottom of the Practice Hub. These are below the fold on small screens and require horizontal scrolling to see. They represent substantial features (Dictation has its own route `/dictation`, Recitation goes to a full session) but are visually subordinate to the Review and Quiz cards above them.

### 10. Quiz history is two levels below Practice

`/(app)/quiz/history` is accessed from the "Recent Progress" row at the bottom of Practice Hub (Practice Hub → History row). `/(app)/quiz` is also accessible from Practice Hub (the Quiz card), and `/(app)/quiz/history` is also accessible from `/(app)/quiz` itself — two entry points at the same depth from Practice, but discoverable only after reaching Practice.

### 11. Assessment concurrency lock spans the LLM call

`lockAssessmentForAnswerSubmission` takes a Postgres `SELECT ... FOR UPDATE` lock that is held for the entire duration of the LLM call (2-5 seconds). This is documented as a deliberate trade-off (`assessments.ts:360-372`), but it means concurrent requests for the same assessment row block. A one-screen redesign that collapses assessment, review, and recall into a single interaction surface must be careful about this — multiple simultaneous interactions against the same session/assessment could create contention.

### 12. Assessment eligibility has a 30-day recency cap not shown in the UI

`getAssessmentEligibleTopics` filters `endedAt >= 30 days ago`. If a topic was studied 31 days ago, it silently disappears from the picker. The UI shows "Study [Subject] first" when no topics are eligible, which is misleading if topics exist but are stale.

---

## Overlaps with other domains

### Progress tracking shown in multiple places

The `retentionStatus` / `strongReviews` / `masteredAt` displayed in `TopicHeader` on the topic detail screen also appears:
- In the `/(app)/progress` tab (subject-level retention overview).
- In `/(app)/child/[profileId]` progress view (guardian proxy).
- In `/(app)/session-summary/[sessionId]` post-session recap.
- In the challenge-verified badge on the topic detail (from `topicProgress.masteryVerificationState`).

### Notes accessible from 4 entry points

1. `/(app)/topic/[topicId]` — collapsible Notes strip (inline create/edit/delete).
2. `/(app)/session` — save-to-notes action during a session.
3. `/(app)/session-summary/[sessionId]` — notes from that session.
4. `/(app)/progress` — Notes section in some progress views.

### Bookmarks accessible from 3 entry points

1. `/(app)/topic/[topicId]` — Bookmarks strip (tap → session detail).
2. `/(app)/session` — bookmark an AI explanation during a session.
3. `/(app)/session-summary/[sessionId]` — saved bookmarks from that session.

### Quiz stats shown in 2 places

1. `/(app)/practice/index.tsx` — aggregate XP, best score, rounds played in the Quiz card header.
2. `/(app)/quiz/index.tsx` — per-activity stats in the Quiz hub selection screen.

### Overdue topic count shown in 3 places

1. Practice Hub review card badge (from `useReviewSummary`).
2. Relearn screen (from `useOverdueTopics` — the actual list).
3. Progress tab review surface.

### Assessment eligibility count shown in 2 places

1. Practice Hub assessment row subtitle/badge (from `useAssessmentEligibleTopics().data.length`).
2. Assessment Picker screen itself (FlatList of all eligible topics).

### Session entry points from this domain

From the topic detail and practice domain, sessions are started with the following modes:
- `mode=learning` (normal study start)
- `mode=review` (overdue topic review)
- `mode=relearn` (after relearn wizard)
- `mode=gap_fill` (from failed assessment with weak areas)
- `mode=recitation` (from Practice Hub slider)

The session domain (`/(app)/session`) is a shared sink for all of these; session logic is the primary downstream consumer of topic and assessment data. Topic details, assessments, recall tests, relearn, and practice all ultimately route users into sessions.

### SM-2 retention card updated from 5 different paths

The same `retention_cards` table row for a topic is written by:
1. `processRecallTest` — recall test answer submission.
2. `updateRetentionFromSession` — called from the assessment transaction (CR #8) when assessment reaches terminal state.
3. `processEvaluateCompletion` — post-session Evaluate verification (via Inngest).
4. `processTeachBackCompletion` — post-session Teach-back verification (via Inngest).
5. `topic-probe-extract` Inngest function — updates after topic probe extraction.

All five update paths are independent; there is no central "apply retention update" function that routes through a single gate.
