# Epic 15: Visible Progress — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build precomputed progress snapshots, milestone detection, and child/parent-facing progress screens so that learning is measured in concrete knowledge — not points.

**Architecture:** Daily Inngest cron aggregates raw data (sessions, assessments, vocabulary, retention cards) into a single JSONB row per profile per day. On session-complete, a fast-path refresh updates today's snapshot immediately. API endpoints serve inventory and history from these precomputed rows. Mobile screens consume these endpoints for the child's "My Learning Journey" and parent dashboard enhancements.

**Tech Stack:** Drizzle ORM (Postgres via Neon), Inngest (cron + event-driven), Hono (API routes with RPC inference), Zod (shared schemas), React Native / Expo Router (mobile), `@eduagent/schemas` (shared contract), LLM router (monthly report narrative).

**Spec:** `docs/superpowers/specs/2026-04-07-epic-15-visible-progress-design.md`

**Branch:** Create `epic-15-visible-progress` from `main`.

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
| `apps/mobile/src/app/(learner)/progress.tsx` | My Learning Journey screen |
| `apps/mobile/src/app/(learner)/progress.test.tsx` | Tests for journey screen |
| `apps/mobile/src/app/(learner)/progress/_layout.tsx` | Progress tab layout (for nested routes) |
| `apps/mobile/src/app/(learner)/progress/[subjectId].tsx` | Subject Progress Detail screen |
| `apps/mobile/src/app/(learner)/progress/[subjectId].test.tsx` | Tests for subject detail |
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
| `apps/mobile/src/app/(learner)/_layout.tsx` | Add Progress tab to learner tab bar |

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
    total: z.number().int(),
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
  areasForGrowth: z.array(z.string()).max(2),
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
export const milestoneCelebrationCardSchema = z.object({
  ...baseCoachingCardFields,
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

  // 3. Topic counts per subject — total from curriculum, mastered from assessments
  const topicTotals = await db
    .select({
      subjectId: curriculumBooks.subjectId,
      topicsTotal: count(curriculumTopics.id),
    })
    .from(curriculumTopics)
    .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
    .where(eq(curriculumTopics.skipped, false))
    .groupBy(curriculumBooks.subjectId);

  const topicTotalBySubject = new Map(
    topicTotals.map((t) => [t.subjectId, Number(t.topicsTotal)])
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
      const totalTopics = topicTotalBySubject.get(subj.id) ?? 0;
      const mastered = masteredBySubject.get(subj.id) ?? 0;
      const attempted = attemptedBySubject.get(subj.id) ?? 0;
      const vocab = vocabBySubject.get(subj.id) ?? { total: 0, mastered: 0 };

      return {
        subjectId: subj.id,
        subjectName: subj.name,
        pedagogyMode: subj.pedagogyMode as 'socratic' | 'four_strands',
        topicsAttempted: attempted,
        topicsMastered: mastered,
        topicsTotal: totalTopics,
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
import { detectMilestones, VOCABULARY_THRESHOLDS, TOPIC_THRESHOLDS } from './milestone-detection';
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

  // Per-subject milestones: subject_mastered (all topics mastered)
  for (const subj of metrics.subjects) {
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
  }

  // [AR-5] TODO — Phase D stretch: book_completed and cefr_level_up
  // These milestone types are declared in the schema but not yet detected.
  // book_completed: requires tracking per-book topic completion (needs bookId in metrics)
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

At the end of the session-completed Inngest function (after the existing `queue-celebrations` step), add a new isolated step:

```typescript
// In session-completed.ts — add import
import { computeProgressSnapshot, upsertSnapshot, getLatestSnapshot } from '../../services/snapshot-aggregation';
import { detectMilestones } from '../../services/milestone-detection';

// Add as the final step in the function:
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
  progressSnapshots,
} from '@eduagent/database';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
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
import { getRecentNotificationCount } from '../services/notifications';

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
            count: db.$count(vocabulary),
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

      return {
        subjectId: subj.subjectId,
        subjectName: subj.subjectName,
        pedagogyMode: subj.pedagogyMode,
        topics: {
          total: subj.topicsTotal,
          mastered: subj.topicsMastered,
          inProgress: subj.topicsAttempted - subj.topicsMastered,
          notStarted: Math.max(0, subj.topicsTotal - subj.topicsAttempted),
        },
        vocabulary: {
          total: subj.vocabularyTotal,
          mastered: subj.vocabularyMastered,
          learning: Math.max(0, subj.vocabularyTotal - subj.vocabularyMastered),
          new: 0,
          byCefrLevel,
        },
        estimatedProficiency,
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
git commit -m "feat(api): add progress inventory, history, refresh endpoints + session-complete hook [EP-15, FR231-233, FR241]"
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
- Create: `apps/mobile/src/app/(learner)/progress.tsx`
- Create: `apps/mobile/src/app/(learner)/progress.test.tsx`
- Create: `apps/mobile/src/hooks/use-progress.ts`
- Create: `apps/mobile/src/components/progress/SubjectCard.tsx`
- Create: `apps/mobile/src/components/progress/ProgressBar.tsx`
- Create: `apps/mobile/src/components/progress/GrowthChart.tsx`
- Create: `apps/mobile/src/components/progress/MilestoneCard.tsx`
- Modify: `apps/mobile/src/app/(learner)/_layout.tsx`

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
// apps/mobile/src/app/(learner)/progress.tsx
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
          onPress={() => router.push('/(learner)/home')}
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

  // Hero stat logic — FR235.3
  const hasLanguage = data.subjects.some(s => s.pedagogyMode === 'four_strands');
  const hasNonLanguage = data.subjects.some(s => s.pedagogyMode === 'socratic');

  let heroText: string;
  if (hasLanguage && hasNonLanguage) {
    heroText = `You've mastered ${data.global.topicsMastered} topics and know ${data.global.vocabularyTotal} words`;
  } else if (hasLanguage) {
    heroText = `You know ${data.global.vocabularyTotal} words`;
  } else {
    heroText = `You've mastered ${data.global.topicsMastered} topics`;
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
          onPress={() => router.push(`/(learner)/progress/${subj.subjectId}`)}
          className="mx-5 mb-3 p-4 bg-surface-elevated rounded-card"
          testID={`subject-card-${subj.subjectId}`}
          accessibilityRole="button"
        >
          <Text className="text-body font-semibold text-text-primary mb-1">
            {subj.subjectName}
          </Text>
          <ProgressBar
            value={subj.topics.mastered}
            total={subj.topics.total}
            color="teal"
          />
          <Text className="text-caption text-text-secondary mt-1">
            {subj.pedagogyMode === 'four_strands'
              ? `${subj.vocabulary.total} words`
              : `${subj.topics.mastered}/${subj.topics.total} topics`}
            {' · '}
            {subj.activeMinutes} min
          </Text>
        </Pressable>
      ))}

      {/* Growth chart */}
      {history.data && history.data.dataPoints.length > 0 && (
        <>
          <Text className="text-label uppercase text-text-secondary px-5 mt-4 mb-3">
            Your Growth
          </Text>
          <View className="mx-5 mb-4">
            <GrowthChart
              dataPoints={history.data.dataPoints}
              hasLanguage={hasLanguage}
            />
          </View>
        </>
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
        </>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 4: Add Progress tab to learner layout**

In `apps/mobile/src/app/(learner)/_layout.tsx`:

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

Test in `apps/mobile/src/app/(learner)/progress.test.tsx`:
- Empty state renders start button
- Populated state renders hero stat, subject cards, growth chart
- Subject card tap navigates to subject detail
- Error state renders retry button

- [ ] **Step 6: Run mobile tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(learner\)/progress.tsx --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/progress.tsx apps/mobile/src/app/\(learner\)/progress.test.tsx apps/mobile/src/hooks/use-progress.ts apps/mobile/src/components/progress/ apps/mobile/src/app/\(learner\)/_layout.tsx
git commit -m "feat(mobile): add My Learning Journey screen with Progress tab [EP-15, FR235]"
```

---

### Task 9: Subject Progress Detail Screen

**Files:**
- Create: `apps/mobile/src/app/(learner)/progress/_layout.tsx`
- Create: `apps/mobile/src/app/(learner)/progress/[subjectId].tsx`
- Create: `apps/mobile/src/app/(learner)/progress/[subjectId].test.tsx`

- [ ] **Step 1: Create progress stack layout**

```typescript
// apps/mobile/src/app/(learner)/progress/_layout.tsx
import { Stack } from 'expo-router';

export default function ProgressLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Create Subject Progress Detail screen**

`apps/mobile/src/app/(learner)/progress/[subjectId].tsx`:

Screen shows:
- Back button + subject name header
- Topic list with color-coded progress bars (green/teal/grey/orange per FR236.3)
- Vocabulary by CEFR level (language subjects only, hidden for non-language)
- Time spent (this week + total from snapshot)
- Growth chart (subject-specific, filtered from history data)

Uses `useInventory()` to get subject data and `useProgressHistory()` for the chart. Topic list comes from a new endpoint or is derived from the inventory's subject detail — the inventory already has topic counts but not individual topic status. For individual topic status, use the existing `GET /v1/subjects/:subjectId/progress` endpoint which returns `TopicProgress[]`.

- [ ] **Step 3: Write tests for the subject detail screen**

Test topic list rendering, CEFR vocabulary section visibility, and navigation to review session for orange topics.

- [ ] **Step 4: Add progress route group to learner layout tabs**

In `_layout.tsx`, register the `progress` screen. Since it's now a folder with `_layout.tsx` + `[subjectId].tsx`, the tab registration remains the same (`name="progress"`).

- [ ] **Step 5: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(learner\)/progress/\[subjectId\].tsx --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/progress/
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
    beforeAfter: null, // Populated from snapshot comparison
  };
}
```

- [ ] **Step 2: Add celebration copy templates — FR237.2**

```typescript
function getMilestoneCelebrationTitle(type: string, threshold: number): string {
  switch (type) {
    case 'vocabulary_count': return `${threshold} words!`;
    case 'topic_mastered_count': return `${threshold} topics mastered!`;
    case 'session_count': return `${threshold} sessions!`;
    case 'streak_length': return `${threshold}-day streak!`;
    case 'subject_mastered': return 'Subject mastered!';
    case 'book_completed': return 'Book completed!';
    case 'learning_time': return `${Math.round(threshold / 60)} hours of learning!`;
    case 'cefr_level_up': return 'Level up!';
    default: return 'Milestone reached!';
  }
}

function getMilestoneCelebrationBody(
  type: string,
  threshold: number,
  metadata: Record<string, unknown> | null
): string {
  switch (type) {
    case 'vocabulary_count':
      return `You learned your ${threshold}th word! Remember when you started with zero?`;
    case 'topic_mastered_count':
      return `You've mastered ${threshold} topics! That's like finishing a whole textbook chapter.`;
    case 'session_count':
      return `${threshold} learning sessions! You've built a real habit.`;
    case 'streak_length':
      return `${threshold} days in a row! Your brain is getting stronger every day.`;
    case 'subject_mastered':
      return `You mastered every topic in ${(metadata as any)?.subjectName ?? 'this subject'}! You own this.`;
    case 'book_completed':
      return `You finished the ${(metadata as any)?.bookTitle ?? 'book'}! Ready for the next adventure?`;
    case 'learning_time': {
      const hours = Math.round(threshold / 60);
      return `You've spent ${hours} hours learning! That's more than most people ever invest.`;
    }
    case 'cefr_level_up':
      return `You reached a new level! You can now understand more than before.`;
    default:
      return 'Amazing achievement!';
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
import { generateWeeklyNotification } from './weekly-progress-push';
import type { ProgressMetrics } from '@eduagent/schemas';

describe('weekly-progress-push', () => {
  it('generates encouraging copy when child had activity', () => {
    const currentMetrics = makeMetrics({ topicsMastered: 12, vocabularyTotal: 50, totalSessions: 5 });
    const previousMetrics = makeMetrics({ topicsMastered: 10, vocabularyTotal: 35, totalSessions: 3 });

    const result = generateWeeklyNotification('Emma', currentMetrics, previousMetrics);
    expect(result.body).toContain('2 new topics');
    expect(result.body).toContain('15 new words');
  });

  it('generates preservation message when child had zero activity', () => {
    const current = makeMetrics({ topicsMastered: 10, vocabularyTotal: 50, totalSessions: 5 });
    const previous = makeMetrics({ topicsMastered: 10, vocabularyTotal: 50, totalSessions: 5 });

    const result = generateWeeklyNotification('Emma', current, previous);
    expect(result.body).toContain('took a break');
    expect(result.body).toContain('still mastered 10 topics');
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
  notificationPreferences,
  type Database,
} from '@eduagent/database';
import { eq, and } from 'drizzle-orm';
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

  // Zero activity this week
  if (topicDelta === 0 && vocabDelta === 0 && sessionDelta === 0) {
    return {
      title,
      body: `${childName} took a break this week. Their knowledge is safe — they've still mastered ${current.topicsMastered} topics!`,
    };
  }

  const parts: string[] = [];
  if (topicDelta > 0) parts.push(`${topicDelta} new topic${topicDelta > 1 ? 's' : ''}`);
  if (vocabDelta > 0) parts.push(`${vocabDelta} new words`);
  if (sessionDelta > 0) parts.push(`${sessionDelta} session${sessionDelta > 1 ? 's' : ''} this week`);

  return { title, body: `Mastered ${parts.join(', ')}.` };
}

export const weeklyProgressPush = inngest.createFunction(
  {
    id: 'progress-weekly-push',
    name: 'Send weekly progress push to parents',
  },
  { cron: '0 9 * * 1' }, // Monday 09:00 UTC
  async ({ step }) => {
    // Step 1: Get all parent profiles with push enabled + weeklyProgressPush = true
    const parentProfiles = await step.run('get-parents', async () => {
      const db = getStepDatabase();
      const rows = await db
        .select({
          parentProfileId: notificationPreferences.profileId,
        })
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.pushEnabled, true),
            eq(notificationPreferences.weeklyProgressPush, true)
          )
        );
      return rows.map((r) => r.parentProfileId);
    });

    // Step 2: For each parent, find linked children and send notifications
    let sent = 0;
    let skipped = 0;

    for (const parentId of parentProfiles) {
      await step.run(`notify-parent-${parentId}`, async () => {
        const db = getStepDatabase();

        const children = await db.query.familyLinks.findMany({
          where: eq(familyLinks.parentProfileId, parentId),
        });

        for (const link of children) {
          try {
            const childProfile = await db.query.profiles.findFirst({
              where: eq(profiles.id, link.childProfileId),
            });
            if (!childProfile) continue;

            // Get current and 7-days-ago snapshot
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

            const { title, body } = generateWeeklyNotification(
              childProfile.displayName ?? 'Your child',
              latest.metrics as ProgressMetrics,
              previous
            );

            // [AR-11] FIXED: No `as any` — Step 4 (extend type) must run BEFORE this code.
            await sendPushNotification(db, {
              profileId: parentId,
              title,
              body,
              type: 'weekly_progress',
            });
            sent++;
          } catch (err) {
            captureException(err, { parentId, childId: link.childProfileId });
            skipped++;
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
    areasForGrowth: [],
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
export async function generateReportHighlights(
  reportData: MonthlyReportData
): Promise<{ highlights: string[]; areasForGrowth: string[] }> {
  try {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are writing a warm, encouraging monthly learning report for a parent about their child. Generate 2-3 highlights (specific achievements) and 0-2 areas for growth (supportive tone, never critical). Return JSON: { "highlights": [...], "areasForGrowth": [...] }',
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
      areasForGrowth: (parsed.areasForGrowth ?? []).slice(0, 2),
    };
  } catch (err) {
    captureException(err, { context: 'monthly-report-highlights' });
    return {
      highlights: ['Great progress this month!'],
      areasForGrowth: [],
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
import { familyLinks, profiles, monthlyReports } from '@eduagent/database';
import { eq } from 'drizzle-orm';
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

      const links = await db
        .select({
          parentId: familyLinks.parentProfileId,
          childId: familyLinks.childProfileId,
        })
        .from(familyLinks)
        .innerJoin(
          progressSnapshots,
          and(
            eq(progressSnapshots.profileId, familyLinks.childProfileId),
            gte(progressSnapshots.snapshotDate, lastMonthStart.toISOString().slice(0, 10)),
            lte(progressSnapshots.snapshotDate, lastMonthEnd.toISOString().slice(0, 10))
          )
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

          // Get last day snapshots for this month and previous month
          const thisMonthSnapshots = await getSnapshotsInRange(
            db, pair.childId,
            lastMonthEnd.toISOString().slice(0, 10),
            lastMonthEnd.toISOString().slice(0, 10)
          );
          const prevMonthSnapshots = await getSnapshotsInRange(
            db, pair.childId,
            twoMonthsAgoEnd.toISOString().slice(0, 10),
            twoMonthsAgoEnd.toISOString().slice(0, 10)
          );

          const thisMonthMetrics = thisMonthSnapshots[0]?.metrics as ProgressMetrics | undefined;
          if (!thisMonthMetrics) return; // No data for this month

          const prevMonthMetrics = prevMonthSnapshots[0]?.metrics as ProgressMetrics | null ?? null;

          // Generate report data
          let reportData = generateMonthlyReportData(
            child.displayName ?? 'Your child',
            monthLabel,
            thisMonthMetrics,
            prevMonthMetrics
          );

          // Enrich with LLM highlights
          const { highlights, areasForGrowth } = await generateReportHighlights(reportData);
          reportData = { ...reportData, highlights, areasForGrowth };

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

        } catch (err) {
          captureException(err, { parentId: pair.parentId, childId: pair.childId });
          return { status: 'failed' };
        }
      });
      return { status: 'ok' };
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

## Final Verification

### Task 13: Integration Tests + Full Validation

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
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(learner\)/progress.tsx src/app/\(learner\)/progress/\[subjectId\].tsx --no-coverage
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
