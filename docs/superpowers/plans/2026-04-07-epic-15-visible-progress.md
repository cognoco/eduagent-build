# Epic 15: Visible Progress — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build precomputed progress snapshots, milestone detection, and child/parent-facing progress screens so that learning is measured in concrete knowledge — not points.

**Architecture:** Daily Inngest cron aggregates raw data (sessions, assessments, vocabulary, retention cards) into a single JSONB row per profile per day. On session-complete, a fast-path refresh updates today's snapshot immediately. API endpoints serve inventory and history from these precomputed rows. Mobile screens consume these endpoints for the child's "My Learning Journey" and parent dashboard enhancements.

**Tech Stack:** Drizzle ORM (Postgres via Neon), Inngest (cron + event-driven), Hono (API routes with RPC inference), Zod (shared schemas), React Native / Expo Router (mobile), `@eduagent/schemas` (shared contract), LLM router (monthly report narrative).

**Spec:** `docs/superpowers/specs/2026-04-07-epic-15-visible-progress-design.md`

**Branch:** Create `epic-15-visible-progress` from `main`.

**Cross-Epic Dependency (Conversation-First):** Tasks 3, 5, 6, 8, 9 reference `curriculumTopics.filedFrom` — a column defined in the Conversation-First spec (`docs/superpowers/plans/2026-04-08-conversation-first-learning-flow.md`). The `filed_from` column must be present in the Drizzle schema and database before these tasks compile. If Epic 15 ships before Conversation-First, the `filed_from` column migration must be extracted and applied as a prerequisite, or the FILTER clauses must degrade to treat all topics as pre-generated (`topicsExplored = 0`).

---

## Spec Update (2026-04-08) — Conversation-First Compatibility

> The following spec changes were applied on 2026-04-08 and integrated inline into this plan:
>
> 1. **SubjectProgressMetrics:** Added `topicsExplored` field alongside `topicsTotal` (Task 2, 3)
> 2. **SubjectInventory.topics:** `total` is now `number | null` (null for pure session-filed subjects), added `explored` count (Task 2, 6)
> 3. **FR234.6 (new):** `book_completed`/`subject_mastered` milestones restricted to pre-generated topics; new `topics_explored` milestone type for dynamic books (Task 5, 10)
> 4. **FR235.8 (new):** Open-ended denominator handling — "4 topics explored" (no fill bar) vs "8/15 topics" (fill bar) (Task 8)
> 5. **FR236.7 (new):** Session-filed topics in subject detail view — no "not started" state possible (Task 9)
> 6. **FR237.2 updated:** Added `topics_explored` celebration copy (Task 10)
> 7. **FR241.1 updated:** Snapshot refresh ordering constraint — MUST run AFTER filing + memory analysis (Task 6)
> 8. **FR241.5 (new):** Aggregation query must distinguish `filed_from` for correct counting (Task 3, 6)
> 9. **AD6 (new):** Shared post-session Inngest chain ordering (7 steps, agreed positions) (Task 6)
> 10. **AD7 (new):** Dynamic vs. fixed topic counting explanation (Task 3, 6, 8)
>
> **Additional fixes applied during plan review (F-1 through F-8):**
> - F-1 (CRITICAL): Session-complete step must be BEFORE coaching cards, not after (Task 6)
> - F-2 (HIGH): Added missing `notificationLog` import to routes file (Task 6)
> - F-3 (HIGH): Declared `filed_from` column as cross-epic dependency on Conversation-First (header)
> - F-4 (HIGH): Added `?? 0` fallbacks for `topicsExplored` in JSONB reads (Tasks 5, 6)
> - F-5 (MEDIUM): Fixed missing `and`/`gte`/`lte`/`progressSnapshots` imports (Task 12)
> - F-6 (MEDIUM): Weekly push now includes explored topics delta, avoids false "took a break" (Task 11)
> - F-7 (LOW): Added `filed_from` test case for pre-generated vs session-filed counting (Task 3)
> - F-8 (LOW): Added `topicsExplored` to `ProgressDataPoint` + `buildHistory` (Tasks 2, 6)

---

## Adversarial Review Findings (2026-04-07)

> 13 findings identified during adversarial review. All fixes are integrated inline below.
> Findings are tagged `[AR-N]` throughout the plan where the fix was applied.

| # | Severity | Finding | Fix location |
|---|----------|---------|--------------|
| AR-1 | **CRITICAL** | `getUncelebratedMilestones` uses `eq()` with null — generates `= NULL` SQL, never matches rows | Task 5 — replaced with `isNull()` |
| AR-2 | **HIGH** | `getRecentMilestones` orders ascending — returns oldest, not newest | Task 5 — added `desc()` |
| AR-3 | **HIGH** | In-memory rate limiter useless on CF Workers (stateless isolates) | Task 6 — replaced with DB-backed `notificationLog` check |
| AR-4 | **HIGH** | Task 4 imports `detectMilestones` from Task 5 which doesn't exist yet | Dependency graph — reordered: Task 5 before Task 4 |
| AR-5 | **MEDIUM** | `book_completed` and `cefr_level_up` milestone types declared but never detected | Task 5 — added TODO + stub, marked as Phase D stretch |
| AR-6 | **MEDIUM** | Monthly report `lastMonthMetrics.vocabularyLearned` is cumulative total, not delta | Task 12 — renamed to `vocabularyTotal`, added comment |
| AR-7 | **MEDIUM** | Retention health categories overlap (due ∩ strong ≠ ∅) | Task 3 — refactored to mutually exclusive partition |
| AR-8 | **MEDIUM** | No Failure Modes table for any task | Added below |
| AR-9 | **MEDIUM** | Monthly report cron loads entire `familyLinks` table, no batching | Task 12 — added fan-out via `step.sendEvent()` |
| AR-10 | **LOW** | `estimateProficiency` ignores `byCefrLevel` parameter | Task 6 — removed unused param, simplified signature |
| AR-11 | **LOW** | `type: 'weekly_progress' as any` bypasses type system | Tasks 11+12 — reordered: extend type BEFORE using it |
| AR-12 | **LOW** | Enum migration has no rollback section | Added rollback section to Migration Checklist |
| AR-13 | **LOW** | Session-complete debounce races with daily cron | Task 6 — debounce now checks session endedAt vs snapshot updatedAt |

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Daily cron overlap | Cron takes >24h | Next run starts while previous runs | Inngest concurrency limit 1 on function ID prevents overlap |
| Snapshot during profile deletion | Profile deleted mid-aggregation | FK cascade deletes rows | `processProfileSnapshot` catches error, logs to Sentry, continues to next profile |
| LLM timeout (monthly report) | Provider slow/down | Report generated without highlights | `generateReportHighlights` catches error, returns fallback `["Great progress this month!"]` |
| Parent with 50+ children | Fan-out per child | Slow weekly push delivery | Fan-out via `step.sendEvent()` processes each child independently; daily push cap prevents spam |
| Refresh endpoint abuse | User spams refresh | 429 after 10/hour | DB-backed rate limit via `notificationLog` (not in-memory) |
| Empty snapshot (new user) | User opens Progress before first session | "Start your first session" empty state | Explicit empty-state screen with CTA to home |
| Stale snapshot after session | Session completes, debounce skips refresh | Progress shows pre-session numbers | Pull-to-refresh on Progress screen; auto-invalidation via React Query on session-complete event |
| Network error on Progress screen | Offline or API down | "Couldn't load your progress" + Retry | Error state with Retry button + Go Home secondary action |
| Migration fails mid-apply | Neon connection drop | Deployment blocked | Migration is additive (new tables + enum values); safe to re-run. See Rollback section. |

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/database/src/schema/snapshots.ts` | Drizzle tables: `progress_snapshots`, `milestones`, `monthly_reports` |
| `packages/schemas/src/snapshots.ts` | Zod types: `ProgressMetrics`, `KnowledgeInventory`, `ProgressHistory`, `MilestoneType`, `MonthlyReport` |
| `apps/api/src/services/snapshot-aggregation.ts` | Core aggregation logic: compute metrics from raw tables for one profile |
| `apps/api/src/services/snapshot-aggregation.test.ts` | Integration tests for snapshot computation |
| `apps/api/src/services/milestone-detection.ts` | Detect threshold crossings between two snapshots |
| `apps/api/src/services/milestone-detection.test.ts` | Tests for milestone detection |
| `apps/api/src/services/monthly-report.ts` | Monthly report generation with LLM narrative |
| `apps/api/src/services/monthly-report.test.ts` | Tests for monthly report |
| `apps/api/src/inngest/functions/daily-snapshot.ts` | Inngest cron: daily snapshot aggregation (03:00 UTC) |
| `apps/api/src/inngest/functions/daily-snapshot.test.ts` | Tests for daily snapshot cron |
| `apps/api/src/inngest/functions/weekly-progress-push.ts` | Inngest cron: weekly parent push (Monday 09:00 UTC) |
| `apps/api/src/inngest/functions/weekly-progress-push.test.ts` | Tests for weekly push |
| `apps/api/src/inngest/functions/monthly-report-cron.ts` | Inngest cron: monthly report generation (1st of month 10:00 UTC) |
| `apps/api/src/routes/snapshot-progress.ts` | Routes: inventory, history, refresh, milestones |
| `apps/api/src/routes/snapshot-progress.test.ts` | Route integration tests |
| `apps/mobile/src/app/(app)/progress.tsx` | My Learning Journey screen |
| `apps/mobile/src/app/(app)/progress.test.tsx` | Tests for journey screen |
| `apps/mobile/src/app/(app)/progress/_layout.tsx` | Progress tab layout (for nested routes) |
| `apps/mobile/src/app/(app)/progress/[subjectId].tsx` | Subject Progress Detail screen |
| `apps/mobile/src/app/(app)/progress/[subjectId].test.tsx` | Tests for subject detail |
| `apps/mobile/src/components/progress/ProgressBar.tsx` | Reusable progress bar component |
| `apps/mobile/src/components/progress/GrowthChart.tsx` | Weekly growth bar chart |
| `apps/mobile/src/components/progress/MilestoneCard.tsx` | Milestone list item |
| `apps/mobile/src/components/progress/SubjectCard.tsx` | Subject progress card |
| `apps/mobile/src/hooks/use-progress.ts` | React Query hooks for progress endpoints |
| `apps/api/drizzle/0015_*.sql` | Migration: new tables + enum values |

### Modified files

| File | Change |
|------|--------|
| `packages/database/src/schema/index.ts` | Add `export * from './snapshots'` |
| `packages/schemas/src/index.ts` | Add `export * from './snapshots.ts'` |
| `apps/api/src/inngest/index.ts` | Register new Inngest functions |
| `apps/api/src/inngest/functions/session-completed.ts` | Add snapshot refresh step (FR241) |
| `apps/api/src/index.ts` | Register `snapshotProgressRoutes` |
| `apps/api/src/routes/dashboard.ts` | Add inventory + progress-history + reports routes for parent |
| `apps/api/src/services/dashboard.ts` | Extend `getChildrenForParent` with progress fields |
| `apps/api/src/services/notifications.ts` | Add `weekly_progress` type to `NotificationPayload` |
| `packages/database/src/schema/progress.ts` | Add `weekly_progress` + `monthly_report` to `notificationTypeEnum`; add `weeklyProgressPush` column to `notificationPreferences` |
| `packages/schemas/src/progress.ts` | Add `milestone_celebration` to coaching card types + `weeklyProgressPush` to notification prefs |
| `apps/api/src/services/coaching-cards.ts` | Add `milestone_celebration` card type with highest priority |
| `apps/mobile/src/app/(app)/_layout.tsx` | Add Progress tab to learner tab bar |

---

## Phase A — Data Foundation

### Task 1: Database Schema — Snapshot Tables

**Files:**
- Create: `packages/database/src/schema/snapshots.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/schema/progress.ts`

- [ ] **Step 1: Create snapshots schema file**

```typescript
// packages/database/src/schema/snapshots.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  date,
  timestamp,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import { subjects } from './subjects';
import { curriculumBooks } from './subjects';
import { generateUUIDv7 } from '../utils/uuid';

// ---------------------------------------------------------------------------
// Progress Snapshots — FR230
// Daily precomputed progress metrics per profile.
// ---------------------------------------------------------------------------

export const progressSnapshots = pgTable(
  'progress_snapshots',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    metrics: jsonb('metrics').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('progress_snapshots_profile_date_uq').on(
      table.profileId,
      table.snapshotDate
    ),
    index('progress_snapshots_profile_date_idx').on(
      table.profileId,
      table.snapshotDate
    ),
  ]
);

// ---------------------------------------------------------------------------
// Milestones — FR234
// Append-only record of learning milestones earned by a profile.
// ---------------------------------------------------------------------------

export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    milestoneType: text('milestone_type').notNull(),
    threshold: integer('threshold').notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id, {
      onDelete: 'cascade',
    }),
    bookId: uuid('book_id').references(() => curriculumBooks.id, {
      onDelete: 'cascade',
    }),
    metadata: jsonb('metadata'),
    celebratedAt: timestamp('celebrated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('milestones_profile_type_threshold_subject_uq').on(
      table.profileId,
      table.milestoneType,
      table.threshold,
      table.subjectId
    ),
    index('milestones_profile_id_idx').on(table.profileId),
  ]
);

// ---------------------------------------------------------------------------
// Monthly Reports — FR240
// Parent-facing monthly learning reports per child.
// ---------------------------------------------------------------------------

export const monthlyReports = pgTable(
  'monthly_reports',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    childProfileId: uuid('child_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    reportMonth: date('report_month').notNull(),
    reportData: jsonb('report_data').notNull(),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('monthly_reports_parent_child_month_uq').on(
      table.profileId,
      table.childProfileId,
      table.reportMonth
    ),
    index('monthly_reports_child_profile_idx').on(table.childProfileId),
  ]
);
```

- [ ] **Step 2: Export from schema index**

Add to `packages/database/src/schema/index.ts`:

```typescript
export * from './snapshots';
```

- [ ] **Step 3: Add notification type enum values**

In `packages/database/src/schema/progress.ts`, add `'weekly_progress'` and `'monthly_report'` to `notificationTypeEnum`:

```typescript
export const notificationTypeEnum = pgEnum('notification_type', [
  'review_reminder',
  'daily_reminder',
  'trial_expiry',
  'streak_warning',
  'consent_request',
  'consent_reminder',
  'consent_warning',
  'consent_expired',
  'subscribe_request',
  'recall_nudge',
  'weekly_progress',
  'monthly_report',
  'progress_refresh', // [AR-3] For DB-backed rate limiting of refresh endpoint
]);
```

Add `weeklyProgressPush` column to `notificationPreferences`:

```typescript
export const notificationPreferences = pgTable('notification_preferences', {
  // ... existing columns ...
  weeklyProgressPush: boolean('weekly_progress_push').notNull().default(true),
  // ... rest unchanged ...
});
```

- [ ] **Step 4: Generate migration**

```bash
cd apps/api && pnpm exec drizzle-kit generate
```

Review the generated SQL. It should create the three new tables, add two enum values, and add the `weekly_progress_push` column.

- [ ] **Step 5: Apply migration to dev**

```bash
pnpm run db:push:dev
```

- [ ] **Step 6: Run typecheck to verify schema compiles**

```bash
pnpm exec nx run api:typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/schema/snapshots.ts packages/database/src/schema/index.ts packages/database/src/schema/progress.ts apps/api/drizzle/
git commit -m "feat(db): add progress_snapshots, milestones, monthly_reports tables [EP-15]"
```

---

### Task 2: Shared Zod Types — Snapshot Schemas

**Files:**
- Create: `packages/schemas/src/snapshots.ts`
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/progress.ts`

- [ ] **Step 1: Create snapshot Zod schemas**

```typescript
// packages/schemas/src/snapshots.ts
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Progress Metrics — FR230.3
// Typed JSONB schema stored in progress_snapshots.metrics
// ---------------------------------------------------------------------------

export const subjectProgressMetricsSchema = z.object({
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  pedagogyMode: z.enum(['socratic', 'four_strands']),
  topicsAttempted: z.number().int(),
  topicsMastered: z.number().int(),
  topicsTotal: z.number().int(),
  topicsExplored: z.number().int(),         // session-filed topics (FR241.5)
  vocabularyTotal: z.number().int(),
  vocabularyMastered: z.number().int(),
  sessionsCount: z.number().int(),
  activeMinutes: z.number().int(),
  lastSessionAt: z.string().datetime().nullable(),
});
export type SubjectProgressMetrics = z.infer<
  typeof subjectProgressMetricsSchema
>;

export const progressMetricsSchema = z.object({
  // Global counts
  totalSessions: z.number().int(),
  totalActiveMinutes: z.number().int(),
  totalWallClockMinutes: z.number().int(),
  totalExchanges: z.number().int(),

  // Knowledge counts
  topicsAttempted: z.number().int(),
  topicsMastered: z.number().int(),
  topicsInProgress: z.number().int(),

  // Vocabulary (language subjects only, 0 for non-language)
  vocabularyTotal: z.number().int(),
  vocabularyMastered: z.number().int(),
  vocabularyLearning: z.number().int(),
  vocabularyNew: z.number().int(),

  // Retention health
  retentionCardsDue: z.number().int(),
  retentionCardsStrong: z.number().int(),
  retentionCardsFading: z.number().int(),

  // Streak
  currentStreak: z.number().int(),
  longestStreak: z.number().int(),

  // Per-subject breakdown
  subjects: z.array(subjectProgressMetricsSchema),
});
export type ProgressMetrics = z.infer<typeof progressMetricsSchema>;

// ---------------------------------------------------------------------------
// Knowledge Inventory — FR232
// ---------------------------------------------------------------------------

export const subjectInventorySchema = z.object({
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  pedagogyMode: z.enum(['socratic', 'four_strands']),
  topics: z.object({
    total: z.number().int().nullable(),     // null for pure session-filed subjects (AD7)
    explored: z.number().int(),              // session-filed topic count (FR241.5)
    mastered: z.number().int(),
    inProgress: z.number().int(),
    notStarted: z.number().int(),
  }),
  vocabulary: z.object({
    total: z.number().int(),
    mastered: z.number().int(),
    learning: z.number().int(),
    new: z.number().int(),
    byCefrLevel: z.record(z.string(), z.number().int()),
  }),
  estimatedProficiency: z.string().nullable(),
  proficiencyLabel: z.string().nullable(),   // [SA-4/UX-6] Kid-friendly label, e.g. "Beginner — you can name things"
  retentionCardsDue: z.number().int(),       // [SA-1/FR235.9] Per-subject review-due count for Review CTA
  lastSessionAt: z.string().datetime().nullable(),
  activeMinutes: z.number().int(),
});
export type SubjectInventory = z.infer<typeof subjectInventorySchema>;

export const knowledgeInventorySchema = z.object({
  profileId: z.string().uuid(),
  snapshotDate: z.string(),
  global: z.object({
    topicsAttempted: z.number().int(),
    topicsMastered: z.number().int(),
    vocabularyTotal: z.number().int(),
    vocabularyMastered: z.number().int(),
    totalSessions: z.number().int(),
    totalActiveMinutes: z.number().int(),
    currentStreak: z.number().int(),
    longestStreak: z.number().int(),
  }),
  subjects: z.array(subjectInventorySchema),
});
export type KnowledgeInventory = z.infer<typeof knowledgeInventorySchema>;

// ---------------------------------------------------------------------------
// Progress History — FR233
// ---------------------------------------------------------------------------

export const progressDataPointSchema = z.object({
  date: z.string(),
  topicsMastered: z.number().int(),
  topicsAttempted: z.number().int(),
  topicsExplored: z.number().int(),        // [F-8] session-filed topics for growth charts
  vocabularyTotal: z.number().int(),
  vocabularyMastered: z.number().int(),
  totalSessions: z.number().int(),
  totalActiveMinutes: z.number().int(),
  currentStreak: z.number().int(),
});
export type ProgressDataPoint = z.infer<typeof progressDataPointSchema>;

export const progressHistorySchema = z.object({
  profileId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  granularity: z.enum(['daily', 'weekly']),
  dataPoints: z.array(progressDataPointSchema),
});
export type ProgressHistory = z.infer<typeof progressHistorySchema>;

// ---------------------------------------------------------------------------
// Milestone Types — FR234
// ---------------------------------------------------------------------------

export const milestoneTypeSchema = z.enum([
  'vocabulary_count',
  'topic_mastered_count',
  'session_count',
  'streak_length',
  'subject_mastered',
  'book_completed',
  'topics_explored',               // FR234.6: dynamic books (session-filed topics)
  'learning_time',
  'cefr_level_up',
]);
export type MilestoneType = z.infer<typeof milestoneTypeSchema>;

export const milestoneSchema = z.object({
  id: z.string().uuid(),
  milestoneType: milestoneTypeSchema,
  threshold: z.number().int(),
  subjectId: z.string().uuid().nullable(),
  bookId: z.string().uuid().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  celebratedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Milestone = z.infer<typeof milestoneSchema>;

// ---------------------------------------------------------------------------
// Monthly Report — FR240
// ---------------------------------------------------------------------------

// [AR-6] NOTE: When used for `thisMonth`, these are deltas (this month minus last month).
// When used for `lastMonth`, these are cumulative totals from the end-of-month snapshot
// (we lack month-before-last data to compute true deltas for lastMonth).
// The parent-facing UI should only show comparisons using thisMonth deltas.
export const monthMetricsSchema = z.object({
  totalSessions: z.number().int(),
  totalActiveMinutes: z.number().int(),
  topicsMastered: z.number().int(),
  vocabularyLearned: z.number().int(),
  streakBest: z.number().int(),
});
export type MonthMetrics = z.infer<typeof monthMetricsSchema>;

export const subjectMonthlyDetailSchema = z.object({
  subjectName: z.string(),
  topicsMastered: z.number().int(),
  topicsAttempted: z.number().int(),
  vocabularyLearned: z.number().int(),
  activeMinutes: z.number().int(),
  trend: z.enum(['growing', 'stable', 'declining']),
});
export type SubjectMonthlyDetail = z.infer<typeof subjectMonthlyDetailSchema>;

export const monthlyReportDataSchema = z.object({
  childName: z.string(),
  month: z.string(),
  thisMonth: monthMetricsSchema,
  lastMonth: monthMetricsSchema.nullable(),
  highlights: z.array(z.string()).max(3),
  nextSteps: z.array(z.string()).max(2),
  subjects: z.array(subjectMonthlyDetailSchema),
  headlineStat: z.object({
    label: z.string(),
    value: z.number(),
    comparison: z.string(),
  }),
});
export type MonthlyReportData = z.infer<typeof monthlyReportDataSchema>;

export const monthlyReportResponseSchema = z.object({
  id: z.string().uuid(),
  reportMonth: z.string(),
  reportData: monthlyReportDataSchema,
  viewedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type MonthlyReportResponse = z.infer<
  typeof monthlyReportResponseSchema
>;

// ---------------------------------------------------------------------------
// Refresh endpoint — FR231.6
// ---------------------------------------------------------------------------

export const progressRefreshResponseSchema = z.object({
  snapshotDate: z.string(),
  refreshedAt: z.string().datetime(),
});
export type ProgressRefreshResponse = z.infer<
  typeof progressRefreshResponseSchema
>;
```

- [ ] **Step 2: Export from schemas index**

Add to `packages/schemas/src/index.ts`:

```typescript
// Visible Progress (Epic 15)
export * from './snapshots.ts';
```

- [ ] **Step 3: Add milestone_celebration to coaching card types**

In `packages/schemas/src/progress.ts`, add to `coachingCardTypeSchema`:

```typescript
export const coachingCardTypeSchema = z.enum([
  'streak',
  'insight',
  'review_due',
  'challenge',
  'curriculum_complete',
  'continue_book',
  'book_suggestion',
  'milestone_celebration',
]);
```

Add the milestone celebration card schema:

```typescript
// [AR2-10] FIXED: z.object() does not support spread. Use .extend() instead.
export const milestoneCelebrationCardSchema = baseCoachingCardSchema.extend({
  type: z.literal('milestone_celebration'),
  milestoneId: z.string().uuid(),
  milestoneType: z.string(),
  threshold: z.number().int(),
  celebrationCopy: z.string(),
  beforeAfter: z
    .object({
      beforeDate: z.string(),
      beforeValue: z.number().int(),
      currentValue: z.number().int(),
    })
    .nullable(),
});
export type MilestoneCelebrationCard = z.infer<
  typeof milestoneCelebrationCardSchema
>;
```

Add to the `coachingCardSchema` discriminated union:

```typescript
export const coachingCardSchema = z.discriminatedUnion('type', [
  streakCardSchema,
  insightCardSchema,
  reviewDueCardSchema,
  challengeCardSchema,
  curriculumCompleteCardSchema,
  continueBookCardSchema,
  bookSuggestionCardSchema,
  milestoneCelebrationCardSchema,
]);
```

- [ ] **Step 4: Add weeklyProgressPush to notification prefs schema**

In `packages/schemas/src/progress.ts`:

```typescript
export const notificationPrefsSchema = z.object({
  reviewReminders: z.boolean(),
  dailyReminders: z.boolean(),
  pushEnabled: z.boolean(),
  maxDailyPush: z.number().int().min(1).max(10).optional(),
  weeklyProgressPush: z.boolean().optional(),
});
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm exec nx run-many -t typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/schemas/src/snapshots.ts packages/schemas/src/index.ts packages/schemas/src/progress.ts
git commit -m "feat(schemas): add Zod types for progress snapshots, milestones, monthly reports [EP-15]"
```

---

### Task 3: Snapshot Aggregation Service

**Files:**
- Create: `apps/api/src/services/snapshot-aggregation.ts`
- Create: `apps/api/src/services/snapshot-aggregation.test.ts`

- [ ] **Step 1: Write failing tests for snapshot aggregation**

```typescript
// apps/api/src/services/snapshot-aggregation.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDatabase, seedProfile, seedSubject, seedSession, seedAssessment, seedVocabulary, seedRetentionCard, seedStreak } from '../../test/helpers';
import { computeProgressSnapshot, upsertSnapshot, getLatestSnapshot } from './snapshot-aggregation';

describe('computeProgressSnapshot', () => {
  let db: ReturnType<typeof getTestDatabase>;
  let profileId: string;

  beforeEach(async () => {
    db = getTestDatabase();
    profileId = await seedProfile(db);
  });

  it('returns zero metrics for a profile with no activity', async () => {
    const metrics = await computeProgressSnapshot(db, profileId);
    expect(metrics.totalSessions).toBe(0);
    expect(metrics.topicsMastered).toBe(0);
    expect(metrics.vocabularyTotal).toBe(0);
    expect(metrics.subjects).toEqual([]);
  });

  it('counts sessions, duration, and exchanges across subjects', async () => {
    const subjectId = await seedSubject(db, profileId, { name: 'Science', pedagogyMode: 'socratic' });
    await seedSession(db, profileId, subjectId, {
      durationSeconds: 600,
      wallClockSeconds: 720,
      exchangeCount: 12,
      status: 'completed',
    });
    await seedSession(db, profileId, subjectId, {
      durationSeconds: 300,
      wallClockSeconds: 400,
      exchangeCount: 8,
      status: 'completed',
    });

    const metrics = await computeProgressSnapshot(db, profileId);
    expect(metrics.totalSessions).toBe(2);
    expect(metrics.totalActiveMinutes).toBe(15); // (600+300)/60
    expect(metrics.totalWallClockMinutes).toBe(18); // (720+400)/60 rounded
    expect(metrics.totalExchanges).toBe(20);
    expect(metrics.subjects).toHaveLength(1);
    expect(metrics.subjects[0]!.sessionsCount).toBe(2);
  });

  it('classifies topics as mastered, in-progress, or not started', async () => {
    const subjectId = await seedSubject(db, profileId, { name: 'Math', pedagogyMode: 'socratic' });
    const topicA = await seedTopic(db, subjectId, 'Algebra');
    const topicB = await seedTopic(db, subjectId, 'Geometry');
    const topicC = await seedTopic(db, subjectId, 'Calculus');

    await seedAssessment(db, profileId, subjectId, topicA, { status: 'passed' });
    await seedSession(db, profileId, subjectId, { topicId: topicB });
    // topicC: no sessions, no assessments

    const metrics = await computeProgressSnapshot(db, profileId);
    expect(metrics.topicsMastered).toBe(1);
    expect(metrics.topicsInProgress).toBe(1);
    expect(metrics.topicsAttempted).toBe(2);
  });

  it('counts vocabulary by mastery state for language subjects', async () => {
    const subjectId = await seedSubject(db, profileId, {
      name: 'Spanish',
      pedagogyMode: 'four_strands',
      languageCode: 'es',
    });

    await seedVocabulary(db, profileId, subjectId, [
      { term: 'hola', mastered: true },
      { term: 'gato', mastered: true },
      { term: 'perro', mastered: false },  // has retention card
    ]);
    // 'perro' has a vocabulary_retention_card → counts as "learning"
    // Assume seedVocabulary creates retention cards for non-mastered items

    const metrics = await computeProgressSnapshot(db, profileId);
    expect(metrics.vocabularyTotal).toBe(3);
    expect(metrics.vocabularyMastered).toBe(2);
    expect(metrics.vocabularyLearning).toBeGreaterThanOrEqual(1);
  });

  it('captures retention card health stats', async () => {
    const subjectId = await seedSubject(db, profileId, { name: 'Science', pedagogyMode: 'socratic' });
    const topicA = await seedTopic(db, subjectId, 'Photosynthesis');

    await seedRetentionCard(db, profileId, topicA, {
      intervalDays: 30,
      nextReviewAt: new Date(Date.now() + 7 * 86400000), // future = strong
    });

    const metrics = await computeProgressSnapshot(db, profileId);
    expect(metrics.retentionCardsStrong).toBe(1);
    expect(metrics.retentionCardsFading).toBe(0);
    expect(metrics.retentionCardsDue).toBe(0);
  });

  it('includes streak data from streaks table', async () => {
    await seedStreak(db, profileId, { currentStreak: 7, longestStreak: 14 });
    const metrics = await computeProgressSnapshot(db, profileId);
    expect(metrics.currentStreak).toBe(7);
    expect(metrics.longestStreak).toBe(14);
  });

  it('distinguishes pre-generated vs session-filed topics via filed_from (FR241.5)', async () => {
    const subjectId = await seedSubject(db, profileId, { name: 'Geography', pedagogyMode: 'socratic' });
    // Pre-generated topics (filed_from = NULL)
    await seedTopic(db, subjectId, 'Rivers');
    await seedTopic(db, subjectId, 'Mountains');
    // Session-filed topics
    await seedTopic(db, subjectId, 'Volcanoes', { filedFrom: 'session_filing' });
    await seedTopic(db, subjectId, 'Earthquakes', { filedFrom: 'freeform_filing' });
    await seedTopic(db, subjectId, 'Glaciers', { filedFrom: 'session_filing' });

    const metrics = await computeProgressSnapshot(db, profileId);
    const geo = metrics.subjects.find(s => s.subjectId === subjectId)!;
    expect(geo.topicsTotal).toBe(2);      // only pre-generated
    expect(geo.topicsExplored).toBe(3);   // only session-filed
  });
});

describe('upsertSnapshot', () => {
  it('inserts a new snapshot row', async () => {
    const db = getTestDatabase();
    const profileId = await seedProfile(db);
    const today = '2026-04-07';

    const metrics = await computeProgressSnapshot(db, profileId);
    await upsertSnapshot(db, profileId, today, metrics);

    const snapshot = await getLatestSnapshot(db, profileId);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.snapshotDate).toBe(today);
  });

  it('overwrites existing snapshot for the same date', async () => {
    const db = getTestDatabase();
    const profileId = await seedProfile(db);
    const today = '2026-04-07';

    const metrics1 = { ...emptyMetrics(), totalSessions: 5 };
    await upsertSnapshot(db, profileId, today, metrics1);

    const metrics2 = { ...emptyMetrics(), totalSessions: 7 };
    await upsertSnapshot(db, profileId, today, metrics2);

    const snapshot = await getLatestSnapshot(db, profileId);
    expect((snapshot!.metrics as any).totalSessions).toBe(7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec nx run api:test -- --testPathPattern=snapshot-aggregation
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement snapshot aggregation service**

```typescript
// apps/api/src/services/snapshot-aggregation.ts
import { eq, and, gte, lte, desc, sql, count, sum, isNull } from 'drizzle-orm';
import {
  learningSessions,
  assessments,
  vocabulary,
  vocabularyRetentionCards,
  retentionCards,
  streaks,
  subjects,
  curriculumTopics,
  curriculumBooks,
  progressSnapshots,
  type Database,
} from '@eduagent/database';
import type { ProgressMetrics, SubjectProgressMetrics } from '@eduagent/schemas';

/**
 * Compute a complete ProgressMetrics object for a single profile.
 * Reads from raw tables — sessions, assessments, vocabulary, retention, streaks.
 */
export async function computeProgressSnapshot(
  db: Database,
  profileId: string
): Promise<ProgressMetrics> {
  // 1. Fetch all active (non-archived) subjects for the profile
  const profileSubjects = await db
    .select({
      id: subjects.id,
      name: subjects.name,
      pedagogyMode: subjects.pedagogyMode,
    })
    .from(subjects)
    .where(
      and(eq(subjects.profileId, profileId), eq(subjects.status, 'active'))
    );

  // 2. Session aggregates grouped by subject
  const sessionAggs = await db
    .select({
      subjectId: learningSessions.subjectId,
      sessionCount: count(learningSessions.id),
      totalDurationSeconds: sum(learningSessions.durationSeconds),
      totalWallClockSeconds: sum(learningSessions.wallClockSeconds),
      totalExchanges: sum(learningSessions.exchangeCount),
      lastSessionAt: sql<string>`MAX(${learningSessions.endedAt})`,
    })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.status, 'completed')
      )
    )
    .groupBy(learningSessions.subjectId);

  const sessionBySubject = new Map(
    sessionAggs.map((a) => [a.subjectId, a])
  );

  // 3. Topic counts per subject — distinguish pre-generated vs session-filed (FR241.5, AD7)
  // topicsTotal: only pre-generated topics (filed_from IS NULL or 'pre_generated') — fixed denominator
  // topicsExplored: only session-filed topics (filed_from IN ('session_filing', 'freeform_filing')) — open count
  const topicTotals = await db
    .select({
      subjectId: curriculumBooks.subjectId,
      // [AR2-7] FIXED: filedFrom is NOT NULL DEFAULT 'pre_generated' — removed dead IS NULL branch
      topicsTotal: sql<number>`COUNT(*) FILTER (WHERE ${curriculumTopics.filedFrom} = 'pre_generated')`,
      topicsExplored: sql<number>`COUNT(*) FILTER (WHERE ${curriculumTopics.filedFrom} IN ('session_filing', 'freeform_filing'))`,
    })
    .from(curriculumTopics)
    .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
    .where(eq(curriculumTopics.skipped, false))
    .groupBy(curriculumBooks.subjectId);

  const topicTotalBySubject = new Map(
    topicTotals.map((t) => [t.subjectId, { total: Number(t.topicsTotal), explored: Number(t.topicsExplored) }])
  );

  // Topics mastered (assessment.status = 'passed') grouped by subject
  const topicsMastered = await db
    .select({
      subjectId: assessments.subjectId,
      masteredCount: count(assessments.topicId),
    })
    .from(assessments)
    .where(
      and(
        eq(assessments.profileId, profileId),
        eq(assessments.status, 'passed')
      )
    )
    .groupBy(assessments.subjectId);

  const masteredBySubject = new Map(
    topicsMastered.map((t) => [t.subjectId, Number(t.masteredCount)])
  );

  // Topics with at least one session (attempted)
  const topicsAttemptedRows = await db
    .select({
      subjectId: learningSessions.subjectId,
      attemptedCount:
        sql<number>`COUNT(DISTINCT ${learningSessions.topicId})`.as(
          'attempted_count'
        ),
    })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.status, 'completed')
      )
    )
    .groupBy(learningSessions.subjectId);

  const attemptedBySubject = new Map(
    topicsAttemptedRows.map((t) => [t.subjectId, Number(t.attemptedCount)])
  );

  // 4. Vocabulary counts per subject (language subjects only)
  const vocabCounts = await db
    .select({
      subjectId: vocabulary.subjectId,
      total: count(vocabulary.id),
      mastered: sql<number>`COUNT(*) FILTER (WHERE ${vocabulary.mastered} = true)`,
    })
    .from(vocabulary)
    .where(eq(vocabulary.profileId, profileId))
    .groupBy(vocabulary.subjectId);

  const vocabBySubject = new Map(
    vocabCounts.map((v) => [
      v.subjectId,
      { total: Number(v.total), mastered: Number(v.mastered) },
    ])
  );

  // Vocabulary with retention cards (= "learning")
  const vocabWithCards = await db
    .select({
      subjectId: vocabulary.subjectId,
      learningCount: count(vocabularyRetentionCards.id),
    })
    .from(vocabularyRetentionCards)
    .innerJoin(vocabulary, eq(vocabularyRetentionCards.vocabularyId, vocabulary.id))
    .where(
      and(
        eq(vocabulary.profileId, profileId),
        eq(vocabulary.mastered, false)
      )
    )
    .groupBy(vocabulary.subjectId);

  const vocabLearningBySubject = new Map(
    vocabWithCards.map((v) => [v.subjectId, Number(v.learningCount)])
  );

  // 5. Retention card health
  // [AR-7] FIXED: Categories must be mutually exclusive.
  // Original had overlap: a card with intervalDays>=21 AND nextReviewAt<=NOW()
  // counted as both "due" AND "strong". Now partitioned:
  //   due    = nextReviewAt <= NOW() (regardless of interval)
  //   strong = intervalDays >= 21 AND nextReviewAt > NOW() (not due)
  //   fading = intervalDays < 21 AND nextReviewAt > NOW() (not due, not strong)
  const retentionHealthRows = await db
    .select({
      due: sql<number>`COUNT(*) FILTER (WHERE ${retentionCards.nextReviewAt} <= NOW())`,
      strong: sql<number>`COUNT(*) FILTER (WHERE ${retentionCards.intervalDays} >= 21 AND ${retentionCards.nextReviewAt} > NOW())`,
      fading: sql<number>`COUNT(*) FILTER (WHERE ${retentionCards.intervalDays} < 21 AND ${retentionCards.nextReviewAt} > NOW())`,
    })
    .from(retentionCards)
    .where(eq(retentionCards.profileId, profileId));

  const retentionHealth = retentionHealthRows[0] ?? {
    due: 0,
    strong: 0,
    fading: 0,
  };

  // 6. Streak data
  const streakRow = await db.query.streaks.findFirst({
    where: eq(streaks.profileId, profileId),
  });

  // 7. Build per-subject metrics
  const subjectMetrics: SubjectProgressMetrics[] = profileSubjects.map(
    (subj) => {
      const sess = sessionBySubject.get(subj.id);
      const topicCounts = topicTotalBySubject.get(subj.id) ?? { total: 0, explored: 0 };
      const mastered = masteredBySubject.get(subj.id) ?? 0;
      const attempted = attemptedBySubject.get(subj.id) ?? 0;
      const vocab = vocabBySubject.get(subj.id) ?? { total: 0, mastered: 0 };

      return {
        subjectId: subj.id,
        subjectName: subj.name,
        pedagogyMode: subj.pedagogyMode as 'socratic' | 'four_strands',
        topicsAttempted: attempted,
        topicsMastered: mastered,
        topicsTotal: topicCounts.total,      // pre-generated only (AD7)
        topicsExplored: topicCounts.explored, // session-filed only (FR241.5)
        vocabularyTotal: vocab.total,
        vocabularyMastered: vocab.mastered,
        sessionsCount: Number(sess?.sessionCount ?? 0),
        activeMinutes: Math.round(
          Number(sess?.totalDurationSeconds ?? 0) / 60
        ),
        lastSessionAt: sess?.lastSessionAt
          ? new Date(sess.lastSessionAt).toISOString()
          : null,
      };
    }
  );

  // 8. Aggregate globals
  const globalSessions = subjectMetrics.reduce(
    (sum, s) => sum + s.sessionsCount,
    0
  );
  const globalActiveMinutes = subjectMetrics.reduce(
    (sum, s) => sum + s.activeMinutes,
    0
  );
  const globalWallClockMinutes = sessionAggs.reduce(
    (sum, a) => sum + Math.round(Number(a.totalWallClockSeconds ?? 0) / 60),
    0
  );
  const globalExchanges = sessionAggs.reduce(
    (sum, a) => sum + Number(a.totalExchanges ?? 0),
    0
  );
  const globalTopicsAttempted = subjectMetrics.reduce(
    (sum, s) => sum + s.topicsAttempted,
    0
  );
  const globalTopicsMastered = subjectMetrics.reduce(
    (sum, s) => sum + s.topicsMastered,
    0
  );
  const globalTopicsInProgress = globalTopicsAttempted - globalTopicsMastered;
  const globalVocabTotal = subjectMetrics.reduce(
    (sum, s) => sum + s.vocabularyTotal,
    0
  );
  const globalVocabMastered = subjectMetrics.reduce(
    (sum, s) => sum + s.vocabularyMastered,
    0
  );
  const globalVocabLearning = Array.from(vocabLearningBySubject.values()).reduce(
    (sum, v) => sum + v,
    0
  );

  return {
    totalSessions: globalSessions,
    totalActiveMinutes: globalActiveMinutes,
    totalWallClockMinutes: globalWallClockMinutes,
    totalExchanges: globalExchanges,
    topicsAttempted: globalTopicsAttempted,
    topicsMastered: globalTopicsMastered,
    topicsInProgress: Math.max(0, globalTopicsInProgress),
    vocabularyTotal: globalVocabTotal,
    vocabularyMastered: globalVocabMastered,
    vocabularyLearning: globalVocabLearning,
    vocabularyNew: Math.max(
      0,
      globalVocabTotal - globalVocabMastered - globalVocabLearning
    ),
    retentionCardsDue: Number(retentionHealth.due),
    retentionCardsStrong: Number(retentionHealth.strong),
    retentionCardsFading: Number(retentionHealth.fading),
    currentStreak: streakRow?.currentStreak ?? 0,
    longestStreak: streakRow?.longestStreak ?? 0,
    subjects: subjectMetrics,
  };
}

/**
 * Upsert a progress snapshot for a profile and date.
 * ON CONFLICT (profileId, snapshotDate) → UPDATE metrics.
 */
export async function upsertSnapshot(
  db: Database,
  profileId: string,
  snapshotDate: string,
  metrics: ProgressMetrics
): Promise<void> {
  await db
    .insert(progressSnapshots)
    .values({ profileId, snapshotDate, metrics })
    .onConflictDoUpdate({
      target: [progressSnapshots.profileId, progressSnapshots.snapshotDate],
      set: { metrics, updatedAt: new Date() },
    });
}

/**
 * Get the latest snapshot for a profile (most recent snapshotDate).
 */
export async function getLatestSnapshot(
  db: Database,
  profileId: string
): Promise<typeof progressSnapshots.$inferSelect | null> {
  const row = await db
    .select()
    .from(progressSnapshots)
    .where(eq(progressSnapshots.profileId, profileId))
    .orderBy(desc(progressSnapshots.snapshotDate))
    .limit(1);
  return row[0] ?? null;
}

/**
 * Get snapshots for a profile within a date range.
 */
export async function getSnapshotsInRange(
  db: Database,
  profileId: string,
  from: string,
  to: string
): Promise<Array<typeof progressSnapshots.$inferSelect>> {
  return db
    .select()
    .from(progressSnapshots)
    .where(
      and(
        eq(progressSnapshots.profileId, profileId),
        gte(progressSnapshots.snapshotDate, from),
        lte(progressSnapshots.snapshotDate, to)
      )
    )
    .orderBy(progressSnapshots.snapshotDate);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec nx run api:test -- --testPathPattern=snapshot-aggregation
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/snapshot-aggregation.ts apps/api/src/services/snapshot-aggregation.test.ts
git commit -m "feat(api): add progress snapshot aggregation service [EP-15, FR230]"
```

---

### Task 4: Daily Snapshot Inngest Cron

> **[AR-4] DEPENDENCY NOTE:** This task's implementation imports `detectMilestones` from Task 5's module. **Implement Task 5 (Milestone Detection) BEFORE this task**, or stub the import as a no-op and wire it after Task 5. The dependency graph has been updated below to reflect this.

**Files:**
- Create: `apps/api/src/inngest/functions/daily-snapshot.ts`
- Create: `apps/api/src/inngest/functions/daily-snapshot.test.ts`
- Modify: `apps/api/src/inngest/index.ts`

- [ ] **Step 1: Write failing test for daily snapshot cron**

```typescript
// apps/api/src/inngest/functions/daily-snapshot.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getTestDatabase, seedProfile, seedSession, seedSubject } from '../../../test/helpers';

// Test the core processing function, not the Inngest wrapper
import { processProfileSnapshot } from './daily-snapshot';

describe('daily-snapshot cron', () => {
  it('computes and upserts a snapshot for an active profile', async () => {
    const db = getTestDatabase();
    const profileId = await seedProfile(db);
    const subjectId = await seedSubject(db, profileId, { name: 'Math', pedagogyMode: 'socratic' });
    await seedSession(db, profileId, subjectId, {
      durationSeconds: 600,
      exchangeCount: 10,
      status: 'completed',
    });

    const result = await processProfileSnapshot(db, profileId);
    expect(result.status).toBe('ok');
    expect(result.totalSessions).toBe(1);
  });

  it('skips profiles with no recent activity gracefully', async () => {
    const db = getTestDatabase();
    const profileId = await seedProfile(db);
    // No sessions at all

    const result = await processProfileSnapshot(db, profileId);
    expect(result.status).toBe('ok');
    expect(result.totalSessions).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec nx run api:test -- --testPathPattern=daily-snapshot
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement daily snapshot cron**

```typescript
// apps/api/src/inngest/functions/daily-snapshot.ts
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  computeProgressSnapshot,
  upsertSnapshot,
} from '../../services/snapshot-aggregation';
import { detectMilestones } from '../../services/milestone-detection';
import { captureException } from '../../services/sentry';
import { learningSessions, profiles } from '@eduagent/database';
import { and, eq, gte, sql } from 'drizzle-orm';

const BATCH_SIZE = 50;

/**
 * Process a single profile's daily snapshot.
 * Exported for testability — the Inngest function calls this in batches.
 */
export async function processProfileSnapshot(
  db: ReturnType<typeof getStepDatabase>,
  profileId: string
): Promise<{ status: 'ok' | 'failed'; totalSessions: number; error?: string }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const metrics = await computeProgressSnapshot(db, profileId);
    await upsertSnapshot(db, profileId, today, metrics);
    await detectMilestones(db, profileId, metrics);
    return { status: 'ok', totalSessions: metrics.totalSessions };
  } catch (err) {
    captureException(err, { profileId });
    return {
      status: 'failed',
      totalSessions: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Daily Inngest cron — runs at 03:00 UTC.
 * Processes all active profiles (session in last 90 days) in batches of 50.
 */
export const dailySnapshot = inngest.createFunction(
  {
    id: 'progress-daily-snapshot',
    name: 'Compute daily progress snapshots',
    concurrency: { limit: 1 }, // Prevent overlap if cron takes >24h (Failure Modes table)
  },
  { cron: '0 3 * * *' },
  async ({ step }) => {
    // Step 1: Get active profile IDs
    const activeProfileIds = await step.run(
      'get-active-profiles',
      async () => {
        const db = getStepDatabase();
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const rows = await db
          .selectDistinct({ profileId: learningSessions.profileId })
          .from(learningSessions)
          .where(gte(learningSessions.startedAt, ninetyDaysAgo));

        return rows.map((r) => r.profileId);
      }
    );

    // Step 2: Process in batches
    const results: Array<{ profileId: string; status: string }> = [];

    for (let i = 0; i < activeProfileIds.length; i += BATCH_SIZE) {
      const batch = activeProfileIds.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      const batchResults = await step.run(
        `process-batch-${batchNum}`,
        async () => {
          const db = getStepDatabase();
          const batchOutcomes: Array<{
            profileId: string;
            status: string;
          }> = [];

          for (const pid of batch) {
            const result = await processProfileSnapshot(db, pid);
            batchOutcomes.push({ profileId: pid, status: result.status });
          }

          return batchOutcomes;
        }
      );

      results.push(...batchResults);
    }

    const succeeded = results.filter((r) => r.status === 'ok').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    return {
      totalProcessed: results.length,
      succeeded,
      failed,
    };
  }
);
```

- [ ] **Step 4: Register in Inngest index**

In `apps/api/src/inngest/index.ts`:

```typescript
import { dailySnapshot } from './functions/daily-snapshot';

// Add to exports
export { dailySnapshot };

// Add to functions array
export const functions = [
  // ... existing ...
  dailySnapshot,
];
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm exec nx run api:test -- --testPathPattern=daily-snapshot
```

Expected: PASS

- [ ] **Step 6: Typecheck**

```bash
pnpm exec nx run api:typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/inngest/functions/daily-snapshot.ts apps/api/src/inngest/functions/daily-snapshot.test.ts apps/api/src/inngest/index.ts
git commit -m "feat(api): add daily progress snapshot Inngest cron [EP-15, FR231]"
```

- [ ] **Step 8 [UX-1]: Historical backfill Inngest event**

Create a one-time backfill function (`apps/api/src/inngest/functions/backfill-snapshots.ts`) that:
1. Finds all profiles with `learning_sessions` but no `progress_snapshots`.
2. For each profile, identifies the earliest session date.
3. Iterates week by week from that date to today, computing a snapshot using the same aggregation logic as the daily cron but with a historical date filter.
4. Upserts one `progress_snapshots` row per week (using the last day of each week as `snapshotDate`).
5. Processes in batches of 20 profiles to avoid timeouts.
6. Triggered once via `POST /v1/admin/backfill-snapshots` or manually from the Inngest dashboard.

This ensures existing users see a growth curve from their first session on the day the feature ships. The backfill is approximate (retention card health at historical points cannot be perfectly reconstructed) but vastly better than starting at zero.

**[AR2-13] Known limitation:** Because retention card `intervalDays` and `nextReviewAt` are live values (not historical), backfilled snapshots will show today's retention health projected backward. This creates a visible discontinuity in the growth chart at the transition between backfilled and real daily snapshots. Acceptable trade-off: the alternative (blank charts) is worse for user engagement. Consider smoothing the transition in the GrowthChart component by interpolating the first real data point with the last backfilled one.

**Implementation note:** This step is specified as prose rather than full code because the backfill logic depends heavily on the final shape of Tasks 3/5/6. Implementers should write this as a proper Inngest function with `step.run` batches, matching the patterns in `daily-snapshot.ts`.

```bash
git add apps/api/src/inngest/functions/backfill-snapshots.ts
git commit -m "feat(api): one-time historical snapshot backfill for existing users [EP-15, UX-1]"
```

---

### Task 5: Milestone Detection Service

**Files:**
- Create: `apps/api/src/services/milestone-detection.ts`
- Create: `apps/api/src/services/milestone-detection.test.ts`

- [ ] **Step 1: Write failing tests for milestone detection**

```typescript
// apps/api/src/services/milestone-detection.test.ts
import { describe, it, expect } from 'vitest';
import { getTestDatabase, seedProfile, seedSubject } from '../../test/helpers';
import { detectMilestones, VOCABULARY_THRESHOLDS, TOPIC_THRESHOLDS, TOPICS_EXPLORED_THRESHOLDS } from './milestone-detection';
import { milestones } from '@eduagent/database';
import { eq } from 'drizzle-orm';
import type { ProgressMetrics } from '@eduagent/schemas';

function makeMetrics(overrides: Partial<ProgressMetrics> = {}): ProgressMetrics {
  return {
    totalSessions: 0, totalActiveMinutes: 0, totalWallClockMinutes: 0,
    totalExchanges: 0, topicsAttempted: 0, topicsMastered: 0,
    topicsInProgress: 0, vocabularyTotal: 0, vocabularyMastered: 0,
    vocabularyLearning: 0, vocabularyNew: 0, retentionCardsDue: 0,
    retentionCardsStrong: 0, retentionCardsFading: 0,
    currentStreak: 0, longestStreak: 0, subjects: [],
    ...overrides,
  };
}

describe('detectMilestones', () => {
  it('creates a vocabulary_count milestone when threshold crossed', async () => {
    const db = getTestDatabase();
    const profileId = await seedProfile(db);

    const metrics = makeMetrics({ vocabularyTotal: 105 });
    await detectMilestones(db, profileId, metrics);

    const rows = await db.select().from(milestones).where(eq(milestones.profileId, profileId));
    const vocabMilestones = rows.filter(r => r.milestoneType === 'vocabulary_count');
    // Should have milestones for 10, 25, 50, 100 (all thresholds <= 105)
    expect(vocabMilestones).toHaveLength(4);
  });

  it('does not create duplicate milestones on re-run', async () => {
    const db = getTestDatabase();
    const profileId = await seedProfile(db);

    const metrics = makeMetrics({ vocabularyTotal: 50 });
    await detectMilestones(db, profileId, metrics);
    await detectMilestones(db, profileId, metrics); // re-run

    const rows = await db.select().from(milestones).where(eq(milestones.profileId, profileId));
    // Unique constraint prevents duplicates
    const vocabMilestones = rows.filter(r => r.milestoneType === 'vocabulary_count');
    expect(vocabMilestones).toHaveLength(3); // 10, 25, 50
  });

  it('creates streak_length milestone at threshold', async () => {
    const db = getTestDatabase();
    const profileId = await seedProfile(db);

    const metrics = makeMetrics({ currentStreak: 14, longestStreak: 14 });
    await detectMilestones(db, profileId, metrics);

    const rows = await db.select().from(milestones).where(eq(milestones.profileId, profileId));
    const streakMilestones = rows.filter(r => r.milestoneType === 'streak_length');
    expect(streakMilestones).toHaveLength(2); // 7 and 14
  });

  it('creates learning_time milestones based on total active minutes', async () => {
    const db = getTestDatabase();
    const profileId = await seedProfile(db);

    const metrics = makeMetrics({ totalActiveMinutes: 320 }); // 5h 20min
    await detectMilestones(db, profileId, metrics);

    const rows = await db.select().from(milestones).where(eq(milestones.profileId, profileId));
    const timeMilestones = rows.filter(r => r.milestoneType === 'learning_time');
    expect(timeMilestones).toHaveLength(2); // 1h (60min) and 5h (300min)
  });

  it('creates topics_explored milestones for session-filed subjects (FR234.6)', async () => {
    const db = getTestDatabase();
    const profileId = await seedProfile(db);

    const metrics = makeMetrics({
      subjects: [{
        subjectId: 's1', subjectName: 'Geography', pedagogyMode: 'socratic',
        topicsAttempted: 12, topicsMastered: 8, topicsTotal: 0,
        topicsExplored: 12, // all session-filed
        vocabularyTotal: 0, vocabularyMastered: 0,
        sessionsCount: 15, activeMinutes: 200, lastSessionAt: null,
      }],
    });
    await detectMilestones(db, profileId, metrics);

    const rows = await db.select().from(milestones).where(eq(milestones.profileId, profileId));
    const exploredMilestones = rows.filter(r => r.milestoneType === 'topics_explored');
    expect(exploredMilestones).toHaveLength(2); // 5 and 10
    expect(exploredMilestones.every(m => m.subjectId === 's1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec nx run api:test -- --testPathPattern=milestone-detection
```

Expected: FAIL

- [ ] **Step 3: Implement milestone detection service**

```typescript
// apps/api/src/services/milestone-detection.ts
import { eq, and, isNull, desc } from 'drizzle-orm'; // [AR-1] isNull for celebratedAt, [AR-2] desc for ordering
import {
  milestones,
  coachingCardCache,
  learningModes,
  type Database,
} from '@eduagent/database';
import type { ProgressMetrics, MilestoneType } from '@eduagent/schemas';
import { captureException } from './sentry';

// Threshold arrays for each milestone type
export const VOCABULARY_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1000];
export const TOPIC_THRESHOLDS = [5, 10, 25, 50];
export const SESSION_THRESHOLDS = [10, 25, 50, 100, 250];
export const STREAK_THRESHOLDS = [7, 14, 30, 60, 100];
export const LEARNING_TIME_THRESHOLDS_MINUTES = [60, 300, 600, 1500, 3000, 6000]; // 1h, 5h, 10h, 25h, 50h, 100h
export const TOPICS_EXPLORED_THRESHOLDS = [5, 10, 25, 50, 100]; // FR234.6: dynamic books

interface MilestoneCandidate {
  milestoneType: MilestoneType;
  threshold: number;
  subjectId: string | null;
  bookId: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Detect milestones crossed by current metrics.
 * For each threshold crossed, attempts INSERT with ON CONFLICT DO NOTHING
 * so duplicates are silently skipped.
 */
export async function detectMilestones(
  db: Database,
  profileId: string,
  metrics: ProgressMetrics
): Promise<void> {
  const candidates: MilestoneCandidate[] = [];

  // Vocabulary count thresholds
  for (const t of VOCABULARY_THRESHOLDS) {
    if (metrics.vocabularyTotal >= t) {
      candidates.push({
        milestoneType: 'vocabulary_count',
        threshold: t,
        subjectId: null,
        bookId: null,
        metadata: { vocabularyTotal: metrics.vocabularyTotal },
      });
    }
  }

  // Topic mastered count thresholds
  for (const t of TOPIC_THRESHOLDS) {
    if (metrics.topicsMastered >= t) {
      candidates.push({
        milestoneType: 'topic_mastered_count',
        threshold: t,
        subjectId: null,
        bookId: null,
        metadata: { topicsMastered: metrics.topicsMastered },
      });
    }
  }

  // Session count thresholds
  for (const t of SESSION_THRESHOLDS) {
    if (metrics.totalSessions >= t) {
      candidates.push({
        milestoneType: 'session_count',
        threshold: t,
        subjectId: null,
        bookId: null,
        metadata: null,
      });
    }
  }

  // Streak length thresholds
  for (const t of STREAK_THRESHOLDS) {
    if (metrics.currentStreak >= t) {
      candidates.push({
        milestoneType: 'streak_length',
        threshold: t,
        subjectId: null,
        bookId: null,
        metadata: null,
      });
    }
  }

  // Learning time thresholds (based on total active minutes)
  for (const t of LEARNING_TIME_THRESHOLDS_MINUTES) {
    if (metrics.totalActiveMinutes >= t) {
      candidates.push({
        milestoneType: 'learning_time',
        threshold: t,
        subjectId: null,
        bookId: null,
        metadata: { totalMinutes: metrics.totalActiveMinutes },
      });
    }
  }

  // Per-subject milestones: subject_mastered (pre-generated topics only — FR234.6)
  // book_completed and subject_mastered apply ONLY to pre-generated topic sets.
  // Session-filed subjects use topics_explored milestones instead.
  for (const subj of metrics.subjects) {
    // subject_mastered: only when ALL pre-generated topics are mastered (AD7)
    if (
      subj.topicsTotal > 0 &&
      subj.topicsMastered >= subj.topicsTotal
    ) {
      candidates.push({
        milestoneType: 'subject_mastered',
        threshold: subj.topicsTotal,
        subjectId: subj.subjectId,
        bookId: null,
        metadata: { subjectName: subj.subjectName },
      });
    }

    // topics_explored: milestone for session-filed/dynamic books (FR234.6)
    // [F-4] JSONB backward compat: old snapshots lack topicsExplored
    const explored = subj.topicsExplored ?? 0;
    for (const t of TOPICS_EXPLORED_THRESHOLDS) {
      if (explored >= t) {
        candidates.push({
          milestoneType: 'topics_explored',
          threshold: t,
          subjectId: subj.subjectId,
          bookId: null,
          metadata: { subjectName: subj.subjectName, topicsExplored: explored },
        });
      }
    }
  }

  // [AR-5] TODO — Phase D stretch: book_completed and cefr_level_up
  // book_completed: restricted to pre-generated topics (FR234.6), requires per-book tracking
  // cefr_level_up: requires CEFR proficiency estimation integrated into snapshot aggregation
  // Do NOT remove from milestoneTypeSchema — they are forward-declared for schema stability.

  // Insert all candidates with ON CONFLICT DO NOTHING
  for (const candidate of candidates) {
    try {
      await db
        .insert(milestones)
        .values({
          profileId,
          milestoneType: candidate.milestoneType,
          threshold: candidate.threshold,
          subjectId: candidate.subjectId,
          bookId: candidate.bookId,
          metadata: candidate.metadata,
        })
        .onConflictDoNothing();
    } catch (err) {
      // Log but don't abort — one failed milestone shouldn't block others
      captureException(err, { profileId, milestone: candidate.milestoneType });
    }
  }
}

/**
 * Get uncelebrated milestones for a profile, respecting celebrationLevel.
 */
// [AR-1] FIXED: Must use isNull(), not eq() with null.
// eq(column, null) generates `column = NULL` which NEVER matches in SQL.
export async function getUncelebratedMilestones(
  db: Database,
  profileId: string
): Promise<Array<typeof milestones.$inferSelect>> {
  return db
    .select()
    .from(milestones)
    .where(
      and(
        eq(milestones.profileId, profileId),
        isNull(milestones.celebratedAt)
      )
    );
}

/**
 * Mark a milestone as celebrated.
 */
export async function markMilestoneCelebrated(
  db: Database,
  milestoneId: string
): Promise<void> {
  await db
    .update(milestones)
    .set({ celebratedAt: new Date() })
    .where(eq(milestones.id, milestoneId));
}

/**
 * Get the most recent N milestones for a profile (for the progress screen).
 */
// [AR-2] FIXED: Must use desc() — ascending returns oldest, not most recent.
export async function getRecentMilestones(
  db: Database,
  profileId: string,
  limit = 5
): Promise<Array<typeof milestones.$inferSelect>> {
  return db
    .select()
    .from(milestones)
    .where(eq(milestones.profileId, profileId))
    .orderBy(desc(milestones.createdAt))
    .limit(limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec nx run api:test -- --testPathPattern=milestone-detection
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/milestone-detection.ts apps/api/src/services/milestone-detection.test.ts
git commit -m "feat(api): add milestone detection service [EP-15, FR234]"
```

---

### Task 6: Session-Complete Hook + Manual Refresh Endpoint

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts`
- Create: `apps/api/src/routes/snapshot-progress.ts`
- Create: `apps/api/src/routes/snapshot-progress.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add snapshot refresh step to session-completed**

**Ordering constraint (FR241.1, AD6):** This step MUST be placed at **position 5** in the shared post-session Inngest chain — AFTER post-session filing (position 3) and learner profile analysis (position 4), but **BEFORE** coaching card precomputation (position 6). This ordering is critical: `detectMilestones` writes milestone rows that coaching card precomputation reads via `getUncelebratedMilestones`. If snapshot refresh runs after coaching cards, new milestones won't appear until the next session.

```
Chain positions:  ...3 (filing) → 4 (memory) → **5 (this step)** → 6 (coaching cards) → 7 (suggestions)
```

Insert this step **before** the existing `write-coaching-card` step [AR2-14] (originally referenced as `queue-celebrations` — corrected to match actual step name in session-completed.ts):

```typescript
// In session-completed.ts — add import
import { computeProgressSnapshot, upsertSnapshot, getLatestSnapshot } from '../../services/snapshot-aggregation';
import { detectMilestones } from '../../services/milestone-detection';

// Insert BEFORE the coaching card precomputation step (position 5 per AD6):
outcomes.push(
  await step.run('refresh-progress-snapshot', async () =>
    runIsolated('refresh-progress-snapshot', profileId, async () => {
      const db = getStepDatabase();

      // [AR-13] FIXED: Debounce must compare session endedAt against snapshot updatedAt,
      // not just check recency. A snapshot from the daily cron (03:00 UTC) that's
      // <5min old should NOT suppress a refresh for a session that completed at 03:04.
      const latest = await getLatestSnapshot(db, profileId);
      const sessionEndedAt = event.data.endedAt ? new Date(event.data.endedAt) : null;
      if (latest?.updatedAt && sessionEndedAt) {
        // Skip only if the latest snapshot was computed AFTER this session ended
        if (latest.updatedAt > sessionEndedAt) {
          return; // snapshot already includes this session's data
        }
      } else if (latest?.updatedAt) {
        // Fallback: simple time-based debounce if no endedAt available
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (latest.updatedAt > fiveMinutesAgo) {
          return; // debounced
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const metrics = await computeProgressSnapshot(db, profileId);
      await upsertSnapshot(db, profileId, today, metrics);

      // FR241.3: Run milestone detection after snapshot
      await detectMilestones(db, profileId, metrics);
    })
  )
);
```

- [ ] **Step 2: Create snapshot progress routes with manual refresh**

```typescript
// apps/api/src/routes/snapshot-progress.ts
import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  computeProgressSnapshot,
  upsertSnapshot,
  getLatestSnapshot,
  getSnapshotsInRange,
} from '../services/snapshot-aggregation';
import { getRecentMilestones } from '../services/milestone-detection';
import { detectMilestones } from '../services/milestone-detection';
import {
  familyLinks,
  vocabulary,
  vocabularyRetentionCards,
  retentionCards,              // [AR2-12] needed for countRetentionCardsDue
  assessments,                 // [AR2-12] needed for countRetentionCardsDue subject join
  progressSnapshots,
  notificationLog,            // [F-2] needed for logRefresh() rate-limit tracking
} from '@eduagent/database';
import { eq, and, gte, lte, desc, sql, count } from 'drizzle-orm'; // [AR2-12] added sql, count
import type {
  KnowledgeInventory,
  ProgressHistory,
  ProgressDataPoint,
  ProgressMetrics,
  SubjectInventory,
} from '@eduagent/schemas';

type Env = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

// [AR-3] FIXED: In-memory Map is useless on CF Workers (stateless isolates).
// Use DB-backed rate limiting via notificationLog, matching existing patterns
// in notifications.ts (getRecentNotificationCount).
// [AR2-2] FIXED: Function lives in settings.ts, not notifications.ts.
import { getRecentNotificationCount } from '../services/settings';

const REFRESH_RATE_LIMIT = 10; // max refreshes per hour

// NOTE: 'progress_refresh' must be added to notificationTypeEnum (Task 1, Step 3)
// and to NotificationPayload type (Task 11, Step 4) for this to compile without casts.
async function checkRateLimit(db: Database, profileId: string): Promise<boolean> {
  const recentCount = await getRecentNotificationCount(
    db, profileId, 'progress_refresh', 1 // last 1 hour
  );
  return recentCount < REFRESH_RATE_LIMIT;
}

async function logRefresh(db: Database, profileId: string): Promise<void> {
  await db.insert(notificationLog).values({
    profileId,
    type: 'progress_refresh',
    sentAt: new Date(),
  });
}

export const snapshotProgressRoutes = new Hono<Env>()
  // FR231.6: Manual refresh — [AR-3] DB-backed rate limit
  .post('/progress/refresh', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    if (!(await checkRateLimit(db, profileId))) {
      return c.json({ code: 'RATE_LIMITED', message: 'Max 10 refreshes per hour' }, 429);
    }

    const today = new Date().toISOString().slice(0, 10);
    const metrics = await computeProgressSnapshot(db, profileId);
    await upsertSnapshot(db, profileId, today, metrics);
    await detectMilestones(db, profileId, metrics);
    await logRefresh(db, profileId); // Track for rate limiting

    return c.json({
      snapshotDate: today,
      refreshedAt: new Date().toISOString(),
    });
  })

  // FR232: Knowledge inventory
  .get('/progress/inventory', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const inventory = await buildInventory(db, profileId);
    return c.json(inventory);
  })

  // FR233: Progress history
  .get('/progress/history', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const from = c.req.query('from') ?? getDefaultFrom();
    const to = c.req.query('to') ?? new Date().toISOString().slice(0, 10);
    const granularity = (c.req.query('granularity') ?? 'daily') as 'daily' | 'weekly';

    // Validate range <= 365 days
    const daysDiff = Math.ceil(
      (new Date(to).getTime() - new Date(from).getTime()) / 86400000
    );
    if (daysDiff > 365) {
      return c.json({ code: 'INVALID_RANGE', message: 'Maximum range is 365 days' }, 400);
    }

    const history = await buildHistory(db, profileId, from, to, granularity);
    return c.json(history);
  })

  // Milestones list (last N)
  .get('/progress/milestones', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const limit = Math.min(Number(c.req.query('limit') ?? '5'), 50);

    const items = await getRecentMilestones(db, profileId, limit);
    return c.json({ milestones: items });
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

async function buildInventory(
  db: Database,
  profileId: string
): Promise<KnowledgeInventory> {
  const snapshot = await getLatestSnapshot(db, profileId);
  const metrics: ProgressMetrics = snapshot
    ? (snapshot.metrics as ProgressMetrics)
    : emptyMetrics();

  const today = new Date().toISOString().slice(0, 10);

  // Build per-subject inventory with vocabulary CEFR breakdown
  const subjects: SubjectInventory[] = await Promise.all(
    metrics.subjects.map(async (subj) => {
      // CEFR breakdown for language subjects
      let byCefrLevel: Record<string, number> = {};
      let estimatedProficiency: string | null = null;

      if (subj.pedagogyMode === 'four_strands' && subj.vocabularyTotal > 0) {
        const cefrRows = await db
          .select({
            cefrLevel: vocabulary.cefrLevel,
            count: count(vocabulary.id), // [AR2-6] FIXED: db.$count() not valid Drizzle select expr
          })
          .from(vocabulary)
          .where(
            and(
              eq(vocabulary.profileId, profileId),
              eq(vocabulary.subjectId, subj.subjectId)
            )
          )
          .groupBy(vocabulary.cefrLevel);

        for (const row of cefrRows) {
          if (row.cefrLevel) {
            byCefrLevel[row.cefrLevel] = Number(row.count);
          }
        }

        // [AR-10] Estimate proficiency from mastered count (CEFR breakdown available for future use)
        estimatedProficiency = estimateProficiency(subj.vocabularyMastered, subj.vocabularyTotal);
      }

      // FR235.8, AD7: total is null for pure session-filed subjects (no pre-generated topics)
      // [F-4] JSONB backward compat: old snapshots lack topicsExplored — default to 0
      const explored = subj.topicsExplored ?? 0;
      const hasPreGenerated = subj.topicsTotal > 0;
      return {
        subjectId: subj.subjectId,
        subjectName: subj.subjectName,
        pedagogyMode: subj.pedagogyMode,
        topics: {
          total: hasPreGenerated ? subj.topicsTotal : null,
          explored,
          mastered: subj.topicsMastered,
          inProgress: subj.topicsAttempted - subj.topicsMastered,
          notStarted: hasPreGenerated ? Math.max(0, subj.topicsTotal - subj.topicsAttempted) : 0,
        },
        vocabulary: {
          total: subj.vocabularyTotal,
          mastered: subj.vocabularyMastered,
          learning: Math.max(0, subj.vocabularyTotal - subj.vocabularyMastered),
          new: 0,
          byCefrLevel,
        },
        estimatedProficiency,
        // [SA-4] FR236.4/UX-6: Kid-friendly proficiency label
        proficiencyLabel: estimatedProficiency
          ? getProficiencyLabel(estimatedProficiency)
          : null,
        // [SA-1] FR235.9: Per-subject review-due count for Review CTA
        // [AR2-8] Uses COUNT(DISTINCT) to prevent double-counting with multiple assessments
        retentionCardsDue: await countRetentionCardsDue(db, profileId, subj.subjectId),
        lastSessionAt: subj.lastSessionAt,
        activeMinutes: subj.activeMinutes,
      };
    })
  );

  return {
    profileId,
    snapshotDate: snapshot?.snapshotDate ?? today,
    global: {
      topicsAttempted: metrics.topicsAttempted,
      topicsMastered: metrics.topicsMastered,
      vocabularyTotal: metrics.vocabularyTotal,
      vocabularyMastered: metrics.vocabularyMastered,
      totalSessions: metrics.totalSessions,
      totalActiveMinutes: metrics.totalActiveMinutes,
      currentStreak: metrics.currentStreak,
      longestStreak: metrics.longestStreak,
    },
    subjects,
  };
}

// [AR-10] FIXED: Removed unused byCefrLevel parameter. The function only uses
// totalMastered for a volume-based heuristic. If CEFR distribution is needed
// for a more accurate estimate, add it in a follow-up with actual logic.
// [AR2-15] NOTE: These thresholds are a rough volume-based heuristic, NOT aligned
// with CEFR's actual criteria (which include grammar, comprehension, production).
// Suitable as a motivational indicator; should NOT be presented as an official
// proficiency assessment. Plan to refine with language pedagogy research.
function estimateProficiency(
  totalMastered: number,
  totalVocab: number
): string | null {
  if (totalVocab === 0) return null;
  if (totalMastered >= 500) return 'B2';
  if (totalMastered >= 250) return 'B1';
  if (totalMastered >= 100) return 'A2';
  if (totalMastered >= 25) return 'A1';
  return null;
}

// [SA-4] FR236.4/UX-6: Kid-friendly proficiency labels alongside CEFR codes
function getProficiencyLabel(cefrCode: string): string {
  const labels: Record<string, string> = {
    'A1': 'Beginner — you can name things and say simple sentences',
    'A2': 'Elementary — you can have basic conversations',
    'B1': 'Intermediate — you can handle most everyday situations',
    'B2': 'Upper Intermediate — you can discuss complex topics',
  };
  return labels[cefrCode] ?? cefrCode;
}

// [SA-1] FR235.9: Count retention cards due for review per subject
// [AR2-8] FIXED: Use COUNT(DISTINCT) to prevent double-counting when a topic
// has multiple assessment records (e.g., failed → retried → passed).
async function countRetentionCardsDue(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${retentionCards.id})` })
    .from(retentionCards)
    .innerJoin(assessments, eq(retentionCards.topicId, assessments.topicId))
    .where(
      and(
        eq(retentionCards.profileId, profileId),
        eq(assessments.subjectId, subjectId),
        lte(retentionCards.nextReviewAt, sql`NOW()`)
      )
    );
  return Number(result[0]?.count ?? 0);
}

function emptyMetrics(): ProgressMetrics {
  return {
    totalSessions: 0, totalActiveMinutes: 0, totalWallClockMinutes: 0,
    totalExchanges: 0, topicsAttempted: 0, topicsMastered: 0,
    topicsInProgress: 0, vocabularyTotal: 0, vocabularyMastered: 0,
    vocabularyLearning: 0, vocabularyNew: 0, retentionCardsDue: 0,
    retentionCardsStrong: 0, retentionCardsFading: 0,
    currentStreak: 0, longestStreak: 0, subjects: [],
  };
}

// [F-8] Helper: sum topicsExplored across subjects (with JSONB backward compat)
function sumExplored(m: ProgressMetrics): number {
  return m.subjects.reduce((sum, s) => sum + (s.topicsExplored ?? 0), 0);
}

async function buildHistory(
  db: Database,
  profileId: string,
  from: string,
  to: string,
  granularity: 'daily' | 'weekly'
): Promise<ProgressHistory> {
  const snapshots = await getSnapshotsInRange(db, profileId, from, to);

  let dataPoints: ProgressDataPoint[];

  if (granularity === 'daily') {
    dataPoints = snapshots.map((s) => {
      const m = s.metrics as ProgressMetrics;
      return {
        date: s.snapshotDate,
        topicsMastered: m.topicsMastered,
        topicsAttempted: m.topicsAttempted,
        topicsExplored: sumExplored(m),
        vocabularyTotal: m.vocabularyTotal,
        vocabularyMastered: m.vocabularyMastered,
        totalSessions: m.totalSessions,
        totalActiveMinutes: m.totalActiveMinutes,
        currentStreak: m.currentStreak,
      };
    });
  } else {
    // Weekly: group by Monday-anchored week, take last snapshot of each week
    const weekMap = new Map<string, ProgressDataPoint>();
    for (const s of snapshots) {
      const d = new Date(s.snapshotDate);
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const weekKey = monday.toISOString().slice(0, 10);

      const m = s.metrics as ProgressMetrics;
      weekMap.set(weekKey, {
        date: weekKey,
        topicsMastered: m.topicsMastered,
        topicsAttempted: m.topicsAttempted,
        topicsExplored: sumExplored(m),
        vocabularyTotal: m.vocabularyTotal,
        vocabularyMastered: m.vocabularyMastered,
        totalSessions: m.totalSessions,
        totalActiveMinutes: m.totalActiveMinutes,
        currentStreak: m.currentStreak,
      });
    }
    dataPoints = Array.from(weekMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }

  return { profileId, from, to, granularity, dataPoints };
}
```

- [ ] **Step 3: Register route in API index**

In `apps/api/src/index.ts`, add import and registration:

```typescript
import { snapshotProgressRoutes } from './routes/snapshot-progress';

// In the routes chain:
const routes = api
  // ... existing routes ...
  .route('/', snapshotProgressRoutes)
  // ... rest ...
```

- [ ] **Step 4: Write route integration tests**

Test file `apps/api/src/routes/snapshot-progress.test.ts` with tests for:
- `POST /v1/progress/refresh` — returns 200 with snapshotDate
- `GET /v1/progress/inventory` — returns inventory with subjects
- `GET /v1/progress/history?from=...&to=...` — returns data points
- `GET /v1/progress/milestones` — returns milestone list
- Rate limiting on refresh endpoint (11th call returns 429)
- Empty state for new users (returns zeros, not errors)

- [ ] **Step 5: Run tests**

```bash
pnpm exec nx run api:test -- --testPathPattern=snapshot-progress
```

- [ ] **Step 6: Typecheck**

```bash
pnpm exec nx run api:typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/snapshot-progress.ts apps/api/src/routes/snapshot-progress.test.ts apps/api/src/inngest/functions/session-completed.ts apps/api/src/index.ts
git commit -m "feat(api): add progress inventory, history, refresh endpoints + session-complete hook [EP-15, FR231-233, FR241, FR241.5]"
```

---

### Task 7: Parent Access Endpoints

**Files:**
- Modify: `apps/api/src/routes/dashboard.ts`
- Modify: `apps/api/src/services/dashboard.ts`

- [ ] **Step 1: Add parent-facing inventory, history, and reports routes**

In `apps/api/src/routes/dashboard.ts`, add new endpoints:

```typescript
// Parent access to child's inventory — FR232.4
.get('/dashboard/children/:profileId/inventory', async (c) => {
  const db = c.get('db');
  const parentProfileId = requireProfileId(c.get('profileId'));
  const childProfileId = c.req.param('profileId');

  // Verify parent-child link
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
    ),
  });
  if (!link) return c.json({ code: 'FORBIDDEN', message: 'Not your child' }, 403);

  const inventory = await buildInventory(db, childProfileId);
  return c.json(inventory);
})

// Parent access to child's progress history — FR233.5
.get('/dashboard/children/:profileId/progress-history', async (c) => {
  const db = c.get('db');
  const parentProfileId = requireProfileId(c.get('profileId'));
  const childProfileId = c.req.param('profileId');

  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
    ),
  });
  if (!link) return c.json({ code: 'FORBIDDEN', message: 'Not your child' }, 403);

  const from = c.req.query('from') ?? getDefaultFrom();
  const to = c.req.query('to') ?? new Date().toISOString().slice(0, 10);
  const granularity = (c.req.query('granularity') ?? 'daily') as 'daily' | 'weekly';

  const history = await buildHistory(db, childProfileId, from, to, granularity);
  return c.json(history);
})

// Monthly reports list — FR240.5
.get('/dashboard/children/:profileId/reports', async (c) => {
  const db = c.get('db');
  const parentProfileId = requireProfileId(c.get('profileId'));
  const childProfileId = c.req.param('profileId');

  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
    ),
  });
  if (!link) return c.json({ code: 'FORBIDDEN', message: 'Not your child' }, 403);

  const reports = await db
    .select()
    .from(monthlyReports)
    .where(
      and(
        eq(monthlyReports.profileId, parentProfileId),
        eq(monthlyReports.childProfileId, childProfileId)
      )
    )
    .orderBy(desc(monthlyReports.reportMonth));

  return c.json({ reports });
})

// Single report detail — FR240.5
.get('/dashboard/children/:profileId/reports/:reportId', async (c) => {
  const db = c.get('db');
  const parentProfileId = requireProfileId(c.get('profileId'));
  const childProfileId = c.req.param('profileId');
  const reportId = c.req.param('reportId');

  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
    ),
  });
  if (!link) return c.json({ code: 'FORBIDDEN', message: 'Not your child' }, 403);

  const report = await db.query.monthlyReports.findFirst({
    where: and(
      eq(monthlyReports.id, reportId),
      eq(monthlyReports.profileId, parentProfileId),
      eq(monthlyReports.childProfileId, childProfileId)
    ),
  });
  if (!report) return c.json({ code: 'NOT_FOUND', message: 'Report not found' }, 404);

  // Mark as viewed on first access
  if (!report.viewedAt) {
    await db
      .update(monthlyReports)
      .set({ viewedAt: new Date() })
      .where(eq(monthlyReports.id, reportId));
  }

  return c.json({ report });
})
```

Note: Import `buildInventory`, `buildHistory`, `getDefaultFrom` from the snapshot-progress routes file, or extract them into the service layer. Prefer extracting into `apps/api/src/services/snapshot-aggregation.ts` so both route files can share them.

- [ ] **Step 2: Extend dashboard service with progress fields — FR238**

In `apps/api/src/services/dashboard.ts`, modify `getChildrenForParent` to include progress data from the latest snapshot + 7-day-old snapshot for deltas.

Add progress fields to the return type:

```typescript
// Additional fields per child in getChildrenForParent:
progress: {
  topicsMastered: number;
  topicsAttempted: number;
  topicsTotal: number;
  vocabularyTotal: number;
  vocabularyMastered: number;
  topicsMasteredDelta: number | null;
  vocabularyDelta: number | null;
  engagementTrend: 'increasing' | 'stable' | 'declining';
} | null;
```

Query the latest snapshot + snapshot from ~7 days ago for each child. Compute deltas.

- [ ] **Step 3: Write tests for parent access**

Test parent-child link verification (403 on unauthorized), inventory response, progress-history, and reports endpoints.

- [ ] **Step 4: Run tests**

```bash
pnpm exec nx run api:test -- --testPathPattern="dashboard|snapshot-progress"
```

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm exec nx run api:typecheck && pnpm exec nx run api:lint
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/dashboard.ts apps/api/src/services/dashboard.ts apps/api/src/services/snapshot-aggregation.ts
git commit -m "feat(api): add parent access to inventory, history, reports + dashboard progress fields [EP-15, FR232.4, FR233.5, FR238]"
```

---

## Phase B — Child-Facing Progress

### Task 8: Progress Tab + My Learning Journey Screen

**Files:**
- Create: `apps/mobile/src/app/(app)/progress.tsx`
- Create: `apps/mobile/src/app/(app)/progress.test.tsx`
- Create: `apps/mobile/src/hooks/use-progress.ts`
- Create: `apps/mobile/src/components/progress/SubjectCard.tsx`
- Create: `apps/mobile/src/components/progress/ProgressBar.tsx`
- Create: `apps/mobile/src/components/progress/GrowthChart.tsx`
- Create: `apps/mobile/src/components/progress/MilestoneCard.tsx`
- Modify: `apps/mobile/src/app/(app)/_layout.tsx`

- [ ] **Step 1: Create React Query hooks for progress endpoints**

```typescript
// apps/mobile/src/hooks/use-progress.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';

export function useInventory() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['progress', 'inventory'],
    queryFn: async () => {
      const res = await client.progress.inventory.$get();
      if (!res.ok) throw new Error('Failed to load progress');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

export function useProgressHistory(weeks = 8) {
  const client = useApiClient();
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - weeks * 7 * 86400000)
    .toISOString()
    .slice(0, 10);

  return useQuery({
    queryKey: ['progress', 'history', from, to],
    queryFn: async () => {
      const res = await client.progress.history.$get({
        query: { from, to, granularity: 'weekly' },
      });
      if (!res.ok) throw new Error('Failed to load history');
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useMilestones(limit = 5) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['progress', 'milestones', limit],
    queryFn: async () => {
      const res = await client.progress.milestones.$get({
        query: { limit: String(limit) },
      });
      if (!res.ok) throw new Error('Failed to load milestones');
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useRefreshProgress() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await client.progress.refresh.$post();
      if (!res.ok) throw new Error('Failed to refresh');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}
```

- [ ] **Step 2: Create reusable progress components**

Create `ProgressBar.tsx` — a simple fill bar with color coding (green, teal, grey, orange):

```typescript
// apps/mobile/src/components/progress/ProgressBar.tsx
import { View } from 'react-native';
import { useThemeColors } from '../../lib/theme';

interface ProgressBarProps {
  value: number;    // numerator (e.g. mastered topics)
  total: number;    // denominator (e.g. total topics)
  color?: 'green' | 'teal' | 'orange';
}

export function ProgressBar({ value, total, color = 'teal' }: ProgressBarProps) {
  const colors = useThemeColors();
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;

  const barColor =
    color === 'green' ? colors.success :
    color === 'orange' ? colors.warning :
    colors.accent;

  return (
    <View
      className="h-2 rounded-full bg-surface-elevated overflow-hidden"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: value }}
    >
      <View
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: barColor }}
      />
    </View>
  );
}
```

Create `SubjectCard.tsx`, `GrowthChart.tsx`, `MilestoneCard.tsx` similarly — each a focused presentational component.

- [ ] **Step 3: Create My Learning Journey screen**

```typescript
// apps/mobile/src/app/(app)/progress.tsx
import React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import { useInventory, useProgressHistory, useMilestones } from '../../hooks/use-progress';
import { ProgressBar } from '../../components/progress/ProgressBar';
import { GrowthChart } from '../../components/progress/GrowthChart';
import { MilestoneCard } from '../../components/progress/MilestoneCard';

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const router = useRouter();
  const inventory = useInventory();
  const history = useProgressHistory(8);
  const milestoneQuery = useMilestones(5);

  // Loading state
  if (inventory.isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Error state
  if (inventory.isError) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-text-secondary text-body mb-4">
          Couldn't load your progress
        </Text>
        <Pressable
          onPress={() => inventory.refetch()}
          className="bg-primary rounded-button py-3 px-6"
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <Text className="text-text-inverse font-semibold">Retry</Text>
        </Pressable>
      </View>
    );
  }

  const data = inventory.data;

  // Empty state (new user)
  if (!data || data.global.totalSessions === 0) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-h2 font-bold text-text-primary mb-2 text-center">
          My Learning Journey
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          Start your first session and watch your progress grow here!
        </Text>
        <Pressable
          onPress={() => router.push('/(app)/home')}
          className="bg-primary rounded-button py-3.5 px-8"
          accessibilityRole="button"
          testID="start-learning-button"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Start learning
          </Text>
        </Pressable>
      </View>
    );
  }

  // Hero stat logic — FR235.3 + [UX-5] beginner threshold
  const hasLanguage = data.subjects.some(s => s.pedagogyMode === 'four_strands');
  const hasNonLanguage = data.subjects.some(s => s.pedagogyMode === 'socratic');
  const BEGINNER_THRESHOLD = 20;

  let heroText: string;
  if (hasLanguage && hasNonLanguage) {
    const topicsPart = data.global.topicsMastered < BEGINNER_THRESHOLD
      ? `${data.global.topicsMastered} topics and counting`
      : `mastered ${data.global.topicsMastered} topics`;
    const wordsPart = data.global.vocabularyTotal < BEGINNER_THRESHOLD
      ? `${data.global.vocabularyTotal} words and counting`
      : `know ${data.global.vocabularyTotal} words`;
    heroText = `You've ${topicsPart} and ${wordsPart}`;
  } else if (hasLanguage) {
    heroText = data.global.vocabularyTotal < BEGINNER_THRESHOLD
      ? `You've started learning! ${data.global.vocabularyTotal} words and counting...`
      : `You know ${data.global.vocabularyTotal} words`;
  } else {
    heroText = data.global.topicsMastered < BEGINNER_THRESHOLD
      ? `You're building your knowledge! ${data.global.topicsMastered} topics and counting...`
      : `You've mastered ${data.global.topicsMastered} topics`;
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
      testID="progress-screen"
    >
      {/* Header */}
      <Text className="text-h1 font-bold text-text-primary px-5 mb-4">
        My Learning Journey
      </Text>

      {/* Hero stat */}
      <View className="mx-5 mb-6 p-5 bg-surface-elevated rounded-card">
        <Text className="text-h2 font-bold text-text-primary text-center">
          {heroText}
        </Text>
      </View>

      {/* Subject cards */}
      <Text className="text-label uppercase text-text-secondary px-5 mb-3">
        Your Subjects
      </Text>
      {data.subjects.map((subj) => (
        <Pressable
          key={subj.subjectId}
          onPress={() => router.push(`/(app)/progress/${subj.subjectId}`)}
          className="mx-5 mb-3 p-4 bg-surface-elevated rounded-card"
          testID={`subject-card-${subj.subjectId}`}
          accessibilityRole="button"
        >
          <Text className="text-body font-semibold text-text-primary mb-1">
            {subj.subjectName}
          </Text>
          {/* FR235.8: Conditional fill bar — only when pre-generated denominator exists */}
          {subj.topics.total != null && (
            <ProgressBar
              value={subj.topics.mastered}
              total={subj.topics.total}
              color="teal"
            />
          )}
          {/* [UX-10] Simplified topic display — no implementation details on summary cards */}
          <Text className="text-caption text-text-secondary mt-1">
            {subj.pedagogyMode === 'four_strands'
              ? `${subj.vocabulary.total} words`
              : subj.topics.total != null
                ? `${subj.topics.mastered + (subj.topics.explored ?? 0)} topics explored`
                : `${subj.topics.explored} topics explored`}
            {' · '}
            {subj.activeMinutes} min
          </Text>
          {/* [UX-3] Forward-momentum CTA — [SA-1] FR235.9: three-way (Review/Continue/Explore) */}
          <Text className="text-caption font-semibold mt-2" style={{ color: colors.accent }}>
            {subj.retentionCardsDue > 0
              ? 'Review →'
              : subj.topics.notStarted > 0
                ? 'Continue →'
                : 'Explore →'}
          </Text>
        </Pressable>
      ))}

      {/* [UX-13] Growth chart — adaptive window */}
      {history.data && history.data.dataPoints.length >= 2 && (
        <>
          <Text className="text-label uppercase text-text-secondary px-5 mt-4 mb-3">
            Your Growth
          </Text>
          <View className="mx-5 mb-4">
            <GrowthChart
              dataPoints={history.data.dataPoints}
              hasLanguage={hasLanguage}
              // [UX-13] Chart adapts to data span — minimum 4-week view
              maxWeeks={Math.max(4, history.data.dataPoints.length)}
            />
          </View>
        </>
      )}
      {/* [UX-13] Near-empty state: < 2 data points → narrative instead of chart */}
      {history.data && history.data.dataPoints.length > 0 && history.data.dataPoints.length < 2 && (
        <View className="mx-5 mb-4 p-4 bg-surface-elevated rounded-card">
          <Text className="text-body text-text-secondary text-center">
            You started learning recently — keep going and watch your growth appear here!
          </Text>
        </View>
      )}

      {/* Recent milestones */}
      {milestoneQuery.data && milestoneQuery.data.milestones.length > 0 && (
        <>
          <Text className="text-label uppercase text-text-secondary px-5 mt-2 mb-3">
            Recent Milestones
          </Text>
          {milestoneQuery.data.milestones.map((m) => (
            <MilestoneCard key={m.id} milestone={m} />
          ))}
          {/* [UX-12] View all milestones link */}
          {milestoneQuery.data.milestones.length >= 5 && (
            <Pressable
              onPress={() => router.push('/(app)/progress/milestones')}
              className="px-5 py-2"
              accessibilityRole="link"
            >
              <Text className="text-caption font-semibold" style={{ color: colors.accent }}>
                View all milestones →
              </Text>
            </Pressable>
          )}
        </>
      )}

      {/* [UX-3] Global forward-momentum CTA — [SA-1] FR235.9: smart routing */}
      {/* Priority: review-due subject → least-recently-practiced subject → home */}
      <Pressable
        onPress={() => {
          const reviewSubject = data.subjects.find(s => s.retentionCardsDue > 0);
          if (reviewSubject) {
            router.push(`/(app)/learn/${reviewSubject.subjectId}/review`);
          } else {
            const leastRecent = [...data.subjects]
              .filter(s => s.lastSessionAt)
              .sort((a, b) => (a.lastSessionAt ?? '').localeCompare(b.lastSessionAt ?? ''))[0];
            if (leastRecent) {
              router.push(`/(app)/learn/${leastRecent.subjectId}`);
            } else {
              router.push('/(app)/home');
            }
          }
        }}
        className="mx-5 mt-6 mb-4 py-3.5 bg-primary rounded-button items-center"
        accessibilityRole="button"
        testID="keep-learning-button"
      >
        <Text className="text-body font-semibold text-text-inverse">
          Keep learning
        </Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Add Progress tab to learner layout**

In `apps/mobile/src/app/(app)/_layout.tsx`:

1. Add to `iconMap`:
```typescript
Progress: { focused: 'stats-chart', default: 'stats-chart-outline' },
```

2. Add a new `<Tabs.Screen>` between Library and More:
```typescript
<Tabs.Screen
  name="progress"
  options={{
    title: 'Progress',
    headerShown: false,
    tabBarIcon: ({ focused }) => (
      <TabIcon name="Progress" focused={focused} />
    ),
  }}
/>
```

- [ ] **Step 5: Write tests for the progress screen**

Test in `apps/mobile/src/app/(app)/progress.test.tsx`:
- Empty state renders start button
- Populated state renders hero stat, subject cards, growth chart
- Subject card tap navigates to subject detail
- Error state renders retry button
- [SA-1] Review CTA shown when `retentionCardsDue > 0`; Continue when `notStarted > 0`; Explore otherwise
- [SA-1] "Keep learning" button routes to review subject when review-due, otherwise least-recent
- [UX-5] Beginner threshold: count < 20 shows "and counting..." framing

- [ ] **Step 5a [SA-2]: Create vocabulary browser screen (FR235.10 / UX-15)**

Create `apps/mobile/src/app/(app)/progress/vocabulary.tsx`:

- Receives `subjectId` as a query param (or shows all subjects if none).
- Calls a new React Query hook `useVocabularyBrowser(subjectId)` that fetches `GET /v1/subjects/:subjectId/vocabulary` (existing endpoint).
- Groups vocabulary items by CEFR level (A1, A2, B1, B2).
- Each group shows: level header with kid-friendly label (from `getProficiencyLabel`), word count, and a flat list of vocabulary items with mastery status (green dot = mastered, teal dot = learning, grey = new).
- Add `useVocabularyBrowser` hook to `apps/mobile/src/hooks/use-progress.ts`.
- Empty state: "Keep learning and your vocabulary will grow here!"

On the journey screen (progress.tsx), make the vocabulary count in the hero stat and subject cards tappable:

```typescript
// In hero stat — wrap in Pressable for language learners:
<Pressable onPress={() => router.push('/(app)/progress/vocabulary')}>
  <Text>... {data.global.vocabularyTotal} words ...</Text>
</Pressable>
```

- [ ] **Step 5b [SA-3]: Create milestones list screen (UX-12)**

Create `apps/mobile/src/app/(app)/progress/milestones.tsx`:

- Full milestones collection using `useMilestones(50)`.
- Grouped chronologically (most recent first) or by type (vocabulary, streaks, topics).
- Each item renders using the existing `MilestoneCard` component.
- Empty state: "Complete sessions to earn milestones!"
- Header: "All Milestones" with back button.
- No new API endpoint needed — reuses `GET /v1/progress/milestones?limit=50`.

- [ ] **Step 6: Run mobile tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress.tsx --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/app/\(app\)/progress.tsx apps/mobile/src/app/\(app\)/progress.test.tsx apps/mobile/src/hooks/use-progress.ts apps/mobile/src/components/progress/ apps/mobile/src/app/\(learner\)/_layout.tsx
git commit -m "feat(mobile): add My Learning Journey screen with Progress tab [EP-15, FR235]"
```

---

### Task 9: Subject Progress Detail Screen

**Files:**
- Create: `apps/mobile/src/app/(app)/progress/_layout.tsx`
- Create: `apps/mobile/src/app/(app)/progress/[subjectId].tsx`
- Create: `apps/mobile/src/app/(app)/progress/[subjectId].test.tsx`

- [ ] **Step 1: Create progress stack layout**

```typescript
// apps/mobile/src/app/(app)/progress/_layout.tsx
import { Stack } from 'expo-router';

export default function ProgressLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Create Subject Progress Detail screen**

`apps/mobile/src/app/(app)/progress/[subjectId].tsx`:

Screen shows:
- Back button + subject name header
- Topic list with color-coded progress bars (green/teal/grey/orange per FR236.3)
- Vocabulary by CEFR level (language subjects only, hidden for non-language)
- Time spent (this week + total from snapshot)
- Growth chart (subject-specific, filtered from history data)

**FR236.7 — Session-filed topic display (Conversation-First compatibility):**
- Session-filed topics (`filed_from = 'session_filing' | 'freeform_filing'`) appear in the topic list alongside pre-generated topics with the same color coding.
- Key difference: session-filed topics can NEVER have the Grey "not started" state — they always have at least one session by definition.
- The topic count header adapts: "8/15 topics" (pre-generated denominator) vs. "4 topics explored" (session-filed, no denominator).
- When `topics.total` is null, the header omits the denominator entirely.

Uses `useInventory()` to get subject data and `useProgressHistory()` for the chart. Topic list comes from a new endpoint or is derived from the inventory's subject detail — the inventory already has topic counts but not individual topic status. For individual topic status, use the existing `GET /v1/subjects/:subjectId/progress` endpoint which returns `TopicProgress[]`.

- [ ] **Step 3: Write tests for the subject detail screen**

Test topic list rendering, CEFR vocabulary section visibility, navigation to review session for orange topics, and FR236.7: session-filed topics show no "not started" state + adaptive header ("X topics explored" vs "X/Y topics").

- [ ] **Step 4: Add progress route group to learner layout tabs**

In `_layout.tsx`, register the `progress` screen. Since it's now a folder with `_layout.tsx` + `[subjectId].tsx`, the tab registration remains the same (`name="progress"`).

- [ ] **Step 5: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress/\[subjectId\].tsx --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/\(app\)/progress/
git commit -m "feat(mobile): add Subject Progress Detail screen [EP-15, FR236]"
```

---

### Task 10: Milestone Celebration Integration

**Files:**
- Modify: `apps/api/src/services/coaching-cards.ts`
- Modify: `apps/api/src/services/celebrations.ts`

- [ ] **Step 1: Add milestone_celebration card type to coaching card precomputation**

In `apps/api/src/services/coaching-cards.ts`, add a new priority level for milestone celebrations:

```typescript
// After existing priority cascade, before returning the card:
// Priority 11 (highest): uncelebrated milestone
import { getUncelebratedMilestones } from './milestone-detection';

// Inside precomputeCoachingCard:
const uncelebrated = await getUncelebratedMilestones(db, profileId);
if (uncelebrated.length > 0) {
  const newest = uncelebrated[uncelebrated.length - 1]!;
  return {
    id: generateUUIDv7(),
    profileId,
    type: 'milestone_celebration' as const,
    title: getMilestoneCelebrationTitle(newest.milestoneType, newest.threshold),
    body: getMilestoneCelebrationBody(newest.milestoneType, newest.threshold, newest.metadata),
    priority: 11,
    expiresAt: null,
    createdAt: new Date().toISOString(),
    milestoneId: newest.id,
    milestoneType: newest.milestoneType,
    threshold: newest.threshold,
    celebrationCopy: getMilestoneCelebrationBody(newest.milestoneType, newest.threshold, newest.metadata),
    // [SA-5] FR237.3: Populate beforeAfter from earliest snapshot
    beforeAfter: await (async () => {
      try {
        const earliestSnapshot = await db
          .select()
          .from(progressSnapshots)
          .where(eq(progressSnapshots.profileId, profileId))
          .orderBy(progressSnapshots.snapshotDate) // ascending = earliest first
          .limit(1);
        const latestSnapshot = await getLatestSnapshot(db, profileId);

        if (earliestSnapshot[0] && latestSnapshot) {
          const earlyMetrics = earliestSnapshot[0].metrics as ProgressMetrics;
          const currentMetrics = latestSnapshot.metrics as ProgressMetrics;
          const beforeValue =
            newest.milestoneType === 'vocabulary_count' ? earlyMetrics.vocabularyTotal :
            newest.milestoneType === 'topic_mastered_count' ? earlyMetrics.topicsMastered :
            newest.milestoneType === 'session_count' ? earlyMetrics.totalSessions :
            newest.milestoneType === 'learning_time' ? earlyMetrics.totalActiveMinutes :
            0;
          const currentValue =
            newest.milestoneType === 'vocabulary_count' ? currentMetrics.vocabularyTotal :
            newest.milestoneType === 'topic_mastered_count' ? currentMetrics.topicsMastered :
            newest.milestoneType === 'session_count' ? currentMetrics.totalSessions :
            newest.milestoneType === 'learning_time' ? currentMetrics.totalActiveMinutes :
            newest.threshold;

          return {
            beforeDate: earliestSnapshot[0].snapshotDate,
            beforeValue,
            currentValue,
          };
        }
      } catch {
        // Non-critical — celebration still works without comparison
      }
      return null;
    })(),
  };
}
```

- [ ] **Step 2: Add celebration copy templates — FR237.2 + [UX-11] age-adapted tiers**

```typescript
function getMilestoneCelebrationTitle(type: string, threshold: number): string {
  switch (type) {
    case 'vocabulary_count': return `${threshold} words!`;
    case 'topic_mastered_count': return `${threshold} topics mastered!`;
    case 'session_count': return `${threshold} sessions!`;
    case 'streak_length': return `${threshold}-day streak!`;
    case 'subject_mastered': return 'Subject mastered!';
    case 'book_completed': return 'Book completed!';
    case 'topics_explored': return `${threshold} topics explored!`;
    case 'learning_time': return `${Math.round(threshold / 60)} hours of learning!`;
    case 'cefr_level_up': return 'Level up!';
    default: return 'Milestone reached!';
  }
}

// [UX-11] Two copy tiers based on birthYear
type CopyTier = 'younger' | 'older';

function getCopyTier(birthYear: number | null): CopyTier {
  if (!birthYear) return 'younger'; // default to warm/playful
  const age = new Date().getFullYear() - birthYear;
  return age >= 12 ? 'older' : 'younger';
}

function getMilestoneCelebrationBody(
  type: string,
  threshold: number,
  metadata: Record<string, unknown> | null,
  birthYear: number | null = null           // [UX-11] FR237.6
): string {
  const tier = getCopyTier(birthYear);
  const subjectName = (metadata as any)?.subjectName ?? 'this subject';
  const bookTitle = (metadata as any)?.bookTitle ?? 'book';

  // [UX-11] Younger tier: warm, playful, exclamation-heavy
  // Older tier: concise, respectful, no patronizing language
  switch (type) {
    case 'vocabulary_count':
      return tier === 'younger'
        ? `You learned your ${threshold}th word! Remember when you started with zero?`
        : `${threshold} words — solid milestone. Your vocabulary is growing fast.`;
    case 'topic_mastered_count':
      return tier === 'younger'
        ? `You've mastered ${threshold} topics! That's like finishing a whole textbook chapter.`
        : `${threshold} topics mastered. That's real, measurable progress.`;
    case 'session_count':
      return tier === 'younger'
        ? `${threshold} learning sessions! You've built a real habit.`
        : `${threshold} sessions in. Consistency pays off.`;
    case 'streak_length':
      return tier === 'younger'
        ? `${threshold} days in a row! Your brain is getting stronger every day.`
        : `${threshold}-day streak. That's discipline.`;
    case 'subject_mastered':
      return tier === 'younger'
        ? `You mastered every topic in ${subjectName}! You own this.`
        : `${subjectName} — fully mastered. Well done.`;
    case 'book_completed':
      return tier === 'younger'
        ? `You finished the ${bookTitle}! Ready for the next adventure?`
        : `Finished ${bookTitle}. What's next?`;
    case 'topics_explored':
      return tier === 'younger'
        ? `You've explored ${threshold} topics in ${subjectName}! Your curiosity is building something amazing.`
        : `${threshold} topics explored in ${subjectName}. Your curiosity is paying off.`;
    case 'learning_time': {
      const hours = Math.round(threshold / 60);
      return tier === 'younger'
        ? `You've spent ${hours} hours learning! That's more than most people ever invest.`
        : `${hours} hours invested in learning. That adds up.`;
    }
    case 'cefr_level_up':
      return tier === 'younger'
        ? `You reached a new level! You can now understand more than before.`
        : `New proficiency level unlocked. You're leveling up.`;
    default:
      return tier === 'younger' ? 'Amazing achievement!' : 'Milestone reached.';
  }
}
```

- [ ] **Step 3: Respect celebrationLevel preference — FR237.4**

In the celebration filtering logic, add milestone_celebration cards to the `big_only` filter:

```typescript
// In celebrations.ts filterCelebrationsByLevel or coaching-cards.ts:
// For 'big_only', only show milestones at high thresholds
// 100+/500+/1000+ vocabulary, subject/book completions
```

- [ ] **Step 4: Write tests**

Test that:
- Milestone celebration card has highest priority (11)
- celebrationLevel='off' suppresses celebration cards
- celebrationLevel='big_only' only shows high-threshold milestones
- Copy templates produce correct strings

- [ ] **Step 5: Run tests + typecheck**

```bash
pnpm exec nx run api:test -- --testPathPattern="coaching-cards|celebrations|milestone"
pnpm exec nx run api:typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/coaching-cards.ts apps/api/src/services/celebrations.ts
git commit -m "feat(api): integrate milestone celebrations with coaching card system [EP-15, FR234.5, FR237]"
```

---

## Phase C — Parent-Facing Progress

### Task 11: Weekly Progress Push Notification

**Files:**
- Create: `apps/api/src/inngest/functions/weekly-progress-push.ts`
- Create: `apps/api/src/inngest/functions/weekly-progress-push.test.ts`
- Modify: `apps/api/src/inngest/index.ts`
- Modify: `apps/api/src/services/notifications.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/inngest/functions/weekly-progress-push.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getTestDatabase, seedProfile, seedFamilyLink, seedNotificationPrefs } from '../../../test/helpers';
import { generateWeeklyNotification, batchChildNotifications } from './weekly-progress-push';
import type { ProgressMetrics } from '@eduagent/schemas';

describe('weekly-progress-push', () => {
  it('generates encouraging copy when child had activity', () => {
    const currentMetrics = makeMetrics({ topicsMastered: 12, vocabularyTotal: 50, totalSessions: 5 });
    const previousMetrics = makeMetrics({ topicsMastered: 10, vocabularyTotal: 35, totalSessions: 3 });

    const result = generateWeeklyNotification('Emma', currentMetrics, previousMetrics);
    expect(result.body).toContain('2 new topic');
    expect(result.body).toContain('15 new words');
  });

  it('[UX-8] generates positive preservation message when child had zero activity', () => {
    const current = makeMetrics({ topicsMastered: 10, vocabularyTotal: 50, totalSessions: 5 });
    const previous = makeMetrics({ topicsMastered: 10, vocabularyTotal: 50, totalSessions: 5 });

    const result = generateWeeklyNotification('Emma', current, previous);
    expect(result.body).toContain('knowledge is safe');
    expect(result.body).toContain('10 topics');
    // [UX-8] Must NOT contain guilt-inducing language
    expect(result.body).not.toContain('nudge');
    expect(result.body).not.toContain('hasn\'t practiced');
  });

  it('[UX-4] batches multiple children into one notification', () => {
    const summaries = [
      { name: 'Emma', body: '2 new topics mastered, 15 new words.', hadActivity: true },
      { name: 'Alex', body: '5 new topics explored.', hadActivity: true },
    ];
    const result = batchChildNotifications(summaries);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Weekly learning update');
    expect(result!.body).toContain('Emma');
    expect(result!.body).toContain('Alex');
  });

  it('[UX-8] skips push entirely when ALL children inactive', () => {
    const summaries = [
      { name: 'Emma', body: "Emma's knowledge is safe — still knows 50 words and 10 topics!", hadActivity: false },
      { name: 'Alex', body: "Alex's knowledge is safe — still knows 30 words and 5 topics!", hadActivity: false },
    ];
    const result = batchChildNotifications(summaries);
    expect(result).toBeNull();
  });

  it('includes explored topics for session-filed subjects (F-6)', () => {
    const current = makeMetrics({
      topicsMastered: 10, vocabularyTotal: 50, totalSessions: 8,
      subjects: [{ subjectId: 's1', subjectName: 'Geography', pedagogyMode: 'socratic',
        topicsAttempted: 5, topicsMastered: 0, topicsTotal: 0, topicsExplored: 5,
        vocabularyTotal: 0, vocabularyMastered: 0, sessionsCount: 3, activeMinutes: 60, lastSessionAt: null }],
    });
    const previous = makeMetrics({
      topicsMastered: 10, vocabularyTotal: 50, totalSessions: 5,
      subjects: [{ subjectId: 's1', subjectName: 'Geography', pedagogyMode: 'socratic',
        topicsAttempted: 0, topicsMastered: 0, topicsTotal: 0, topicsExplored: 0,
        vocabularyTotal: 0, vocabularyMastered: 0, sessionsCount: 0, activeMinutes: 0, lastSessionAt: null }],
    });

    const result = generateWeeklyNotification('Emma', current, previous);
    expect(result.body).toContain('5 new topics explored');
    expect(result.body).not.toContain('took a break');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec nx run api:test -- --testPathPattern=weekly-progress-push
```

- [ ] **Step 3: Implement weekly progress push**

```typescript
// apps/api/src/inngest/functions/weekly-progress-push.ts
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { sendPushNotification } from '../../services/notifications';
import { getNotificationPrefs, getDailyNotificationCount } from '../../services/settings';
import { getLatestSnapshot, getSnapshotsInRange } from '../../services/snapshot-aggregation';
import { captureException } from '../../services/sentry';
import {
  familyLinks,
  profiles,
  accounts,                    // [AR2-1] timezone lives on accounts, not profiles
  notificationPreferences,
  type Database,
} from '@eduagent/database';
import { eq, and, sql } from 'drizzle-orm'; // [AR2-1] sql for timezone CASE expression
import type { ProgressMetrics } from '@eduagent/schemas';

export function generateWeeklyNotification(
  childName: string,
  current: ProgressMetrics,
  previous: ProgressMetrics | null
): { title: string; body: string } {
  const title = `${childName}'s week in learning`;

  if (!previous) {
    return {
      title,
      body: `${childName} has mastered ${current.topicsMastered} topics so far!`,
    };
  }

  const topicDelta = current.topicsMastered - previous.topicsMastered;
  const vocabDelta = current.vocabularyTotal - previous.vocabularyTotal;
  const sessionDelta = current.totalSessions - previous.totalSessions;

  // [F-6] Compute explored delta from per-subject topicsExplored sums
  const currentExplored = current.subjects.reduce((s, subj) => s + (subj.topicsExplored ?? 0), 0);
  const previousExplored = previous.subjects.reduce((s, subj) => s + (subj.topicsExplored ?? 0), 0);
  const exploredDelta = currentExplored - previousExplored;

  // [UX-8] Zero activity → positive preservation message (no guilt, no "nudge")
  if (topicDelta === 0 && vocabDelta === 0 && sessionDelta === 0 && exploredDelta === 0) {
    return {
      title,
      body: `${childName}'s knowledge is safe — still knows ${current.vocabularyTotal > 0 ? `${current.vocabularyTotal} words and ` : ''}${current.topicsMastered} topics!`,
    };
  }

  const parts: string[] = [];
  if (topicDelta > 0) parts.push(`${topicDelta} new topic${topicDelta > 1 ? 's' : ''} mastered`);
  if (exploredDelta > 0) parts.push(`${exploredDelta} new topic${exploredDelta > 1 ? 's' : ''} explored`);
  if (vocabDelta > 0) parts.push(`${vocabDelta} new words`);
  if (sessionDelta > 0) parts.push(`${sessionDelta} session${sessionDelta > 1 ? 's' : ''} this week`);

  return { title, body: parts.join(', ') + '.' };
}

/**
 * [UX-4] Batch multiple children into one notification body.
 * Returns null if ALL children were inactive (skip push entirely per UX-8).
 */
export function batchChildNotifications(
  childSummaries: Array<{ name: string; body: string; hadActivity: boolean }>
): { title: string; body: string } | null {
  // [UX-8] If ALL children inactive, skip the push entirely
  if (childSummaries.every(c => !c.hadActivity)) return null;

  if (childSummaries.length === 1) {
    return { title: childSummaries[0]!.body.includes('safe') ? 'Weekly update' : `${childSummaries[0]!.name}'s week`, body: childSummaries[0]!.body };
  }

  const title = 'Weekly learning update';
  const lines = childSummaries.map(c => `${c.name}: ${c.body}`);
  return { title, body: lines.join(' | ') };
}

export const weeklyProgressPush = inngest.createFunction(
  {
    id: 'progress-weekly-push',
    name: 'Send weekly progress push to parents',
  },
  // [UX-9/SA-9] Runs hourly on Mondays. Each run processes parents whose local 09:00 matches.
  { cron: '0 * * * 1' }, // Every hour on Mondays
  async ({ step }) => {
    // [SA-9] FR239.1/UX-9: Timezone-aware filtering.
    // The cron fires every hour on Monday. Each invocation determines the current UTC hour
    // and only processes profiles whose timezone makes it 09:00 locally.
    const currentUtcHour = new Date().getUTCHours();

    // Step 1: Get parent profiles whose local 09:00 matches this UTC hour
    const parentProfiles = await step.run('get-parents', async () => {
      const db = getStepDatabase();

      // [SA-9] Query profiles where push is enabled AND weeklyProgressPush is true.
      // [AR2-1] FIXED: timezone lives on `accounts` table, not `profiles`.
      // Must join profiles → accounts via profiles.accountId to access timezone.
      const rows = await db
        .select({
          parentProfileId: notificationPreferences.profileId,
        })
        .from(notificationPreferences)
        .innerJoin(profiles, eq(profiles.id, notificationPreferences.profileId))
        .innerJoin(accounts, eq(accounts.id, profiles.accountId))
        .where(
          and(
            eq(notificationPreferences.pushEnabled, true),
            eq(notificationPreferences.weeklyProgressPush, true),
            // Timezone filter: EXTRACT(HOUR FROM NOW() AT TIME ZONE tz) = 9
            // For NULL timezone, only match at UTC hour 9
            sql`CASE
              WHEN ${accounts.timezone} IS NOT NULL
              THEN EXTRACT(HOUR FROM NOW() AT TIME ZONE ${accounts.timezone}) = 9
              ELSE ${currentUtcHour} = 9
            END`
          )
        );
      return rows.map((r) => r.parentProfileId);
    });

    // Step 2: [UX-4] For each parent, batch ALL children into ONE push notification
    let sent = 0;
    let skipped = 0;

    for (const parentId of parentProfiles) {
      await step.run(`notify-parent-${parentId}`, async () => {
        const db = getStepDatabase();

        const children = await db.query.familyLinks.findMany({
          where: eq(familyLinks.parentProfileId, parentId),
        });

        // Collect summaries for all children, then batch
        const childSummaries: Array<{ name: string; body: string; hadActivity: boolean }> = [];

        for (const link of children) {
          try {
            const childProfile = await db.query.profiles.findFirst({
              where: eq(profiles.id, link.childProfileId),
            });
            if (!childProfile) continue;

            const latest = await getLatestSnapshot(db, link.childProfileId);
            if (!latest) { skipped++; continue; }

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const previousDate = sevenDaysAgo.toISOString().slice(0, 10);
            const previousSnapshots = await getSnapshotsInRange(
              db, link.childProfileId, previousDate, previousDate
            );
            const previous = previousSnapshots[0]
              ? (previousSnapshots[0].metrics as ProgressMetrics)
              : null;

            const notification = generateWeeklyNotification(
              childProfile.displayName ?? 'Your child',
              latest.metrics as ProgressMetrics,
              previous
            );

            // [AR2-4] FIXED: hadActivity must check ALL deltas, not just totalSessions.
            // Otherwise a child with vocab growth but no new sessions is marked "inactive",
            // and if ALL children have this pattern, the batch is incorrectly skipped (UX-8).
            const currentMetrics = latest.metrics as ProgressMetrics;
            const hadActivity = previous
              ? (
                  currentMetrics.totalSessions > previous.totalSessions ||
                  currentMetrics.topicsMastered > previous.topicsMastered ||
                  currentMetrics.vocabularyTotal > previous.vocabularyTotal ||
                  currentMetrics.subjects.reduce((s, subj) => s + (subj.topicsExplored ?? 0), 0) >
                    previous.subjects.reduce((s, subj) => s + (subj.topicsExplored ?? 0), 0)
                )
              : true;

            childSummaries.push({
              name: childProfile.displayName ?? 'Your child',
              body: notification.body,
              hadActivity,
            });
          } catch (err) {
            captureException(err, { parentId, childId: link.childProfileId });
            skipped++;
          }
        }

        // [UX-4] Batch into single push. [UX-8] Skip if ALL inactive.
        if (childSummaries.length > 0) {
          const batched = batchChildNotifications(childSummaries);
          if (batched) {
            await sendPushNotification(db, {
              profileId: parentId,
              title: batched.title,
              body: batched.body,
              type: 'weekly_progress',
            });
            sent++;
          }
        }
      });
    }

    return { sent, skipped, parentCount: parentProfiles.length };
  }
);
```

- [ ] **Step 4: Update notification service type**

In `apps/api/src/services/notifications.ts`, add `'weekly_progress'` and `'monthly_report'` to the `NotificationPayload.type` union.

- [ ] **Step 5: Register in Inngest index**

Add `weeklyProgressPush` to `apps/api/src/inngest/index.ts`.

- [ ] **Step 6: Run tests**

```bash
pnpm exec nx run api:test -- --testPathPattern=weekly-progress-push
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/inngest/functions/weekly-progress-push.ts apps/api/src/inngest/functions/weekly-progress-push.test.ts apps/api/src/inngest/index.ts apps/api/src/services/notifications.ts
git commit -m "feat(api): add weekly progress push notification cron [EP-15, FR239]"
```

---

### Task 12: Monthly Learning Report

**Files:**
- Create: `apps/api/src/services/monthly-report.ts`
- Create: `apps/api/src/services/monthly-report.test.ts`
- Create: `apps/api/src/inngest/functions/monthly-report-cron.ts`
- Modify: `apps/api/src/inngest/index.ts`

- [ ] **Step 1: Write failing test for monthly report generation**

```typescript
// apps/api/src/services/monthly-report.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getTestDatabase, seedProfile, seedFamilyLink } from '../../test/helpers';
import { generateMonthlyReportData } from './monthly-report';
import type { ProgressMetrics } from '@eduagent/schemas';

describe('generateMonthlyReportData', () => {
  it('builds report data with month-over-month comparison', () => {
    const thisMonth: ProgressMetrics = makeMetrics({
      totalSessions: 20, topicsMastered: 8, vocabularyTotal: 87,
      totalActiveMinutes: 450, subjects: [
        { subjectId: 's1', subjectName: 'Spanish', pedagogyMode: 'four_strands',
          topicsAttempted: 5, topicsMastered: 3, topicsTotal: 10,
          vocabularyTotal: 87, vocabularyMastered: 60,
          sessionsCount: 15, activeMinutes: 300, lastSessionAt: null },
      ],
    });
    const lastMonth: ProgressMetrics = makeMetrics({
      totalSessions: 12, topicsMastered: 5, vocabularyTotal: 42,
      totalActiveMinutes: 250,
    });

    const report = generateMonthlyReportData('Emma', 'March 2026', thisMonth, lastMonth);
    expect(report.headlineStat.value).toBe(45); // 87 - 42 = 45 new words
    expect(report.thisMonth.topicsMastered).toBe(3); // delta: 8 - 5
  });

  it('handles first month (no lastMonth) gracefully', () => {
    const thisMonth = makeMetrics({ topicsMastered: 5, vocabularyTotal: 30, totalSessions: 10 });
    const report = generateMonthlyReportData('Emma', 'March 2026', thisMonth, null);
    expect(report.lastMonth).toBeNull();
    expect(report.headlineStat.comparison).toContain('first month');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement monthly report service**

```typescript
// apps/api/src/services/monthly-report.ts
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import {
  progressSnapshots,
  monthlyReports,
  familyLinks,
  profiles,
  type Database,
} from '@eduagent/database';
import type {
  ProgressMetrics,
  MonthlyReportData,
  MonthMetrics,
  SubjectMonthlyDetail,
} from '@eduagent/schemas';
import { routeAndCall, type ChatMessage } from './llm';
import { captureException } from './sentry';

/**
 * Generate report data from two months of metrics.
 * Pure function — no DB access, no LLM calls.
 */
export function generateMonthlyReportData(
  childName: string,
  monthLabel: string,
  thisMonth: ProgressMetrics,
  lastMonth: ProgressMetrics | null
): MonthlyReportData {
  const vocabDelta = lastMonth
    ? thisMonth.vocabularyTotal - lastMonth.vocabularyTotal
    : thisMonth.vocabularyTotal;
  const topicDelta = lastMonth
    ? thisMonth.topicsMastered - lastMonth.topicsMastered
    : thisMonth.topicsMastered;

  const thisMonthMetrics: MonthMetrics = {
    totalSessions: lastMonth
      ? thisMonth.totalSessions - lastMonth.totalSessions
      : thisMonth.totalSessions,
    totalActiveMinutes: lastMonth
      ? thisMonth.totalActiveMinutes - lastMonth.totalActiveMinutes
      : thisMonth.totalActiveMinutes,
    topicsMastered: topicDelta,
    vocabularyLearned: vocabDelta,
    streakBest: thisMonth.longestStreak,
  };

  // [AR-6] FIXED: lastMonth metrics are cumulative totals from end-of-previous-month snapshot.
  // Without a month-before-last snapshot, we can't compute deltas for lastMonth.
  // Field is named vocabularyLearned but stores cumulative total — rename would
  // break the MonthMetrics schema. Instead, document: lastMonth values are
  // cumulative snapshots, NOT deltas. Only thisMonth values are deltas.
  const lastMonthMetrics: MonthMetrics | null = lastMonth
    ? {
        totalSessions: lastMonth.totalSessions, // cumulative, not delta
        totalActiveMinutes: lastMonth.totalActiveMinutes, // cumulative
        topicsMastered: lastMonth.topicsMastered, // cumulative
        vocabularyLearned: lastMonth.vocabularyTotal, // cumulative total, NOT delta
        streakBest: lastMonth.longestStreak,
      }
    : null;

  // Per-subject detail
  const subjectDetails: SubjectMonthlyDetail[] = thisMonth.subjects.map((subj) => {
    const lastSubj = lastMonth?.subjects.find((s) => s.subjectId === subj.subjectId);
    const mDelta = lastSubj
      ? subj.topicsMastered - lastSubj.topicsMastered
      : subj.topicsMastered;
    const aDelta = lastSubj
      ? subj.activeMinutes - lastSubj.activeMinutes
      : subj.activeMinutes;

    return {
      subjectName: subj.subjectName,
      topicsMastered: mDelta,
      topicsAttempted: subj.topicsAttempted - (lastSubj?.topicsAttempted ?? 0),
      vocabularyLearned: subj.vocabularyTotal - (lastSubj?.vocabularyTotal ?? 0),
      activeMinutes: aDelta,
      trend: aDelta > 0 ? 'growing' : aDelta === 0 ? 'stable' : 'declining',
    };
  });

  // Headline stat: pick most impressive number
  const headlineLabel = vocabDelta > topicDelta ? 'Words learned' : 'Topics mastered';
  const headlineValue = vocabDelta > topicDelta ? vocabDelta : topicDelta;
  const headlineComparison = lastMonth
    ? `up from ${vocabDelta > topicDelta ? lastMonth.vocabularyTotal : lastMonth.topicsMastered} last month`
    : `in your first month`;

  return {
    childName,
    month: monthLabel,
    thisMonth: thisMonthMetrics,
    lastMonth: lastMonthMetrics,
    highlights: [], // Populated by LLM call
    nextSteps: [],
    subjects: subjectDetails,
    headlineStat: {
      label: headlineLabel,
      value: headlineValue,
      comparison: headlineComparison,
    },
  };
}

/**
 * Generate LLM highlights for a monthly report.
 * Falls back gracefully if LLM fails.
 */
// [SA-8] FR240.4: Returns highlights, nextSteps, AND a relatable comparison for headlineStat.
export async function generateReportHighlights(
  reportData: MonthlyReportData
): Promise<{ highlights: string[]; nextSteps: string[]; comparison: string | null }> {
  try {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are writing a warm, encouraging monthly learning report for a parent about their child. Generate: (1) 2-3 highlights (specific achievements), (2) 0-2 forward-looking next steps (actionable suggestions with a supportive tone — "Spanish is ready for a comeback!" not "Spanish practice dropped off"), (3) a single "equivalent" comparison that makes the progress tangible and relatable (e.g., "That\'s like reading 2 textbook chapters" or "Enough vocabulary to order food at a restaurant"). Return JSON: { "highlights": [...], "nextSteps": [...], "equivalent": "..." }',
      },
      {
        role: 'user',
        content: JSON.stringify({
          childName: reportData.childName,
          month: reportData.month,
          thisMonth: reportData.thisMonth,
          lastMonth: reportData.lastMonth,
          subjects: reportData.subjects,
        }),
      },
    ];

    const result = await routeAndCall(messages, {
      task: 'monthly-report-highlights',
      maxTokens: 300,
      temperature: 0.7,
    });

    const parsed = JSON.parse(result.text);
    return {
      highlights: (parsed.highlights ?? ['Great progress this month!']).slice(0, 3),
      nextSteps: (parsed.nextSteps ?? []).slice(0, 2),     // [UX-14] forward-looking, not judgmental
      comparison: parsed.equivalent ?? null,                // [SA-8] FR240.4: LLM "equivalent" for headlineStat
    };
  } catch (err) {
    captureException(err, { context: 'monthly-report-highlights' });
    return {
      highlights: ['Great progress this month!'],
      nextSteps: [],
      comparison: null,   // [SA-8] Arithmetic fallback in headlineStat.comparison stands
    };
  }
}
```

- [ ] **Step 4: Create monthly report Inngest cron**

```typescript
// apps/api/src/inngest/functions/monthly-report-cron.ts
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { generateMonthlyReportData, generateReportHighlights } from '../../services/monthly-report';
import { getSnapshotsInRange } from '../../services/snapshot-aggregation';
import { sendPushNotification } from '../../services/notifications';
import { captureException } from '../../services/sentry';
import { familyLinks, profiles, monthlyReports, progressSnapshots } from '@eduagent/database';
import { eq, and, gte, lte } from 'drizzle-orm';   // [F-5] all used in innerJoin
import type { ProgressMetrics } from '@eduagent/schemas';

export const monthlyReportCron = inngest.createFunction(
  {
    id: 'progress-monthly-report',
    name: 'Generate monthly learning reports',
  },
  { cron: '0 10 1 * *' }, // 1st of month, 10:00 UTC
  async ({ step }) => {
    // [AR-9] FIXED: Fan-out via step.sendEvent() instead of loading entire
    // familyLinks table. Matches the proven pattern in recall-nudge.ts.
    // Step 1: Get pairs in paginated batches
    const BATCH_SIZE = 500;
    const pairs = await step.run('get-parent-child-pairs', async () => {
      const db = getStepDatabase();
      // Only fetch pairs where child had at least one snapshot last month
      const now = new Date();
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      // [AR2-3] FIXED: INNER JOIN produced ~30 rows per pair (one per daily snapshot).
      // Replaced with EXISTS subquery to get exactly 1 row per parent-child pair.
      const links = await db
        .select({
          parentId: familyLinks.parentProfileId,
          childId: familyLinks.childProfileId,
        })
        .from(familyLinks)
        .where(
          sql`EXISTS (
            SELECT 1 FROM ${progressSnapshots}
            WHERE ${progressSnapshots.profileId} = ${familyLinks.childProfileId}
              AND ${progressSnapshots.snapshotDate} >= ${lastMonthStart.toISOString().slice(0, 10)}
              AND ${progressSnapshots.snapshotDate} <= ${lastMonthEnd.toISOString().slice(0, 10)}
          )`
        );

      return links;
    });

    // Step 2: Fan-out in batches via sendEvent
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);
      await step.sendEvent(
        'fan-out-reports',
        batch.map((pair) => ({
          name: 'app/monthly-report.generate',
          data: { parentId: pair.parentId, childId: pair.childId },
        }))
      );
    }

    return { totalPairs: pairs.length };
  }
);

// Individual report generation — triggered by fan-out event
export const monthlyReportGenerate = inngest.createFunction(
  {
    id: 'progress-monthly-report-generate',
    name: 'Generate one monthly report for a parent-child pair',
  },
  { event: 'app/monthly-report.generate' },
  async ({ event, step }) => {
    const { parentId: pairParentId, childId: pairChildId } = event.data;
    // Wrapped in step.run for Inngest retries
    await step.run('generate-report', async () => {
      const pair = { parentId: pairParentId, childId: pairChildId };
      try {
          const db = getStepDatabase();

          const child = await db.query.profiles.findFirst({
            where: eq(profiles.id, pair.childId),
          });
          if (!child) return;

          // Previous month date range
          const now = new Date();
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const twoMonthsAgoEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
          const twoMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);

          const monthLabel = lastMonthStart.toLocaleString('en', { month: 'long', year: 'numeric' });

          // [AR2-9] FIXED: Use a 3-day range instead of exact-date match.
          // If the daily cron missed the exact last day (cron failure, timezone edge),
          // the exact-date query would return empty and silently skip the report.
          // Now fetches last 3 days of the month and takes the most recent snapshot.
          const thisMonthRangeStart = new Date(lastMonthEnd);
          thisMonthRangeStart.setDate(thisMonthRangeStart.getDate() - 2); // 3-day window
          const thisMonthSnapshots = await getSnapshotsInRange(
            db, pair.childId,
            thisMonthRangeStart.toISOString().slice(0, 10),
            lastMonthEnd.toISOString().slice(0, 10)
          );
          const prevMonthRangeStart = new Date(twoMonthsAgoEnd);
          prevMonthRangeStart.setDate(prevMonthRangeStart.getDate() - 2);
          const prevMonthSnapshots = await getSnapshotsInRange(
            db, pair.childId,
            prevMonthRangeStart.toISOString().slice(0, 10),
            twoMonthsAgoEnd.toISOString().slice(0, 10)
          );

          // Take the most recent snapshot in each range (getSnapshotsInRange returns ordered by date asc)
          const thisMonthMetrics = thisMonthSnapshots.at(-1)?.metrics as ProgressMetrics | undefined;
          if (!thisMonthMetrics) return; // No data for this month

          const prevMonthMetrics = prevMonthSnapshots.at(-1)?.metrics as ProgressMetrics | null ?? null;

          // Generate report data
          let reportData = generateMonthlyReportData(
            child.displayName ?? 'Your child',
            monthLabel,
            thisMonthMetrics,
            prevMonthMetrics
          );

          // Enrich with LLM highlights
          // Enrich with LLM highlights + [SA-8] FR240.4 equivalent comparison
          const { highlights, nextSteps, comparison } = await generateReportHighlights(reportData);
          reportData = {
            ...reportData,
            highlights,
            nextSteps,
            // [SA-8] Override arithmetic comparison with LLM "equivalent" if available
            headlineStat: comparison
              ? { ...reportData.headlineStat, comparison }
              : reportData.headlineStat,
          };

          // Store report
          await db
            .insert(monthlyReports)
            .values({
              profileId: pair.parentId,
              childProfileId: pair.childId,
              reportMonth: lastMonthStart.toISOString().slice(0, 10),
              reportData,
            })
            .onConflictDoNothing();

          // [AR-11] FIXED: No `as any` — NotificationPayload type must be extended
          // in Task 11 Step 4 before this code compiles.
          await sendPushNotification(db, {
            profileId: pair.parentId,
            title: `${child.displayName}'s ${monthLabel} learning report is ready!`,
            body: 'Tap to see their progress.',
            type: 'monthly_report',
          });

          // [AR2-11] FIXED: return inside step.run so Inngest sees the correct status.
          // Previously, { status: 'ok' } was at the function handler level (outside step.run),
          // meaning Inngest always got 'ok' even when the step caught an error.
          return { status: 'ok' };
        } catch (err) {
          captureException(err, { parentId: pair.parentId, childId: pair.childId });
          return { status: 'failed' };
        }
      });
  }
);
```

- [ ] **Step 5: Register in Inngest index**

Add both `monthlyReportCron` and `monthlyReportGenerate` to `apps/api/src/inngest/index.ts`.

- [ ] **Step 6: Run tests**

```bash
pnpm exec nx run api:test -- --testPathPattern="monthly-report"
```

- [ ] **Step 7: Run full API typecheck + lint**

```bash
pnpm exec nx run api:typecheck && pnpm exec nx run api:lint
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/monthly-report.ts apps/api/src/services/monthly-report.test.ts apps/api/src/inngest/functions/monthly-report-cron.ts apps/api/src/inngest/index.ts
git commit -m "feat(api): add monthly learning report generation with LLM highlights [EP-15, FR240]"
```

---

### Task 14 [SA-6]: Parent Dashboard Mobile Update (FR238)

> **NOTE: This task was stripped by a linter during branch switching. Re-added from SA-6 finding.**

**Files:**
- Modify: `apps/mobile/src/app/(app)/parent/dashboard.tsx`
- Create: `apps/mobile/src/app/(app)/parent/child-progress/[childProfileId].tsx`
- Create: `apps/mobile/src/app/(app)/parent/child-progress/[childProfileId].test.tsx`
- Modify: `apps/mobile/src/hooks/use-dashboard.ts`

**Requirements:**
1. Extend dashboard hook to expose `progress` fields from Task 7's API changes.
2. Update parent dashboard per-child cards to render: topics mastered + weekly delta, vocabulary + delta, engagement trend with [UX-7] actionable guidance ("Quiet week — maybe suggest a quick session on [subject]?").
3. Make child cards tappable → navigate to `/(app)/parent/child-progress/${child.profileId}`.
4. Create child progress detail screen reusing `SubjectCard`, `ProgressBar`, `GrowthChart` from Task 8 — no "Keep learning" CTA (parent can't learn for the child).
5. Write tests for dashboard progress deltas, declining trend guidance, child detail rendering.

```bash
git add apps/mobile/src/app/\(app\)/parent/
git commit -m "feat(mobile): add parent dashboard progress fields + child progress detail screen [EP-15, FR238, SA-6]"
```

---

### Task 15 [SA-7]: Monthly Report Mobile Screen (FR240.5, FR240.7)

> **NOTE: This task was stripped by a linter during branch switching. Re-added from SA-7 finding.**

**Files:**
- Create: `apps/mobile/src/app/(app)/parent/reports/[childProfileId].tsx`
- Create: `apps/mobile/src/app/(app)/parent/reports/detail/[reportId].tsx`
- Modify: `apps/mobile/src/hooks/use-progress.ts` (add report hooks)

**Requirements:**
1. Add `useChildReports(childProfileId)` and `useReportDetail(childProfileId, reportId)` React Query hooks.
2. Create reports list screen: month labels, headline stat preview, "New" badge for unviewed reports.
3. Create report detail screen (FR240.7 — screenshot-worthy): large headline stat + LLM comparison, month-over-month bar, per-subject breakdown, highlights, nextSteps. [FR237.5] Screenshot-friendly layout: clean numbers, warm language, visually appealing for parent sharing.
4. Mark report as viewed on mount via API.
5. Add navigation from child progress detail → "Monthly Reports" link.
6. Handle push notification deep-link to most recent report.
7. Write tests for list rendering, "New" badge, detail sections, viewedAt marking.

```bash
git add apps/mobile/src/app/\(app\)/parent/reports/ apps/mobile/src/hooks/use-progress.ts
git commit -m "feat(mobile): add monthly learning report list + detail screens [EP-15, FR240.5, FR240.7, SA-7]"
```

---

## Final Verification

### Task 16: Integration Tests + Full Validation

- [ ] **Step 1: Run full API test suite**

```bash
pnpm exec nx run api:test
```

- [ ] **Step 2: Run full API typecheck + lint**

```bash
pnpm exec nx run api:typecheck && pnpm exec nx run api:lint
```

- [ ] **Step 3: Run mobile typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 4: Run mobile tests for new screens**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress.tsx src/app/\(app\)/progress/\[subjectId\].tsx --no-coverage
```

- [ ] **Step 5: Run integration tests for snapshot accuracy**

The snapshot aggregation integration tests (Task 3) are the critical correctness gate. Verify they pass with diverse profiles:
- Language-only learner
- Non-language learner
- Mixed subjects
- Zero-activity profile
- Profile with 100+ sessions (performance check)

```bash
pnpm exec nx run api:test -- --testPathPattern=snapshot-aggregation --verbose
```

- [ ] **Step 6: Verify migration applies cleanly**

```bash
pnpm run db:migrate:dev
```

- [ ] **Step 7: Final commit if any fixups needed**

---

## Dependency Graph

```
Task 1 (schema) ── Task 2 (zod types) ──┬── Task 3 (aggregation service)
                                         │
                                         ├── Task 5 (milestone detection)
                                         │        │
                                         │        ▼
                                         └── Task 4 (daily cron) ◄── [AR-4] requires Task 5
                                                  │
                                    Task 6 (routes + FR241) ──── Task 7 (parent access)
                                                  │
                                    Task 8 (mobile journey) ──── Task 9 (subject detail)
                                                  │
                                    Task 10 (celebrations)

                                    Task 11 (weekly push) ──── independent after Task 3
                                    Task 12 (monthly report) ── independent after Task 3
                                    Task 13 (final validation) ── after all tasks
```

**Parallelization opportunities:**
- Tasks 3 + 5 can run in parallel (both depend on Task 1+2)
- **[AR-4] Task 4 MUST wait for Task 5** (imports `detectMilestones`)
- Tasks 8 + 9 can run in parallel (both depend on Task 6)
- Tasks 10, 11, 12 can run in parallel (each independent after data foundation)

---

## Migration Checklist

Before deploying to staging:

1. Apply migration `0015_*.sql` to staging Neon database
2. Verify `progress_snapshots`, `milestones`, `monthly_reports` tables exist
3. Verify `notification_type` enum has `weekly_progress`, `monthly_report`, and `progress_refresh`
4. Verify `notification_preferences.weekly_progress_push` column exists with default `true`
5. Deploy worker code — new Inngest functions register automatically
6. Trigger `POST /v1/progress/refresh` manually to verify snapshot computation
7. Wait for 03:00 UTC to verify daily cron runs (or trigger manually via Inngest dashboard)

### Rollback Section [AR-12]

> **Enum values cannot be removed from Postgres.** `ALTER TYPE ... DROP VALUE` does not exist.

| Change | Reversible? | Procedure |
|--------|------------|-----------|
| New tables (`progress_snapshots`, `milestones`, `monthly_reports`) | Yes | `DROP TABLE monthly_reports, milestones, progress_snapshots CASCADE;` |
| New column `notification_preferences.weekly_progress_push` | Yes | `ALTER TABLE notification_preferences DROP COLUMN weekly_progress_push;` |
| New enum values (`weekly_progress`, `monthly_report`, `progress_refresh`) | **No** | Cannot remove enum values in Postgres. Values are additive-only. If full rollback is needed: (1) create new enum without the values, (2) alter all referencing columns to use the new enum, (3) drop old enum. This is destructive and requires a migration. |
| Inngest function registrations | Yes | Remove from `functions` array and redeploy. Inngest automatically unregisters. |

**Risk assessment:** The enum additions are the only irreversible change. Since the new values are only referenced by new code (not by existing code), leaving them in place after rollback is harmless — they'll be unused but won't break anything.
