---
title: 'Practice Activity Summary Service'
slug: 'practice-activity-summary-service'
created: '2026-05-12'
status: 'in-progress'
stepsCompleted: [1]
tech_stack: ['TypeScript', 'Hono', 'Drizzle ORM', 'PostgreSQL', 'React Native', 'Expo']
files_to_modify: []
code_patterns: []
test_patterns: []
---

# Tech-Spec: Practice Activity Summary Service

**Created:** 2026-05-12

## Overview

### Problem Statement

Reporting and library surfaces need a shared, reliable way to summarize learner activity under the Practice / testing hub. Today, the data is spread across multiple persistence models: quiz rounds, dictation results, assessments, retention cards (topic-level and vocabulary-level), recitation sessions, fluency drill scores, session metadata milestones, pending celebrations, and report JSONB. Weekly and monthly reports already have an optional `practiceSummary` schema field, but **no code path ever populates it** — both `generateWeeklyReportData` and `generateMonthlyReportData` return objects without this field, and every report row in production has `practiceSummary = undefined`. The current schema shape (`reportPracticeSummarySchema`) only covers `quizzesCompleted` and `reviewsCompleted`, and the latter cannot be computed from existing data (see Decision Gate below).

The target is a reusable backend building block that can aggregate practice activity for a time period, compare it week over week and month over month, and feed reports plus the library/progress activity count without each surface inventing its own query logic.

### Solution

Add a canonical append-only practice activity ledger, likely `practice_activity_events`, plus a shared API service, likely `apps/api/src/services/practice-activity-summary.ts`, that computes period-bounded testing/practice activity summaries from that ledger. Wire the service into weekly report generation, monthly report generation, and the progress/library endpoint that needs an activity count.

The ledger should be the source of truth for new practice/test counts, points, scores, and review attempts. Existing tables (`quiz_rounds`, `dictation_results`, `assessments`, `retention_cards`, `vocabulary_retention_cards`, `learning_sessions`, `session_events`) remain the operational sources where completion happens, but summary surfaces should not each query them independently. New completion paths emit one ledger event at the moment an activity completes; historical data before the ledger cannot be made exact for review counts.

Weekly and monthly report visuals must keep their existing learning metrics row (`sessions`, `time`, `topics`) intact. Testing/practice metrics are additive: render a separate row/block for tests rather than replacing the current learning row.

### Scope

**In Scope:**

- Add a canonical append-only ledger for completed practice/testing activity. Minimum shape: `profileId`, optional `subjectId`, `activityType`, optional subtype, `completedAt`, `pointsEarned`, score fields (`score`, `total`, or equivalent), source identifiers, and metadata needed for language/activity detail.
- Emit ledger events from completed quizzes (`quiz_rounds`), completed assessments, completed dictations, completed review attempts, completed recitation activity, and fluency drill score events.
- Aggregate completed quizzes from ledger events emitted when `quiz_rounds.status = 'completed'`, split by `capitals`, `guess_who`, and `vocabulary`. Vocabulary rounds must be language-aware (`languageCode` is NULL for capitals/guess_who, non-null for vocabulary — decide whether to group by language or aggregate flat).
- Aggregate completed assessments from ledger events emitted for terminal `assessments` rows. Terminal statuses are: `passed`, `failed`, `borderline`, `failed_exhausted`. Decide which terminal states count as "completed" for the summary (all four? only `passed`?).
- Aggregate completed dictations from ledger events emitted when a `dictation_results` row is created. Completion proxy today is `createdAt` (no `completedAt` column exists). Calendar date is stored in `date` column.
- Aggregate normalized practice/testing points from `practice_activity_events.pointsEarned`. Quiz XP (`quiz_rounds.xpEarned`) and topic XP (`xp_ledger`) are disconnected today; the summary should not have to join multiple XP stores after ledger adoption.
- Aggregate `quiz_missed_items` per activity type — items the learner got wrong, with `surfaced` and `convertedToTopic` flags. This is the pedagogically useful error-rate signal.
- Aggregate fluency drill scores from ledger events emitted when `session_events.drillCorrect` and `session_events.drillTotal` are populated (integer columns, populated from LLM envelope `ui_hints.fluency_drill.score` during sessions).
- Count recitation activity from ledger events emitted for `learning_sessions.metadata->>'effectiveMode' = 'recitation'`. Note: `effectiveMode` is an untyped JSONB key (not a DB enum), with known values: `learning`, `freeform`, `homework`, `recitation`, `practice`, `review`. Decide whether `practice` and `review` mode sessions should also emit practice activity events.
- Provide consolidated period totals: total completed tests/reviews, total practice/testing points, score totals/accuracy where available, and celebration count if the celebration decision is resolved.
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
- Faking exact historical review counts from mutable SRS state (`lastReviewedAt`, `repetitions`) for periods before the ledger exists.
- Adding quiz/dictation data to the `progress_snapshots` pipeline (evaluate separately).
- Building a dictation history screen (none exists today — any summary linking to "view dictation history" would hit a dead end).

### Decision — Review Counts

`retention_cards.lastReviewedAt` is a single mutable timestamp overwritten on every review. `repetitions` is a cumulative SM-2 state counter, not a per-period count. **There is no append-only review event log.** You cannot answer "how many reviews happened in week W" from current data.

Additionally, `vocabularyRetentionCards` (`packages/database/src/schema/language.ts`) is an entirely separate SRS pipeline — per-vocabulary-item, with its own SM-2 fields (`easeFactor`, `intervalDays`, `repetitions`, `lastReviewedAt`, `nextReviewAt`, `failureCount`, `consecutiveSuccesses`). The spec must account for both card types or explicitly exclude vocabulary reviews.

**Decision:** use the broader `practice_activity_events` ledger rather than a review-only table. Review counts mean completed spaced-review attempts, not due cards and not "cards whose mutable `lastReviewedAt` currently falls inside the period." Topic recall reviews, vocabulary SRS reviews, and quiz mastery reviews should emit review ledger events when the user completes an attempt.

Historical review counts before the ledger exists are not exact and should not be backfilled from mutable SRS fields. Reports created before the ledger rollout can remain without review activity, or only include activity types with trustworthy historical completion rows if a later backfill is intentionally scoped.

### Decision Gate — Celebration Counting

Celebrations are persisted as an opaque JSONB array (`pendingCelebrations`) inside `coaching_card_cache` (`packages/database/src/schema/progress.ts:199`), not a standalone table. Celebration names: `polar_star | twin_stars | comet | orions_belt`. Celebration reasons: 12-value enum including `topic_mastered`, `streak_7`, `streak_30`, etc.

`milestones` table (`packages/database/src/schema/snapshots.ts`) has `celebratedAt` timestamp — `NULL` means uncelebrated, non-null means shown. Milestone types: `vocabulary_count | topic_mastered_count | session_count | streak_length | subject_mastered | book_completed | learning_time | cefr_level_up | topics_explored`. Note: `cefr_level_up` is defined in the schema enum but `detectMilestones()` never generates it — dead code path.

**Options:**

1. **Count from `milestones` where `celebratedAt` is in the period** — cleanest, but only covers milestone-type celebrations (not coaching card celebrations).
2. **Count from `coaching_card_cache.pendingCelebrations` JSONB** — covers all celebration types but is fragile (opaque blob, items cleared after viewing).
3. **Defer celebration counting** — ship activity counts first, add celebrations later.

**This decision must be made before implementation begins.**

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
| Quizzes | `quiz_rounds` | `status = 'completed'` | `completedAt` | `profileId` (scoped repo) | Split by `activityType`. `xpEarned` on row. `languageCode` null for non-vocabulary. |
| Quiz errors | `quiz_missed_items` | linked to completed round via `sourceRoundId` | via parent round's `completedAt` | via parent round's `profileId` | `surfaced`, `convertedToTopic` flags |
| Quiz mastery | `quiz_mastery_items` | SM-2 state per (profile, activityType, itemKey) | `lastReviewedAt` | `profileId` | Third SRS-like table. `mcSuccessCount`. |
| Dictation | `dictation_results` | row existence | `createdAt` (no `completedAt`) | `profileId` (scoped repo) | `sentenceCount`, `mistakeCount` (nullable), `mode` (`homework`/`surprise`), `reviewed` boolean |
| Assessments | `assessments` | terminal status | `updatedAt` or `createdAt` | `profileId` (scoped repo) | Terminal: `passed`, `failed`, `borderline`, `failed_exhausted`. `verificationDepth`: `recall`/`explain`/`transfer`. `masteryScore` numeric(3,2). |
| Topic retention | `retention_cards` | `lastReviewedAt` (mutable, single) | `lastReviewedAt` | `profileId` | SM-2 state. Cannot count reviews per period — only "was card reviewed in period." |
| Vocabulary retention | `vocabulary_retention_cards` | `lastReviewedAt` (mutable, single) | `lastReviewedAt` | via `vocabulary.profileId` join | Separate SRS pipeline. Per-word, not per-topic. No `xpStatus`. |
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
- Treat quiz completion as exact from `quiz_rounds.status = 'completed'` and `completedAt`.
- Treat dictation completion as exact from `dictation_results.createdAt` (no `completedAt` column exists).
- Treat assessment completion as terminal assessment rows (`passed`, `failed`, `borderline`, `failed_exhausted`). Determine which terminal states count as "completed" for the summary.
- "Prove I know this" is UI copy for `teach_back` / `evaluate` verification type (`learning_sessions.verificationType`), not a schema entity. Query by verification type, not by UI label.
- Store normalized practice/testing points on the ledger event (`pointsEarned`) so summaries do not join quiz XP and topic XP stores.
- Treat review counts as exact only for ledger-emitted review events. Do not derive review counts from `retention_cards.lastReviewedAt` or `vocabularyRetentionCards.lastReviewedAt`.
- Treat celebration counts as **blocked** until Decision Gate resolves.
- `metadata.effectiveMode` is untyped JSONB. Known values: `learning`, `freeform`, `homework`, `recitation`, `practice`, `review`. Decide which modes count as "practice activity."

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| Profile has zero practice activity in period | New user, or user only does learning sessions | Report renders with practice row absent or showing zeros | Conditionally hide practice row when all counts are zero. Do not show empty tiles. |
| Aggregation query times out | Profile with thousands of practice events over a wide period | Report generation Inngest step fails/retries | Add/index-check `practice_activity_events(profileId, completedAt)` and type/subject variants. Consider aggregation cap or pagination. |
| Concurrent quiz completion during report window | Quiz completes after aggregation query but before row insertion | Off-by-one in practice count — report shows one fewer | Acceptable. Document that reports capture a point-in-time snapshot, not a guaranteed exact count. |
| Old reports have `practiceSummary: undefined`, new reports have it populated | Gradual rollout as weekly/monthly crons fire | Scrolling through past reports shows practice tiles appearing/disappearing | WeeklyReportCard already gates on `practiceSummary` presence. MonthlyReportCard must also gate. No backfill needed — old reports stay as-is. |
| `effectiveMode` JSONB key missing or has unexpected value | Bug in session creation, or new mode added later | Recitation/practice sessions undercounted | Query with explicit `IN (...)` clause for known modes. Log unknown modes for monitoring. |
| `dictation_results.mistakeCount` is NULL | Dictation completed but mistakes not counted (legacy rows?) | Summary shows dictation count but no accuracy metric | Handle nullable `mistakeCount` — show count without accuracy, or show "—" for accuracy. |
| `quiz_rounds.xpEarned` is NULL | Round completed before XP calculation was added | XP total undercounted | Treat NULL as 0 in SUM aggregation (`COALESCE`). |
| Schema expansion breaks existing report consumers | `reportPracticeSummarySchema` fields added, old mobile clients receive unknown keys | Old clients ignore unknown keys (Zod `.passthrough()` or `.strip()`) | Verify Zod parse mode in mobile report consumption. New fields must be `.optional()` for backwards compatibility. |

## Implementation Plan

### Tasks

1. Finalize semantics before coding:
   - Activity types: `quiz`, `review`, `assessment`, `dictation`, `recitation`, `fluency_drill`.
   - Quiz subtypes: `capitals`, `guess_who`, `vocabulary` with language metadata for vocabulary.
   - Review subtypes: topic recall, vocabulary SRS, quiz mastery.
   - Assessment completion: count all terminal statuses as completed unless product wants pass-only language.
   - Celebration count: choose milestone-only, new ledger-backed celebration events, or defer.
2. Add database schema and migration:
   - Create `practice_activity_events` with `profileId`, optional `subjectId`, `activityType`, optional subtype, `completedAt`, `pointsEarned`, score fields, source identifiers, and metadata JSONB.
   - Add indexes for profile/period, profile/type/period, and profile/subject/period.
   - Add repository registration if needed for scoped reads/writes.
3. Add shared event-recording helper:
   - Create a small service API such as `recordPracticeActivityEvent(...)`.
   - Make writes idempotent by source identity (`sourceTable` + `sourceId` + activity/subtype) so retries do not double-count.
4. Emit ledger events from completion paths:
   - Quiz round completion.
   - Assessment terminal completion.
   - Dictation result creation.
   - Topic recall review completion.
   - Vocabulary SRS review completion.
   - Quiz mastery review completion.
   - Recitation/practice session completion if completion is reliably recorded.
   - Fluency drill scoring when drill score is persisted.
5. Build `apps/api/src/services/practice-activity-summary.ts`:
   - Query ledger rows by `profileId` and period.
   - Return consolidated totals, by-type totals, by-subject totals, distinct activity type count, score/accuracy aggregates, and prior-period comparison.
   - Keep period logic reusable for week-over-week and month-over-month.
6. Expand shared schemas:
   - Update `reportPracticeSummarySchema`.
   - Add any progress/library response fields needed for the activity count.
   - Keep all new fields optional/backwards compatible for old report JSONB.
7. Wire backend consumers:
   - Inject `practiceSummary` into weekly report creation.
   - Inject `practiceSummary` into monthly report creation.
   - Add activity count/breakdown to the library/progress endpoint that needs it.
8. Wire mobile report rendering:
   - Keep existing sessions/time/topics row unchanged.
   - Add a separate tests/practice row/block to weekly and monthly report cards.
   - Keep old reports without `practiceSummary` rendering cleanly.
9. Decide historical behavior:
   - No exact review backfill.
   - Optional narrow backfill for trustworthy source rows only (`quiz_rounds`, `dictation_results`, terminal `assessments`) if product wants old reports/library counts to include pre-ledger activity.
10. Validate with focused tests and one broader API check:
   - Unit/service tests for aggregation shape.
   - Integration tests for DB scoping and idempotent ledger writes.
   - Report generation tests for weekly/monthly injection.
   - Mobile component tests for old/new report rendering.

### Acceptance Criteria

- Weekly and monthly reports continue showing the existing learning metrics (`sessions`, `time`, `topics`) unchanged.
- Weekly and monthly reports show an additional tests/practice row when `practiceSummary` has activity.
- The summary exposes consolidated counts, total points, score aggregates where available, distinct activity type count, by-type breakdown, and by-subject breakdown.
- Review counts include completed review attempts from ledger events only: topic recall, vocabulary SRS, and quiz mastery. Due-card counts and mutable `lastReviewedAt` proxies are not counted as completed reviews.
- Quiz counts are split by `capitals`, `guess_who`, and `vocabulary`, with vocabulary carrying language metadata.
- Library/progress can read the needed activity count from the shared summary logic rather than duplicating queries.
- Week-over-week and month-over-month comparisons are computed from the same service.
- Ledger writes are idempotent under retries.
- One profile cannot see another profile's activity.
- Old report JSONB without `practiceSummary` remains valid and renders without errors.

## Additional Context

### Dependencies

- **Schema expansion required:** add the `practice_activity_events` table and expand `reportPracticeSummarySchema` beyond `quizzesCompleted` / `reviewsCompleted` to cover consolidated totals, by-type breakdowns, by-subject breakdowns, dictation, assessments, drills, points, scores, distinct activity types, and any optional celebration fields.
- **Review counts:** require ledger emission from topic recall reviews, vocabulary SRS reviews, and quiz mastery review paths. Do not backfill exact historical review counts from mutable card state.
- **Decision Gate — Celebration Counting:** May require a product decision on counting semantics (milestones vs. coaching card celebrations vs. deferred).
- **Index evaluation:** add/check `practice_activity_events(profileId, completedAt)` and likely `practice_activity_events(profileId, activityType, completedAt)` / `practice_activity_events(profileId, subjectId, completedAt)`. Existing source-table indices still matter for optional historical backfill.

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

- This service builds from zero, not extends existing infrastructure. The schema slot and read-path pass-through exist, but the ledger, event emission, aggregation, and report injection layers are completely absent.
- The `progress_snapshots` pipeline does not include quiz or dictation data. The new ledger avoids making every report/library surface understand all source tables independently.
- The current mobile monthly report has sessions/time/topics bars only. The requested change is additive: a second tests row/block. MonthlyReportCard requires new JSX.
- Dictation has no history screen (`quiz/history.tsx` exists, no dictation equivalent). Any future "view details" link from the practice summary for dictation would need a new screen.
