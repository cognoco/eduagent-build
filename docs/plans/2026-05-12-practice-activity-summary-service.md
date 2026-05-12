---
title: 'Practice Activity Summary Service'
slug: 'practice-activity-summary-service'
created: '2026-05-12'
status: 'planned'
stepsCompleted: []
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
    'apps/api/src/services/dashboard.ts',
    'apps/api/src/services/assessments.ts',
    'apps/api/src/routes/assessments.ts',
    'apps/api/src/services/session/session-exchange.ts',
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
- Count recitation activity from ledger events emitted for `learning_sessions.metadata->>'effectiveMode' = 'recitation'`. Note: `effectiveMode` is an untyped JSONB key (not a DB enum), with known values: `learning`, `freeform`, `homework`, `recitation`, `practice`, `review`, `relearn`, `gap_fill`. Decide whether `practice`, `review`, `relearn`, and `gap_fill` mode sessions should also emit practice activity events. `relearn` sessions are created directly by `retention-data.ts` (bypassing `startSession`) and go through the `session-completed` Inngest path.
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

**Decision:** use the broader `practice_activity_events` ledger rather than a review-only table. Review counts mean completed spaced-review attempts, not due cards and not "cards whose mutable `lastReviewedAt` currently falls inside the period." Topic recall reviews, vocabulary SRS reviews, and quiz mastery reviews should emit review ledger events when the user completes an attempt.

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
| Quiz mastery | `quiz_mastery_items` | SM-2 state per (profile, activityType, itemKey) | `nextReviewAt` / `updatedAt` | `profileId` | Third SRS-like table. `mcSuccessCount`. No `lastReviewedAt` column — only `nextReviewAt` and `updatedAt`. |
| Dictation | `dictation_results` | row existence | `createdAt` (no `completedAt`) | `profileId` (scoped repo) | `sentenceCount`, `mistakeCount` (nullable), `mode` (`homework`/`surprise`), `reviewed` boolean |
| Assessments | `assessments` | terminal status | `updatedAt` or `createdAt` | `profileId` (scoped repo) | Terminal: `passed`, `failed`, `borderline`, `failed_exhausted`. `verificationDepth`: `recall`/`explain`/`transfer`. `masteryScore` numeric(3,2). |
| Topic retention | `retention_cards` | `lastReviewedAt` (mutable, single) | `lastReviewedAt` | `profileId` | SM-2 state. Cannot count reviews per period — only "was card reviewed in period." |
| Vocabulary retention | `vocabulary_retention_cards` | `lastReviewedAt` (mutable, single) | `lastReviewedAt` | via `vocabulary.profileId` join | Separate SRS pipeline. Per-word, not per-topic. No `xpStatus`. |
| Fluency drills | `session_events` | `drillCorrect`/`drillTotal` not null | `createdAt` | via `learning_sessions.profileId` join | Populated from LLM envelope `ui_hints.fluency_drill.score`. |
| Recitation | `learning_sessions` | `metadata->>'effectiveMode' = 'recitation'` | `startedAt` / `endedAt` | `profileId` | Untyped JSONB key. Other modes: `learning`, `freeform`, `homework`, `practice`, `review`, `relearn`, `gap_fill`. `relearn` sessions are created directly by `retention-data.ts` bypassing `startSession`. |
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
| `apps/api/src/services/milestone-detection.ts` | `detectMilestones()` handles 8 of 9 milestone types. `cefr_level_up` is never detected (dead in detection), but `snapshot-aggregation.ts:1106,1214` has `case 'cefr_level_up':` handling branches. |
| `apps/api/src/services/dashboard.ts` | Already computes weekly/monthly drill stats from `session_events.drillCorrect`/`drillTotal` (lines 1371–1397, 1505–1525). Overlaps with the new ledger-based fluency drill aggregation — must decide whether dashboard migrates to the ledger or continues reading `session_events` directly. |
| `apps/api/src/routes/assessments.ts` | Terminal-status logic (`newStatus` computation, lines 112–123) lives in the route handler, not in a service. Business logic must be extracted to `services/assessments.ts` before adding ledger emission. |

### Technical Decisions

- Add a separate testing/practice row to reports; do not replace existing learning metrics.
- Use `practice_activity_events` as the canonical source for report/library summaries once introduced. Existing source tables remain responsible for operational writes and should emit ledger events at completion time.
- Use `celebration_events` as the canonical source for celebration totals. Reports only need `celebrations.total` in v1, but event details should be stored for future breakdowns.
- Treat quiz completion as exact from `quiz_rounds.status = 'completed'` and `completedAt`.
- Treat dictation completion as exact from `dictation_results.createdAt` (no `completedAt` column exists).
- Treat assessment completion as terminal assessment rows (`passed`, `failed`, `borderline`, `failed_exhausted`). Determine which terminal states count as "completed" for the summary.
- "Prove I know this" is UI copy for `teach_back` / `evaluate` verification type (`learning_sessions.verificationType`), not a schema entity. Query by verification type, not by UI label.
- Store normalized practice/testing points on the ledger event (`pointsEarned`) so summaries do not join quiz XP and topic XP stores.
- Treat review counts as exact only for ledger-emitted review events. Do not derive review counts from `retention_cards.lastReviewedAt` or `vocabularyRetentionCards.lastReviewedAt`.
- Treat celebration counts as exact only from `celebration_events` after rollout. Do not count from `pendingCelebrations` as durable history.
- `metadata.effectiveMode` is untyped JSONB. Known values: `learning`, `freeform`, `homework`, `recitation`, `practice`, `review`, `relearn`, `gap_fill`. Decide which modes count as "practice activity." `relearn` sessions are created directly by `retention-data.ts:884` and bypass `startSession` — if they should emit practice events, the emission must be in the `session-completed` Inngest handler or in `retention-data.ts` itself.
- `dashboard.ts` already computes weekly/monthly fluency drill stats directly from `session_events` (lines 1371–1397, 1505–1525). The new ledger-based aggregation overlaps. In v1, the dashboard continues reading `session_events` directly and reports read the ledger. Long-term, dashboard should migrate to the ledger to avoid divergent totals. Document this as a known dual-source gap.
- Assessment terminal-status logic currently lives in `routes/assessments.ts:112–123` (route handler), not in a service. Phase 3 must extract this into `services/assessments.ts` before wiring ledger emission — adding more business logic to the route would compound the existing G1/G5 violation.
- Ledger event writers must accept both `Database` and `PgTransaction` (`db | tx`) so they can participate in existing transactions. Paths without transactions (`dictation/result.ts`, `retention-data.ts`) must add wrapping transactions as part of Phase 3.

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
| Ledger event written but source write fails (non-atomic paths) | Dictation or retention-data path crashes after ledger insert but before source insert/update | Phantom activity counted in reports that never actually completed | **Must wrap both writes in a transaction.** This is why Phase 3 requires adding `db.transaction()` to `dictation/result.ts` and `retention-data.ts`. |
| Ledger event lost on retry (source written, ledger not) | Inngest retry replays the source write (idempotent via DB constraint) but ledger insert was never attempted | Activity undercounted in reports — source table shows completion but ledger has no row | Dedup key + `onConflictDoNothing` means retries are safe. But the transaction wrapper ensures both succeed or both fail on the first attempt. For paths where wrapping is impractical, accept eventual consistency and consider a periodic reconciliation job. |
| `dedupeKey` format collision across activity types | Two different activity types generate the same dedupeKey string | One event silently dropped, incorrect count | Prefix all dedupeKeys with `{activityType}:{sourceType}:` to namespace. The canonical format prevents cross-type collisions. |
| `dashboard.ts` and ledger disagree on drill totals | Dashboard reads `session_events.drillCorrect/drillTotal` directly; ledger aggregation reads `practice_activity_events` | Two surfaces show different drill counts for the same period | Decide ownership: either migrate dashboard to the ledger (preferred long-term) or document that dashboard reads source-of-record while reports read the ledger. Do not leave both active without a documented decision. |
| `celebration_events` and `queueCelebration()` dedup disagree | Durable ledger uses a different identity tuple than the in-memory dedup in `celebrations.ts:93–98` | Celebration counted once in reports but queued twice for display, or vice versa | Align dedup key format: `{celebrationType}:{reason}:{sourceId}` mirrors the existing `(celebration, reason, detail)` tuple. |

## Implementation Plan

### Implementation Phases

#### Phase 0 — Lock v1 semantics

Use these v1 assumptions unless product explicitly changes them before build:

- Activity types: `quiz`, `review`, `assessment`, `dictation`, `recitation`, `fluency_drill`.
- Quiz subtypes: `capitals`, `guess_who`, `vocabulary`. Vocabulary events carry `languageCode` in metadata; v1 reports can aggregate vocabulary flat while preserving language detail in the payload.
- Review subtypes: `topic_recall`, `vocabulary_srs`, `quiz_mastery`.
- Assessment completion: count all terminal statuses (`passed`, `failed`, `borderline`, `failed_exhausted`) as completed attempts. Store status and depth in metadata so the UI can separate "passed" later.
- Recitation completion: count only explicit `effectiveMode = 'recitation'` in v1. Do not count `practice`, `review`, `relearn`, or `gap_fill` session modes until those modes have clearer completion semantics. `relearn` sessions are created by `retention-data.ts` bypassing `startSession` — they must be explicitly excluded from v1 recitation counts.
- Celebration completion: record durable events in `celebration_events`; report UI uses only total count in v1.
- Historical behavior: no exact review or coaching-card celebration backfill. Optional backfill may cover only source rows with trustworthy completion timestamps (`quiz_rounds`, `dictation_results`, terminal `assessments`).

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
- Export/register the new tables in `packages/database/src/schema/*` and `packages/database/src/repository.ts` if scoped repository access is useful.
- Expand `packages/schemas/src/snapshots.ts`.
  - Replace the narrow `quizzesCompleted` / `reviewsCompleted` shape with a backwards-compatible richer object.
  - Keep new fields optional so old report JSONB remains parseable.
- Add/extend progress response schemas if the library/progress endpoint needs to expose activity count separately from report JSONB.

#### Phase 2 — Event writer services

Add small service helpers so source paths do not hand-roll ledger inserts.

- Create `apps/api/src/services/practice-activity-events.ts`.
  - Export `recordPracticeActivityEvent(db, input)`.
  - Build `dedupeKey` from source identity plus activity type/subtype. **Canonical format:** `{activityType}:{sourceType}:{sourceId}` — e.g., `quiz:quiz_round:uuid`, `review:topic_recall:retentionCardId`, `review:vocabulary_srs:vocabRetentionCardId:{timestamp}`, `review:quiz_mastery:masteryItemId:{timestamp}`, `assessment:assessment:uuid`, `dictation:dictation_result:uuid`, `fluency_drill:session_event:sessionEventId`, `recitation:session:sessionId`. For review events (which can recur for the same card), append a timestamp or sequence counter to prevent dedup from swallowing legitimate repeated reviews.
  - Use insert-on-conflict-ignore or equivalent so retries do not double-count. Follow the existing `xp_ledger` pattern: unique constraint on `(profileId, dedupeKey)` + `onConflictDoNothing`.
  - The `db` parameter must accept both `Database` and `PgTransaction` so callers inside transactions can pass `tx` directly — this is how atomicity is achieved.
  - Keep the helper profile-scoped and explicit about source identity.
- Create `apps/api/src/services/celebration-events.ts`.
  - Export `recordCelebrationEvent(db, input)`.
  - Use the same idempotency pattern.
  - **`dedupeKey` must mirror the existing `queueCelebration()` dedup tuple** (`celebrations.ts:93–98` deduplicates on `(celebration, reason, detail)`). Use format: `{celebrationType}:{reason}:{sourceId}` — e.g., `polar_star:topic_mastered:topicId`. If the durable ledger uses a different identity than `queueCelebration`, the two systems will disagree on "same celebration."
  - Allow source identity to point to either milestone rows or coaching-card celebration reasons.

#### Phase 3 — Emit events from completion paths

Wire emitters into the places where completion already happens. **The ledger event MUST be written atomically with the source update** — inside the same `db.transaction()`. Paths that currently lack a transaction must have one added. The `recordPracticeActivityEvent` / `recordCelebrationEvent` helpers accept `db | tx` for this reason.

**Transaction status of each path (verified from code):**

| Path | Current transaction? | Action required |
| --- | --- | --- |
| `quiz/complete-round.ts` | Yes (`db.transaction()` line 293) | Emit inside existing `tx` — safe |
| `dictation/result.ts` | **No** — single INSERT, no transaction | **Wrap** result insert + ledger event in a new `db.transaction()` |
| `routes/assessments.ts` | Has `db.transaction` for retention/XP, but terminal-status logic is in the route handler | **Extract** terminal-status logic to `services/assessments.ts`, wrap status update + ledger event in a transaction |
| `retention-data.ts` (`processRecallTest`) | **No** — single `db.update()`, no transaction | **Wrap** retention card update + ledger event in a new `db.transaction()` |
| `vocabulary.ts` (`reviewVocabulary`) | Yes (`db.transaction()` line 271) | Emit inside existing `tx` — safe |
| `session-exchange.ts` (drill scores) | Yes (batch insert inside session event persistence) | Emit inside existing write path — safe |
| `celebrations.ts` (`queueCelebration`) | Yes (`SELECT FOR UPDATE` in `mergeHomeSurfaceCacheData`) | Emit inside existing transaction — safe |

- Quiz completion: `apps/api/src/services/quiz/complete-round.ts`
  - Emit `quiz` events after a round is marked completed, **inside the existing `tx`** (after missed items insert, before return).
  - Use subtype from `activityType`; include `languageCode`, `score`, `total`, and `xpEarned` as `pointsEarned`.
  - For quiz mastery review updates in this same service, emit `review` / `quiz_mastery` events when mastery review attempts are completed.
- Dictation completion: `apps/api/src/services/dictation/result.ts`
  - **Add a `db.transaction()` wrapper** around the result insert + ledger event. Currently `recordDictationResult()` is a bare `repo.dictationResults.insert()` with no transaction — the ledger event would not be atomic without wrapping.
  - Emit `dictation` events when a result row is created.
  - Include sentence count, mistake count, and mode in metadata.
- Assessment completion: **prerequisite — extract terminal-status logic from `routes/assessments.ts:112–123` into `services/assessments.ts`**
  - Currently, the route handler computes `newStatus` inline (the `mapEvaluateQualityToSm2` ternary, `db.transaction` for retention/XP). This violates the service boundary rule (eslint G1/G5) and adding ledger emission there would compound the violation.
  - Create a service function (e.g., `completeAssessment(db, assessmentId, evaluationResult)`) that owns the terminal-status transition, retention card update, XP entry, and ledger event emission — all inside a single transaction.
  - Emit `assessment` events when status transitions into a terminal status.
  - Include terminal status, verification depth, mastery score, and topic/subject context when available.
- Topic recall reviews: `apps/api/src/services/retention-data.ts`
  - **Add a `db.transaction()` wrapper** around the retention card update + ledger event. Currently `processRecallTest()` uses a bare `db.update()` with only a WHERE-clause cooldown guard — no transaction.
  - Emit `review` / `topic_recall` events from the recall-test completion path.
  - Do not emit for due-card calculations or card reads.
- Vocabulary reviews: `apps/api/src/services/vocabulary.ts`
  - Emit `review` / `vocabulary_srs` events from `reviewVocabulary`, **inside the existing `tx`**.
  - Include vocabulary id, subject id, quality, and language metadata if available.
- Fluency drills: `apps/api/src/services/session/session-exchange.ts`
  - Emit `fluency_drill` events when `drillCorrect` and `drillTotal` are persisted (inside the `ai_response` event row insert).
  - Include correct/total as score fields.
  - **Dedup key must derive from `sessionEventId` or `(sessionId, clientId)`** to match the existing `session_events` dedup constraint and prevent double-counting on Inngest retry.
  - Note: `dashboard.ts:1371–1397` already reads drill stats directly from `session_events`. Decide whether dashboard migrates to the ledger in a follow-up or continues reading `session_events` directly. Both surfaces should not diverge on totals.
- Recitation: session completion path
  - Emit `recitation` events for sessions whose effective mode is `recitation`.
  - Include session id, duration if available, and subject/topic metadata if available.
  - **Decision needed for `relearn` mode:** `retention-data.ts:884` creates sessions with `effectiveMode: 'relearn'` that bypass `startSession` and go through the `session-completed` Inngest handler. Should `relearn` sessions emit practice events? If yes, the emission point is the `session-completed` Inngest function, not the session start path. If no, document the exclusion explicitly.
- Celebrations:
  - In `apps/api/src/services/celebrations.ts`, emit `celebration_events` when `queueCelebration()` adds a new pending celebration, **inside the existing `SELECT FOR UPDATE` transaction** in `mergeHomeSurfaceCacheData`.
  - In milestone storage/detection paths, attach milestone source identity when available.

#### Phase 4 — Summary service

Build `apps/api/src/services/practice-activity-summary.ts` as the single read model for reports and library/progress.

- Inputs:
  - `profileId`
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
  - Inject `practiceSummary` into the generated report data before inserting `weekly_reports`.
  - Keep `generateWeeklyReportData()` pure if practical by passing `practiceSummary` in as an optional input.
- Monthly reports:
  - Update `apps/api/src/inngest/functions/monthly-report-cron.ts` similarly for current and previous month.
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
- Backwards compatibility:
  - Old reports with no `practiceSummary` render exactly as they do today.
  - New fields should not make older cached report data crash.

#### Phase 7 — Optional historical backfill

Treat this as a separate, explicitly scoped follow-up unless product wants it in the first implementation PR.

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
- Review counts include completed review attempts from ledger events only: topic recall, vocabulary SRS, and quiz mastery. Due-card counts and mutable `lastReviewedAt` proxies are not counted as completed reviews.
- Quiz counts are split by `capitals`, `guess_who`, and `vocabulary`, with vocabulary carrying language metadata.
- Library/progress can read the needed activity count from the shared summary logic rather than duplicating queries.
- Week-over-week and month-over-month comparisons are computed from the same service.
- Ledger writes are idempotent under retries.
- One profile cannot see another profile's activity.
- Old report JSONB without `practiceSummary` remains valid and renders without errors.

## Additional Context

### Dependencies

- **Schema expansion required:** add the `practice_activity_events` and `celebration_events` tables, and expand `reportPracticeSummarySchema` beyond `quizzesCompleted` / `reviewsCompleted` to cover consolidated totals, by-type breakdowns, by-subject breakdowns, dictation, assessments, drills, points, scores, distinct activity types, and celebration total.
- **Review counts:** require ledger emission from topic recall reviews, vocabulary SRS reviews, and quiz mastery review paths. Do not backfill exact historical review counts from mutable card state.
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
