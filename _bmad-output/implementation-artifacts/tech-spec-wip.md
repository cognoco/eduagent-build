---
title: 'Practice Activity Summary Service'
slug: 'practice-activity-summary-service'
created: '2026-05-12'
status: 'planned'
stepsCompleted: [1, 2]
tech_stack: ['TypeScript', 'Hono', 'Drizzle ORM', 'PostgreSQL', 'React Native', 'Expo']
files_to_modify:
  [
    'packages/database/src/schema/*',
    'packages/database/src/repository.ts',
    'packages/schemas/src/snapshots.ts',
    'apps/api/src/services/practice-activity-summary.ts',
    'apps/api/src/services/practice-activity-events.ts',
    'apps/api/src/services/celebration-events.ts',
    'apps/api/src/services/quiz/complete-round.ts',
    'apps/api/src/services/dictation/result.ts',
    'apps/api/src/services/retention-data.ts',
    'apps/api/src/services/vocabulary.ts',
    'apps/api/src/services/celebrations.ts',
    'apps/api/src/services/milestone-detection.ts',
    'apps/api/src/services/weekly-report.ts',
    'apps/api/src/services/monthly-report.ts',
    'apps/api/src/services/progress.ts',
    'apps/api/src/inngest/functions/weekly-progress-push.ts',
    'apps/api/src/inngest/functions/monthly-report-cron.ts',
    'apps/mobile/src/components/progress/WeeklyReportCard.tsx',
    'apps/mobile/src/components/progress/MonthlyReportCard.tsx',
  ]
code_patterns:
  [
    'Business logic in apps/api/src/services',
    'Shared API contracts in @eduagent/schemas',
    'Scoped reads/writes by profileId',
    'Append-only ledger rows with idempotent source keys',
  ]
test_patterns:
  [
    'Co-located unit tests',
    'API integration tests for DB scoping',
    'Report generation tests',
    'Mobile component render tests',
  ]
---

# Tech-Spec: Practice Activity Summary Service

**Created:** 2026-05-12

## Overview

### Problem Statement

Reporting and library surfaces need a shared, reliable way to summarize learner activity under the Practice / testing hub. Today, the data is spread across multiple persistence models: quiz rounds, dictation results, assessments, retention cards (topic-level and vocabulary-level), recitation sessions, fluency drill scores, session metadata milestones, pending celebrations, and report JSONB. Weekly and monthly reports already have an optional `practiceSummary` schema field, but **no code path ever populates it** — both `generateWeeklyReportData` and `generateMonthlyReportData` return objects without this field, and every report row in production has `practiceSummary = undefined`. The current schema shape (`reportPracticeSummarySchema`) only covers `quizzesCompleted` and `reviewsCompleted`, and the latter cannot be computed from existing data without a ledger (see Decision below).

The target is a reusable backend building block that can aggregate practice activity for a time period, compare it week over week and month over month, and feed reports plus the library/progress activity count without each surface inventing its own query logic.

### Solution

Add a canonical append-only practice activity ledger, likely `practice_activity_events`, plus a lightweight append-only celebration history, likely `celebration_events`. Add a shared API service, likely `apps/api/src/services/practice-activity-summary.ts`, that computes period-bounded testing/practice activity summaries from those ledgers. Wire the service into weekly report generation, monthly report generation, and the progress/library endpoint that needs an activity count.

The practice ledger should be the source of truth for new practice/test counts, points, scores, and review attempts. The celebration ledger should be the source of truth for total celebration counts by day/week/month. Existing tables (`quiz_rounds`, `dictation_results`, `assessments`, `retention_cards`, `vocabulary_retention_cards`, `learning_sessions`, `session_events`, `milestones`, `coaching_card_cache`) remain the operational sources where completion or celebration happens, but summary surfaces should not each query them independently. New completion paths emit one ledger event at the moment an activity completes; new celebration paths emit one celebration event when a celebration is earned or shown. Historical data before the ledgers cannot be made exact for review or coaching-card celebration counts.

Weekly and monthly report visuals must keep their existing learning metrics row (`sessions`, `time`, `topics`) intact. Testing/practice metrics are additive: render a separate row/block for tests rather than replacing the current learning row.

### Scope

**In Scope:**

- Add a canonical append-only ledger for completed practice/testing activity. Minimum shape: `profileId`, optional `subjectId`, `activityType`, optional subtype, `completedAt`, `pointsEarned`, score fields (`score`, `total`, or equivalent), source identifiers, and metadata needed for language/activity detail.
- Add a lightweight append-only celebration ledger. Minimum shape: `profileId`, `celebratedAt`, `celebrationType`, `reason`, optional `sourceType`, optional `sourceId`, and metadata JSONB.
- Emit ledger events from completed quizzes (`quiz_rounds`), completed assessments, completed dictations, completed review attempts, completed recitation activity, and fluency drill score events.
- Emit celebration events when milestone or coaching-card celebrations are earned/shown. Do not count from `coaching_card_cache.pendingCelebrations` as a history source because it is an opaque queue that can be cleared.
- Aggregate completed quizzes from ledger events emitted when `quiz_rounds.status = 'completed'`, split by `capitals`, `guess_who`, and `vocabulary`. Vocabulary rounds must be language-aware (`languageCode` is NULL for capitals/guess_who, non-null for vocabulary — decide whether to group by language or aggregate flat).
- Aggregate completed assessments from ledger events emitted for terminal `assessments` rows. Terminal statuses are: `passed`, `failed`, `borderline`, `failed_exhausted`. Decide which terminal states count as "completed" for the summary (all four? only `passed`?).
- Aggregate completed dictations from ledger events emitted when a `dictation_results` row is created. Completion proxy today is `createdAt` (no `completedAt` column exists). Calendar date is stored in `date` column.
- Aggregate normalized practice/testing points from `practice_activity_events.pointsEarned`. Quiz XP (`quiz_rounds.xpEarned`) and topic XP (`xp_ledger`) are disconnected today; the summary should not have to join multiple XP stores after ledger adoption.
- Aggregate `quiz_missed_items` per activity type — items the learner got wrong, with `surfaced` and `convertedToTopic` flags. This is the pedagogically useful error-rate signal.
- Aggregate fluency drill scores from ledger events emitted when `session_events.drillCorrect` and `session_events.drillTotal` are populated (integer columns, populated from LLM envelope `ui_hints.fluency_drill.score` during sessions).
- Count recitation activity from ledger events emitted for `learning_sessions.metadata->>'effectiveMode' = 'recitation'`. Note: `effectiveMode` is an untyped JSONB key (not a DB enum), with known values: `learning`, `freeform`, `homework`, `recitation`, `practice`, `review`. Decide whether `practice` and `review` mode sessions should also emit practice activity events.
- Provide consolidated period totals: total completed tests/reviews, total practice/testing points, score totals/accuracy where available, and total celebrations.
- Provide breakdowns by activity type (`quiz`, `review`, `assessment`, `dictation`, `recitation`, `fluency_drill`) and by subject (`subjectId`/subject name when available), including counts and points.
- Count total distinct testing/practice activity types used in the period.
- Aggregate scores where the source has scored outcomes.
- Support same-period and prior-period summaries so callers can compare week over week and month over month.
- Populate report JSONB practice/testing summary for weekly and monthly reports. This requires modifying the Inngest crons (`weekly-progress-push.ts`, `monthly-report-cron.ts`) to call the new service and inject `practiceSummary` into the report data before insertion.
- WeeklyReportCard already renders practice tiles conditionally (`testID="weekly-report-quizzes"` and `testID="weekly-report-reviews"`) when `practiceSummary` is present. MonthlyReportCard has **no** practice rendering at all — requires new JSX + data consumption path.
- Expose or embed the activity count needed by the library/progress surface. Note: `getOverallProgress` today returns only topic counts and retention status — no quiz/dictation/review activity counts exist anywhere in the progress response.

**Out of Scope:**

- Replacing existing sessions/time/topics report metrics.
- Changing quiz scoring, dictation scoring, assessment grading, or recitation UX.
- Reworking the Practice hub UI itself.
- Adding stars or a reward ledger (no stars/badges/achievements tables exist in the DB).
- Rendering detailed celebration breakdowns in v1. Store event detail for future use, but report UI only needs total celebration count initially.
- Faking exact historical review counts from mutable SRS state (`lastReviewedAt`, `repetitions`) for periods before the ledger exists.
- Adding quiz/dictation data to the `progress_snapshots` pipeline (evaluate separately).
- Building a dictation history screen (none exists today — any summary linking to "view dictation history" would hit a dead end).

### Decision — Review Counts

`retention_cards.lastReviewedAt` is a single mutable timestamp overwritten on every review. `repetitions` is a cumulative SM-2 state counter, not a per-period count. **There is no append-only review event log.** You cannot answer "how many reviews happened in week W" from current data.

Additionally, `vocabularyRetentionCards` (`packages/database/src/schema/language.ts`) is an entirely separate SRS pipeline — per-vocabulary-item, with its own SM-2 fields (`easeFactor`, `intervalDays`, `repetitions`, `lastReviewedAt`, `nextReviewAt`, `failureCount`, `consecutiveSuccesses`). The spec must account for both card types or explicitly exclude vocabulary reviews.

**Decision:** use the broader `practice_activity_events` ledger rather than a review-only table. Review counts mean completed spaced-review attempts, not due cards and not "cards whose mutable `lastReviewedAt` currently falls inside the period."

**Activity boundary rule:** an "activity" is one user-initiated action, not one internal state mutation. `completeQuizRound` (complete-round.ts:293) runs in a single transaction that (a) marks the round completed, (b) calls `reviewVocabulary` per vocabulary question (lines 358-379), and (c) updates `quiz_mastery_items` SM-2 state (lines 420-519). These are internal side effects of quiz completion, not standalone review flows. Only `processRecallTest` (retention-data.ts:622) is a user-initiated standalone review action today.

Therefore:
- **Topic recall reviews** (`processRecallTest`): emit `review` / `topic_recall` events — this IS a standalone user action.
- **Vocabulary SRS updates from quiz completion** (`reviewVocabulary` called by `completeQuizRound`): do NOT emit separate review events. The quiz event covers this activity. If a standalone vocabulary review screen is added later, `reviewVocabulary` should emit review events only when called outside quiz completion (add a `callerContext` parameter or similar guard).
- **Quiz mastery SM-2 updates** (inside `completeQuizRound`): do NOT emit separate review events. These are internal SM-2 state updates within the quiz transaction, not user-visible actions.

Without this rule, completing one 10-question vocabulary quiz would generate 1 quiz event + 10 vocabulary review events + up to 10 mastery review events = 21 "activities" for one user action.

Historical review counts before the ledger exists are not exact and should not be backfilled from mutable SRS fields. Reports created before the ledger rollout can remain without review activity, or only include activity types with trustworthy historical completion rows if a later backfill is intentionally scoped.

### Decision — Celebration Counting

Celebrations are persisted as an opaque JSONB array (`pendingCelebrations`) inside `coaching_card_cache` (`packages/database/src/schema/progress.ts:199`), not a standalone table. Celebration names: `polar_star | twin_stars | comet | orions_belt`. Celebration reasons: 12-value enum including `topic_mastered`, `streak_7`, `streak_30`, etc.

`milestones` table (`packages/database/src/schema/snapshots.ts`) has `celebratedAt` timestamp — `NULL` means uncelebrated, non-null means shown. Milestone types: `vocabulary_count | topic_mastered_count | session_count | streak_length | subject_mastered | book_completed | learning_time | cefr_level_up | topics_explored`. Note: `cefr_level_up` is defined in the schema enum but `detectMilestones()` never generates it — dead code path.

**Decision:** add a lightweight append-only celebration event history rather than counting from `pendingCelebrations` or milestones alone. Reports need only total celebrations per day/week/month in v1, but the stored event should retain `celebrationType`, `reason`, source identity, and metadata so later surfaces can explain why celebrations happened.

Do not count from `coaching_card_cache.pendingCelebrations` as historical truth. It is an opaque queue, not durable history, and entries may be cleared after viewing. Do not rely on `milestones` alone because that misses coaching-card celebrations.

## Context for Development

### Codebase Patterns

- Business logic belongs in `apps/api/src/services/`; routes call service functions and must not import Drizzle primitives or table symbols.
- Reads over single profile-scoped tables should use `createScopedRepository(profileId)` where practical. All three primary tables (`quiz_rounds`, `dictation_results`, `assessments`) are registered in `packages/database/src/repository.ts`. Multi-table joins can use direct Drizzle queries when the profile scope is enforced through the owning ancestor.
- Shared API-facing response shapes belong in `@eduagent/schemas`; do not redefine shared contracts locally.
- The existing `reportPracticeSummarySchema` shape (`quizzesCompleted`, `reviewsCompleted`) is too narrow — it must expand to support consolidated totals, by-type breakdowns, by-subject breakdowns, points, score fields, distinct activity types, and optional celebration counts.
- WeeklyReportCard already renders practice summary tiles when `practiceSummary` is present (but it has never been present in production). The `thisWeekMini` fallback path has no practice tiles — only sessions, words learned, and topics touched.
- MonthlyReportCard has zero practice/testing rendering. New JSX required.

### Data Source Inventory

| Source | Table | Completion Signal | Period Filter Column | Profile Scoping | Notes |
| --- | --- | --- | --- | --- | --- |
| Practice ledger | `practice_activity_events` | one row per completed practice/testing event | `completedAt` | `profileId` | New canonical source for summaries. Stores type/subtype, points, score fields, source IDs, optional subject, and metadata. |
| Celebration ledger | `celebration_events` | one row per earned/shown celebration | `celebratedAt` | `profileId` | New durable history for totals by day/week/month. Stores type, reason, source identity, and metadata. |
| Quizzes | `quiz_rounds` | `status = 'completed'` | `completedAt` | `profileId` (scoped repo) | Split by `activityType`. `xpEarned` on row. `languageCode` null for non-vocabulary. |
| Quiz errors | `quiz_missed_items` | linked to completed round via `sourceRoundId` | via parent round's `completedAt` | via parent round's `profileId` | `surfaced`, `convertedToTopic` flags |
| Quiz mastery | `quiz_mastery_items` | SM-2 state per (profile, activityType, itemKey) | `nextReviewAt` / `updatedAt` (no `lastReviewedAt` column) | `profileId` | Third SRS-like table. `mcSuccessCount`. SM-2 updates happen inside `completeQuizRound` transaction — not a standalone review flow. |
| Dictation | `dictation_results` | row existence | `createdAt` (no `completedAt`) | `profileId` (scoped repo) | `sentenceCount`, `mistakeCount` (nullable), `mode` (`homework`/`surprise`), `reviewed` boolean |
| Assessments | `assessments` | terminal status | `updatedAt` or `createdAt` | `profileId` (scoped repo) | Terminal: `passed`, `failed`, `borderline`, `failed_exhausted`. `verificationDepth`: `recall`/`explain`/`transfer`. `masteryScore` numeric(3,2). |
| Topic retention | `retention_cards` | `lastReviewedAt` (mutable, single) | `lastReviewedAt` | `profileId` | SM-2 state. Cannot count reviews per period — only "was card reviewed in period." |
| Vocabulary retention | `vocabulary_retention_cards` | `lastReviewedAt` (mutable, single) | `lastReviewedAt` | `profileId` (direct column, also reachable via `vocabulary.profileId` join) | Separate SRS pipeline. Per-word, not per-topic. No `xpStatus`. `reviewVocabulary` is called from `completeQuizRound` for vocabulary rounds — not always a standalone flow. |
| Fluency drills | `session_events` | `drillCorrect`/`drillTotal` not null | `createdAt` | via `learning_sessions.profileId` join | Populated from LLM envelope `ui_hints.fluency_drill.score`. |
| Recitation | `learning_sessions` | `metadata->>'effectiveMode' = 'recitation'` | `startedAt` / `endedAt` | `profileId` | Untyped JSONB key. Other modes: `learning`, `freeform`, `homework`, `practice`, `review`. |
| Milestones | `milestones` | `celebratedAt IS NOT NULL` | `celebratedAt` | `profileId` | `milestoneType` is free text, not DB enum. 9 known types. `cefr_level_up` is dead. |
| Celebrations | `coaching_card_cache.pendingCelebrations` | JSONB array entries | unclear — entries cleared after viewing | `profileId` | Opaque blob. Fragile for counting. |

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `packages/database/src/schema/quiz.ts` | `quiz_rounds` (activity type, status, score, total, XP, `completedAt`) and `quiz_missed_items` (per-item errors). |
| `packages/database/src/schema/quiz-mastery.ts` | `quiz_mastery_items` — SM-2 state per quiz question. |
| `packages/database/src/schema/dictation.ts` | `dictation_results` — completed dictation rows. No `completedAt`; use `createdAt`. |
| `packages/database/src/schema/assessments.ts` | `assessments` (terminal statuses: `passed`, `failed`, `borderline`, `failed_exhausted`), `retention_cards` (topic-level SRS), `needs_deepening_topics`. |
| `packages/database/src/schema/language.ts` | `vocabulary` and `vocabulary_retention_cards` — word-level SRS pipeline, separate from topic `retention_cards`. |
| `packages/database/src/schema/sessions.ts` | `learning_sessions` (`metadata.effectiveMode` for recitation), `session_events` (`drillCorrect`/`drillTotal` for fluency drills, 18 event types), `session_summaries`. |
| `packages/database/src/schema/progress.ts` | `xp_ledger` (topic/session XP only — quiz XP is NOT here), `streaks`, `coaching_card_cache` (opaque `pendingCelebrations` JSONB). |
| `packages/database/src/schema/snapshots.ts` | `weekly_reports` / `monthly_reports` (`reportData` JSONB), `milestones` (with `celebratedAt`), `progress_snapshots`. |
| `packages/schemas/src/snapshots.ts` | `reportPracticeSummarySchema` — currently only `quizzesCompleted` and `reviewsCompleted`. Needs expansion. |
| `apps/api/src/services/weekly-report.ts` | `generateWeeklyReportData()` — pure function, snapshot-driven. **Does not set `practiceSummary`.** Read path `getWeeklyReportData()` passes through whatever is in JSONB (always `undefined`). |
| `apps/api/src/services/monthly-report.ts` | `generateMonthlyReportData()` — same pattern. **Does not set `practiceSummary`.** MonthlyReportCard never reads it either. |
| `apps/api/src/services/snapshot-aggregation.ts` | `loadProgressState()` reads sessions, assessments, retention cards, vocabulary — **NOT** `quiz_rounds` or `dictation_results`. Practice data cannot be derived from snapshots. |
| `apps/api/src/services/quiz/queries.ts` | `computeRoundStats()` — all-time quiz stats per activity type. Not time-windowed. Not called by any report generator. |
| `apps/api/src/inngest/functions/weekly-progress-push.ts` | Calls `generateWeeklyReportData()`, inserts result. Must be modified to call the new service and inject `practiceSummary`. |
| `apps/api/src/inngest/functions/monthly-report-cron.ts` | Same pattern for monthly. Must be modified similarly. |
| `apps/api/src/services/retention-data.ts` | Recall review overwrites `lastReviewedAt` in place. No append-only review log. |
| `apps/api/src/services/progress.ts` | `getOverallProgress()` returns topic counts + retention status. No quiz/dictation activity counts. |
| `apps/mobile/src/components/progress/WeeklyReportCard.tsx` | Renders practice tiles when `practiceSummary` present (lines 121-143). `thisWeekMini` fallback has NO practice tiles. |
| `apps/mobile/src/components/progress/MonthlyReportCard.tsx` | Renders `ReportBars` (sessions/time/topics) + highlights. **Zero** `practiceSummary` rendering — new JSX required. |
| `apps/mobile/src/app/(app)/quiz/history.tsx` | Quiz history screen exists. Dictation has NO equivalent history screen. |
| `apps/api/src/services/celebrations.ts` | `queueCelebration()` writes into `coaching_card_cache.pendingCelebrations` JSONB. |
| `apps/api/src/services/milestone-detection.ts` | `detectMilestones()` handles 8 of 9 milestone types. `cefr_level_up` is never detected (dead code). |

### Technical Decisions

- Add a separate testing/practice row to reports; do not replace existing learning metrics.
- Use `practice_activity_events` as the canonical source for report/library summaries once introduced. Existing source tables remain responsible for operational writes and should emit ledger events at completion time.
- Use `celebration_events` as the canonical source for celebration totals. Reports only need `celebrations.total` in v1, but event details should be stored for future breakdowns.
- Treat quiz completion as exact from `quiz_rounds.status = 'completed'` and `completedAt`.
- Treat dictation completion as exact from `dictation_results.createdAt` (no `completedAt` column exists).
- Treat assessment completion as terminal assessment rows (`passed`, `failed`, `borderline`, `failed_exhausted`). Determine which terminal states count as "completed" for the summary.
- "Prove I know this" is UI copy for `teach_back` / `evaluate` verification type (`learning_sessions.verificationType`), not a schema entity. Query by verification type, not by UI label.
- Store normalized practice/testing points on the ledger event (`pointsEarned`) so summaries do not join quiz XP and topic XP stores. Note: quiz XP (`quiz_rounds.xpEarned`) is calculated and stored on the round row, but NO `xp_ledger` entry is ever created for it (complete-round.ts has no `insertSessionXpEntry` call). The practice event's `pointsEarned` will be the only aggregatable record of quiz XP beyond the per-round column.
- Treat review counts as exact only for ledger-emitted review events. Do not derive review counts from `retention_cards.lastReviewedAt` or `vocabularyRetentionCards.lastReviewedAt`.
- Treat celebration counts as exact only from `celebration_events` after rollout. Do not count from `pendingCelebrations` as durable history.
- `metadata.effectiveMode` is untyped JSONB. Known values: `learning`, `freeform`, `homework`, `recitation`, `practice`, `review`. Decide which modes count as "practice activity."

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| Profile has zero practice activity in period | New user, or user only does learning sessions | Report renders with practice row absent or showing zeros | Conditionally hide practice row when all counts are zero. Do not show empty tiles. |
| Aggregation query times out | Profile with thousands of practice events over a wide period | Report generation Inngest step fails/retries | Add/index-check `practice_activity_events(profileId, completedAt)` and type/subject variants. Consider aggregation cap or pagination. |
| Concurrent quiz completion during report window | Quiz completes after aggregation query but before row insertion | Off-by-one in practice count — report shows one fewer | Acceptable. Document that reports capture a point-in-time snapshot, not a guaranteed exact count. |
| Old reports have `practiceSummary: undefined`, new reports have it populated | Gradual rollout as weekly/monthly crons fire | Scrolling through past reports shows practice tiles appearing/disappearing | WeeklyReportCard already gates on `practiceSummary` presence. MonthlyReportCard must also gate. No backfill needed — old reports stay as-is. |
| `effectiveMode` JSONB key missing or has unexpected value | Bug in session creation, or new mode added later | Recitation/practice sessions undercounted | Query with explicit `IN (...)` clause for known modes. Emit a structured Inngest event (e.g. `app/unknown-effective-mode`) for unknown values so the count is queryable, not just logged. |
| `dictation_results.mistakeCount` is NULL | Dictation completed but mistakes not counted (legacy rows?) | Summary shows dictation count but no accuracy metric | Handle nullable `mistakeCount` — show count without accuracy, or show "—" for accuracy. |
| `quiz_rounds.xpEarned` is NULL | Round completed before XP calculation was added | XP total undercounted | Treat NULL as 0 in SUM aggregation (`COALESCE`). |
| Schema expansion breaks existing report consumers | `reportPracticeSummarySchema` fields added, old mobile clients receive unknown keys | Old clients ignore unknown keys (Zod `.passthrough()` or `.strip()`) | Verify Zod parse mode in mobile report consumption. New fields must be `.optional()` for backwards compatibility. |
| Ledger event written but source write fails (or vice versa) | Non-atomic emission in dictation or recall paths | Ledger diverges from source of truth — activity counted that never completed, or completed activity not counted | Wrap source write + ledger insert in a single `db.transaction()`. See Phase 3 notes. |
| Summary service called with parent profileId instead of child's | Report cron passes wrong profile identifier | Report shows zero practice activity despite child having activity | Summary service aggregates by learner's profileId. Crons must pass `childProfileId`, not `parentId`. See Phase 4/5 notes. |
| First report cycle after deploy shows zeros | Emitters deployed but no historical events in ledger yet | User did 50 quizzes this week, report says 0 | Run Phase 7 backfill for quizzes/dictations/assessments (exact sources) before or alongside Phase 5 go-live. |

## Implementation Plan

### Implementation Phases

#### Phase 0 — Lock v1 semantics

Use these v1 assumptions unless product explicitly changes them before build:

- Activity types: `quiz`, `review`, `assessment`, `dictation`, `recitation`, `fluency_drill`.
- Quiz subtypes: `capitals`, `guess_who`, `vocabulary`. Vocabulary events carry `languageCode` in metadata; v1 reports can aggregate vocabulary flat while preserving language detail in the payload.
- Review subtypes: `topic_recall` only in v1. `vocabulary_srs` and `quiz_mastery` are internal SM-2 updates inside `completeQuizRound` — they are NOT standalone user actions and do NOT emit separate review events (see Decision — Review Counts). If a standalone vocabulary review screen or standalone mastery review screen is added later, those paths would emit `review` events at that point.
- Assessment completion: count all terminal statuses (`passed`, `failed`, `borderline`, `failed_exhausted`) as completed attempts. Store status and depth in metadata so the UI can separate "passed" later.
- Recitation completion: count only explicit `effectiveMode = 'recitation'` in v1. Do not count vague `practice` / `review` session modes until those modes have clearer completion semantics.
- Celebration completion: record durable events in `celebration_events`; report UI uses only total count in v1.
- Historical behavior: no exact review or coaching-card celebration backfill. Optional backfill may cover only source rows with trustworthy completion timestamps (`quiz_rounds`, `dictation_results`, terminal `assessments`).

**DedupeKey patterns (must be deterministic under retry, distinct across real attempts):**

| Source | DedupeKey pattern | Rationale |
| --- | --- | --- |
| Quiz round | `quiz:${roundId}` | One round = one event. Round ID is unique. |
| Dictation result | `dictation:${dictationResultId}` | One result row = one event. Row ID is unique. |
| Assessment terminal | `assessment:${assessmentId}` | One assessment reaches terminal state once. |
| Topic recall review | `topic_recall:${retentionCardId}:${repetitions}` | SM-2 `repetitions` increments on each review — deterministic counter. Same (cardId, repetitions) pair means same review attempt under retry. |
| Fluency drill | `fluency_drill:${sessionEventId}` | One session_event row = one drill score. |
| Recitation session | `recitation:${sessionId}` | One session = one event. |
| Celebration | `celebration:${celebrationType}:${reason}:${detail ?? 'none'}` | Matches existing `queueCelebration` dedup tuple. |

For review events on `retention_cards`: the `repetitions` field (integer, NOT NULL, default 0) increments with each successful review via SM-2 update. Using it in the dedupeKey ensures that retries of the same review attempt produce the same key (the counter hasn't been incremented yet), while a new review of the same card produces a different key (counter has advanced). If the review fails to update (CAS miss on cooldown guard), no event should be emitted — check update row count before emitting.

#### Phase 1 — Database schema and contracts

Add the durable storage and shared response contracts first, before wiring emitters.

- Add `practice_activity_events` in the database schema package.
  - Suggested columns: `id`, `profileId`, nullable `subjectId`, `activityType`, nullable `activitySubtype`, `completedAt`, `pointsEarned`, nullable `score`, nullable `total`, `sourceType`, `sourceId`, `dedupeKey`, `metadata`, `createdAt`.
  - Add a unique key on `(profileId, dedupeKey)` for retry-safe inserts.
  - Add indexes on `(profileId, completedAt)`, `(profileId, activityType, completedAt)`, and `(profileId, subjectId, completedAt)`.
- Add `celebration_events`.
  - Suggested columns: `id`, `profileId`, `celebratedAt`, `celebrationType`, `reason`, nullable `sourceType`, nullable `sourceId`, `dedupeKey`, `metadata`, `createdAt`.
  - Add a unique key on `(profileId, dedupeKey)`.
  - Add an index on `(profileId, celebratedAt)`.
- Register both new tables in `packages/database/src/repository.ts` for scoped repository access. This prevents accidental unscoped reads and follows the pattern used by all other profile-owned tables (quiz_rounds, dictation_results, assessments are all registered). Note: `milestones` and `coachingCardCache` are NOT currently in the scoped repo — celebration event emission paths that read these tables must use direct `db.select()` with explicit `profileId` WHERE clauses.
- Expand `packages/schemas/src/snapshots.ts`.
  - Replace the narrow `quizzesCompleted` / `reviewsCompleted` shape with a backwards-compatible richer object.
  - Keep new fields optional so old report JSONB remains parseable.
- Add/extend progress response schemas if the library/progress endpoint needs to expose activity count separately from report JSONB.

#### Phase 2 — Event writer services

Add small service helpers so source paths do not hand-roll ledger inserts.

- Create `apps/api/src/services/practice-activity-events.ts`.
  - Export `recordPracticeActivityEvent(db, input)`.
  - Caller must provide a pre-built `dedupeKey` following the patterns in Phase 0's dedupeKey table. The helper should NOT auto-generate keys — callers know the deterministic identity of their source event.
  - Use insert-on-conflict-ignore (`ON CONFLICT (profileId, dedupeKey) DO NOTHING`) so retries do not double-count.
  - Keep the helper profile-scoped and explicit about source identity.
- Create `apps/api/src/services/celebration-events.ts`.
  - Export `recordCelebrationEvent(db, input)`.
  - Use the same idempotency pattern (`ON CONFLICT (profileId, dedupeKey) DO NOTHING`).
  - Allow source identity to point to either milestone rows or coaching-card celebration reasons.
  - The dedupeKey must derive from the same `(celebrationType, reason, detail)` tuple that `queueCelebration` (celebrations.ts:75) uses for its JSONB dedup. This keeps the two systems — durable history (`celebration_events`) and transient display queue (`pendingCelebrations`) — consistent on what constitutes "the same celebration." Emit the durable event BEFORE the `queueCelebration` dedup check, so the history captures the attempt even if the display queue deduplicates it away.

#### Phase 3 — Emit events from completion paths

Wire emitters into the places where completion already happens. The ledger insert must be atomic with the source write — wrap both in a single `db.transaction()` where the source path does not already use one.

- Quiz completion: `apps/api/src/services/quiz/complete-round.ts`
  - Emit ONE `quiz` event per completed round, inside the existing transaction (line 293).
  - Use subtype from `activityType`; include `languageCode`, `score`, `total`, and `xpEarned` as `pointsEarned`. DedupeKey: `quiz:${roundId}`.
  - Do NOT emit separate `review` events for vocabulary SRS updates or quiz mastery SM-2 updates that happen inside this transaction (lines 358-519). These are internal side effects of quiz completion, not standalone review flows. One quiz = one event.
- Dictation completion: `apps/api/src/services/dictation/result.ts`
  - `recordDictationResult` is currently a bare `insert()` with no transaction (line 27). Wrap the source insert + ledger insert in a new `db.transaction()` to ensure atomicity.
  - Emit `dictation` events when a result row is created. DedupeKey: `dictation:${newRowId}`.
  - Include sentence count, mistake count, and mode in metadata.
- Assessment completion: assessment completion route/service path
  - Emit `assessment` events when status transitions into a terminal status. DedupeKey: `assessment:${assessmentId}`.
  - Include terminal status, verification depth, mastery score, and topic/subject context when available.
- Topic recall reviews: `apps/api/src/services/retention-data.ts`
  - `processRecallTest` uses atomic CAS via WHERE clause (line 679), not a transaction. Wrap the source update + ledger insert in a `db.transaction()`.
  - Emit `review` / `topic_recall` events from the recall-test completion path. DedupeKey: `topic_recall:${retentionCardId}:${repetitions_before_update}`. Read the card's current `repetitions` before updating, and use that value in the key.
  - Only emit if the CAS update actually modified a row (check `rowsAffected > 0`). If the cooldown guard rejects the update, no event.
  - Do not emit for due-card calculations or card reads.
- Vocabulary reviews: `apps/api/src/services/vocabulary.ts`
  - `reviewVocabulary` is called from `completeQuizRound` for vocabulary rounds (complete-round.ts:358-379). In that context, the quiz event already covers this activity — do NOT emit a review event.
  - Add a `callerContext?: 'quiz' | 'standalone'` parameter (or similar guard). Only emit `review` / `vocabulary_srs` events when `callerContext !== 'quiz'`. This future-proofs for a standalone vocabulary review screen.
  - `completeQuizRound` passes `callerContext: 'quiz'`; any future standalone review screen passes `callerContext: 'standalone'` or omits it.
- Fluency drills: session event persistence path
  - Emit `fluency_drill` events when `drillCorrect` and `drillTotal` are persisted. DedupeKey: `fluency_drill:${sessionEventId}`.
  - Include correct/total as score fields.
- Recitation: session completion path
  - Emit `recitation` events for sessions whose effective mode is `recitation`. DedupeKey: `recitation:${sessionId}`.
  - Include session id, duration if available, and subject/topic metadata if available.
  - Emit a structured Inngest event for unknown `effectiveMode` values encountered during emission (see Failure Modes table).
- Celebrations:
  - In `apps/api/src/services/celebrations.ts`, emit `celebration_events` BEFORE the `queueCelebration()` dedup check against the JSONB array. The durable event captures the attempt; the display queue may deduplicate it. DedupeKey: `celebration:${celebrationType}:${reason}:${detail ?? 'none'}`.
  - In milestone storage/detection paths, attach milestone source identity when available.

#### Phase 4 — Summary service

Build `apps/api/src/services/practice-activity-summary.ts` as the single read model for reports and library/progress.

- Inputs:
  - `profileId` — the **learner's** profileId (the child who did the activity). Note: `weekly_reports` and `monthly_reports` store `profileId` (parent/guardian) and `childProfileId` (learner) as separate columns. Report crons must pass `childProfileId`, not the parent's `profileId`, when calling this service.
  - current period start/end
  - optional prior period start/end for comparisons
  - optional grouping flags if needed later
- Output:
  - `totals`: completed activities, completed reviews, points, celebrations, distinct activity types.
  - `scores`: scored activity count, correct/score sum, total sum, accuracy where meaningful.
  - `byType`: count, points, score totals, and subtype details for each activity type.
  - `bySubject`: count, points, and nested type totals for subject-linked events.
  - `comparisons`: same summary totals for previous week/month and simple deltas.
- Query strategy:
  - Aggregate from `practice_activity_events` by profile and period.
  - Aggregate celebration totals from `celebration_events` by profile and period.
  - Join subject names only if the reporting surface needs display names; otherwise return ids and let existing surfaces resolve names.
  - Keep empty-period output stable with zeros and empty arrays.

#### Phase 5 — Backend consumers

Wire existing consumers to the shared service without changing their existing learning metrics.

- Weekly reports:
  - Update `apps/api/src/inngest/functions/weekly-progress-push.ts` to call the summary service for the week and previous week.
  - Pass `link.childProfileId` (not `parentId`) to the summary service — practice events are stored under the learner's profile. The cron iterates family links at line 350; `link.childProfileId` is already available.
  - Inject `practiceSummary` into the generated report data before inserting `weekly_reports`.
  - Keep `generateWeeklyReportData()` pure if practical by passing `practiceSummary` in as an optional input.
- Monthly reports:
  - Update `apps/api/src/inngest/functions/monthly-report-cron.ts` similarly for current and previous month.
  - Same rule: pass `childId` (available at line 256) to the summary service, not `parentId`.
  - Keep existing sessions/time/topics values unchanged.
- Library/progress:
  - Update `apps/api/src/services/progress.ts` and the associated route/schema to expose the needed activity count/breakdown from the summary service.
  - Keep topic-count and retention behavior unchanged.

#### Phase 6 — Mobile report UI

Render the new summary as an additive tests/practice row.

- Weekly:
  - Update `apps/mobile/src/components/progress/WeeklyReportCard.tsx`.
  - Replace the current two-tile practice assumption with the richer schema.
  - Preserve the existing sessions/time/topics presentation.
- Monthly:
  - Update `apps/mobile/src/components/progress/MonthlyReportCard.tsx`.
  - Add the same tests/practice row/block pattern.
  - Gate rendering on `practiceSummary` presence and non-zero activity.
  - Pre-existing gap: MonthlyReportCard's error state (line 138) has no retry button and no testID, unlike WeeklyReportCard which has both (`testID="weekly-report-error"`, `testID="weekly-report-retry"`). Add error retry + testIDs matching weekly's pattern while touching this component.
- Backwards compatibility:
  - Old reports with no `practiceSummary` render exactly as they do today.
  - New fields should not make older cached report data crash.

#### Phase 7 — Optional historical backfill

**Timing decision:** if Phase 7 is deferred, the first weekly/monthly report cycle after Phase 5 deploys will show `practiceSummary` with zeros (or near-zeros) even for active learners — because no historical events exist in the ledger, only events emitted after Phase 3 went live. For quizzes, dictations, and terminal assessments, backfill from source tables is exact and safe. **Recommend running backfill for these three sources before or alongside Phase 5 go-live** to avoid a confusing first-report experience. Treat review and celebration backfill as a separate, explicitly scoped follow-up.

- Safe to backfill:
  - Completed quiz rounds from `quiz_rounds.completedAt`.
  - Dictation results from `dictation_results.createdAt`.
  - Terminal assessments from terminal status timestamps.
- Not safe to backfill exactly:
  - Topic review counts from `retention_cards.lastReviewedAt`.
  - Vocabulary review counts from `vocabulary_retention_cards.lastReviewedAt`.
  - Coaching-card celebration counts from `pendingCelebrations`.
- If backfill happens, use the same event writer helpers and dedupe keys.

#### Phase 8 — Validation

Validate in layers so failures point to the right part of the system.

- Schema and service tests:
  - Event writer idempotency.
  - Empty periods, single event periods, mixed activity periods.
  - By-type and by-subject aggregation.
  - Prior-period comparison and zero baseline behavior.
  - Celebration totals from `celebration_events`.
- Integration tests:
  - Profile scoping: profile A cannot see profile B events.
  - Report generation inserts `practiceSummary` into weekly/monthly JSONB.
  - Completion paths emit one event and only one event under retry.
- Mobile tests:
  - Weekly report renders tests row for populated summary.
  - Monthly report renders tests row for populated summary.
  - Old report payloads without `practiceSummary` still render.
- Repo validation:
  - API tests for touched services.
  - API typecheck.
  - Mobile tests for touched report components.
  - Migration generation checked into the repo.

### Acceptance Criteria

- Weekly and monthly reports continue showing the existing learning metrics (`sessions`, `time`, `topics`) unchanged.
- Weekly and monthly reports show an additional tests/practice row when `practiceSummary` has activity.
- The summary exposes consolidated counts, total points, score aggregates where available, distinct activity type count, by-type breakdown, and by-subject breakdown.
- Celebration totals are counted from `celebration_events` and exposed as a simple total for the report period.
- Review counts include completed review attempts from ledger events only. In v1, only `topic_recall` emits standalone review events. Vocabulary SRS and quiz mastery SM-2 updates inside quiz completion are counted as part of the quiz event, not as separate reviews. Due-card counts and mutable `lastReviewedAt` proxies are not counted as completed reviews.
- Quiz counts are split by `capitals`, `guess_who`, and `vocabulary`, with vocabulary carrying language metadata.
- Library/progress can read the needed activity count from the shared summary logic rather than duplicating queries.
- Week-over-week and month-over-month comparisons are computed from the same service.
- Ledger writes are idempotent under retries.
- One profile cannot see another profile's activity.
- Old report JSONB without `practiceSummary` remains valid and renders without errors.

## Additional Context

### Dependencies

- **Schema expansion required:** add the `practice_activity_events` and `celebration_events` tables, and expand `reportPracticeSummarySchema` beyond `quizzesCompleted` / `reviewsCompleted` to cover consolidated totals, by-type breakdowns, by-subject breakdowns, dictation, assessments, drills, points, scores, distinct activity types, and celebration total.
- **Review counts:** require ledger emission from standalone review flows only — `topic_recall` (via `processRecallTest`) in v1. Vocabulary SRS and quiz mastery updates inside `completeQuizRound` are internal side effects that do NOT emit separate review events. Future standalone review screens should emit review events via a `callerContext` guard on `reviewVocabulary`. Do not backfill exact historical review counts from mutable card state.
- **Celebration counting:** require `celebration_events` emission from milestone and coaching-card celebration paths. Reports expose total count only in v1.
- **Index evaluation:** add/check `practice_activity_events(profileId, completedAt)`, likely `practice_activity_events(profileId, activityType, completedAt)` / `practice_activity_events(profileId, subjectId, completedAt)`, and `celebration_events(profileId, celebratedAt)`. Existing source-table indices still matter for optional historical backfill.

### Testing Strategy

Must include:

- Integration tests with real DB (per CLAUDE.md — no internal mocks).
- Break tests for profileId scoping — verify one profile cannot see another's practice data.
- Edge cases: empty periods, single-item periods, periods spanning DST transitions.
- Verify `practiceSummary` populates correctly in weekly and monthly report JSONB.
- Verify WeeklyReportCard renders practice tiles when populated.
- Verify MonthlyReportCard renders new practice row when populated.
- Verify backwards compatibility — old reports without `practiceSummary` still render correctly.

### Notes

- This service builds from zero, not extends existing infrastructure. The schema slot and read-path pass-through exist, but the practice ledger, celebration ledger, event emission, aggregation, and report injection layers are completely absent.
- The `progress_snapshots` pipeline does not include quiz or dictation data. The new ledger avoids making every report/library surface understand all source tables independently.
- The current mobile monthly report has sessions/time/topics bars only. The requested change is additive: a second tests row/block. MonthlyReportCard requires new JSX.
- Dictation has no history screen (`quiz/history.tsx` exists, no dictation equivalent). Any future "view details" link from the practice summary for dictation would need a new screen.
