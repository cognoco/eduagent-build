import { z } from 'zod';
import { isoDateSchema } from './common.ts';

const pedagogyModeSchema = z.enum(['socratic', 'four_strands']);

export const subjectProgressMetricsSchema = z.object({
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  pedagogyMode: pedagogyModeSchema,
  topicsAttempted: z.number().int(),
  topicsMastered: z.number().int(),
  topicsTotal: z.number().int(),
  // [EP15-C8] default(0) keeps pre-existing JSONB snapshots parseable after
  // the topicsExplored field was added (FR241.5). Without it, reads of old
  // snapshot rows throw and the `?? 0` fallbacks elsewhere are never reached.
  topicsExplored: z.number().int().default(0),
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
  totalSessions: z.number().int(),
  totalActiveMinutes: z.number().int(),
  totalWallClockMinutes: z.number().int(),
  totalExchanges: z.number().int(),
  topicsAttempted: z.number().int(),
  topicsMastered: z.number().int(),
  topicsInProgress: z.number().int(),
  vocabularyTotal: z.number().int(),
  vocabularyMastered: z.number().int(),
  vocabularyLearning: z.number().int(),
  vocabularyNew: z.number().int(),
  retentionCardsDue: z.number().int(),
  retentionCardsStrong: z.number().int(),
  retentionCardsFading: z.number().int(),
  currentStreak: z.number().int(),
  longestStreak: z.number().int(),
  subjects: z.array(subjectProgressMetricsSchema),
});
export type ProgressMetrics = z.infer<typeof progressMetricsSchema>;

export const subjectInventorySchema = z.object({
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  pedagogyMode: pedagogyModeSchema,
  topics: z.object({
    total: z.number().int().nullable(),
    explored: z.number().int(),
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
  estimatedProficiencyLabel: z.string().nullable(),
  lastSessionAt: z.string().datetime().nullable(),
  activeMinutes: z.number().int(),
  sessionsCount: z.number().int(),
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

export const progressDataPointSchema = z.object({
  date: z.string(),
  topicsMastered: z.number().int(),
  topicsAttempted: z.number().int(),
  // [EP15-C8] default(0) — same forward-compat rationale as subjectProgressMetricsSchema
  topicsExplored: z.number().int().default(0),
  vocabularyTotal: z.number().int(),
  vocabularyMastered: z.number().int(),
  totalSessions: z.number().int(),
  totalActiveMinutes: z.number().int(),
  currentStreak: z.number().int(),
});
export type ProgressDataPoint = z.infer<typeof progressDataPointSchema>;

export const historyQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  granularity: z.enum(['daily', 'weekly']).optional(),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

export const progressHistorySchema = z.object({
  profileId: z.string().uuid(),
  from: isoDateSchema,
  to: isoDateSchema,
  granularity: z.enum(['daily', 'weekly']),
  dataPoints: z.array(progressDataPointSchema),
});
export type ProgressHistory = z.infer<typeof progressHistorySchema>;

export const milestoneTypeSchema = z.enum([
  'vocabulary_count',
  'topic_mastered_count',
  'session_count',
  'streak_length',
  'subject_mastered',
  'book_completed',
  'learning_time',
  'cefr_level_up',
  'topics_explored',
]);
export type MilestoneType = z.infer<typeof milestoneTypeSchema>;

export const milestoneRecordSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  milestoneType: milestoneTypeSchema,
  threshold: z.number().int(),
  subjectId: z.string().uuid().nullable().optional(),
  bookId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  celebratedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type MilestoneRecord = z.infer<typeof milestoneRecordSchema>;

export const monthMetricsSchema = z.object({
  totalSessions: z.number().int(),
  totalActiveMinutes: z.number().int(),
  topicsMastered: z.number().int(),
  topicsExplored: z.number().int(),
  // [EP15-I2 AR-6] Renamed from `vocabularyLearned`. The previous name
  // implied per-month delta but `lastMonth` stored a cumulative total
  // (split-personality field). `vocabularyTotal` unambiguously holds the
  // cumulative vocabulary count at month end — deltas are computed at
  // display time from `thisMonth.vocabularyTotal - lastMonth.vocabularyTotal`.
  vocabularyTotal: z.number().int(),
  streakBest: z.number().int(),
});
export type MonthMetrics = z.infer<typeof monthMetricsSchema>;

export const subjectMonthlyDetailSchema = z.object({
  subjectName: z.string(),
  topicsMastered: z.number().int(),
  topicsAttempted: z.number().int(),
  topicsExplored: z.number().int(),
  // [EP15-I2 AR-6] Cumulative vocabulary count for this subject at month end.
  // See monthMetricsSchema comment above for the rename rationale.
  vocabularyTotal: z.number().int(),
  activeMinutes: z.number().int(),
  trend: z.enum(['growing', 'stable', 'declining']),
});
export type SubjectMonthlyDetail = z.infer<typeof subjectMonthlyDetailSchema>;

export const monthlyReportHeadlineSchema = z.object({
  label: z.string(),
  value: z.number().int(),
  comparison: z.string(),
});
export type MonthlyReportHeadline = z.infer<typeof monthlyReportHeadlineSchema>;

export const monthlyReportDataSchema = z.object({
  childName: z.string(),
  month: z.string(),
  thisMonth: monthMetricsSchema,
  lastMonth: monthMetricsSchema.nullable(),
  highlights: z.array(z.string()),
  nextSteps: z.array(z.string()),
  subjects: z.array(subjectMonthlyDetailSchema),
  headlineStat: monthlyReportHeadlineSchema,
});
export type MonthlyReportData = z.infer<typeof monthlyReportDataSchema>;

export const monthlyReportRecordSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  childProfileId: z.string().uuid(),
  reportMonth: z.string(),
  reportData: monthlyReportDataSchema,
  viewedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type MonthlyReportRecord = z.infer<typeof monthlyReportRecordSchema>;

export const monthlyReportSummarySchema = z.object({
  id: z.string().uuid(),
  reportMonth: z.string(),
  viewedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  headlineStat: monthlyReportHeadlineSchema,
});
export type MonthlyReportSummary = z.infer<typeof monthlyReportSummarySchema>;
