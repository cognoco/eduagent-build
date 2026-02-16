import { z } from 'zod';

export const learningModeSchema = z.enum(['serious', 'casual']);
export type LearningMode = z.infer<typeof learningModeSchema>;

export const streakSchema = z.object({
  currentStreak: z.number().int().min(0),
  longestStreak: z.number().int().min(0),
  lastActivityDate: z.string().nullable(),
  gracePeriodStartDate: z.string().nullable(),
  isOnGracePeriod: z.boolean(),
  graceDaysRemaining: z.number().int().min(0).max(3),
});
export type Streak = z.infer<typeof streakSchema>;

export const xpSummarySchema = z.object({
  totalXp: z.number().int(),
  verifiedXp: z.number().int(),
  pendingXp: z.number().int(),
  decayedXp: z.number().int(),
  topicsCompleted: z.number().int(),
  topicsVerified: z.number().int(),
});
export type XpSummary = z.infer<typeof xpSummarySchema>;

export const notificationPrefsSchema = z.object({
  reviewReminders: z.boolean(),
  dailyReminders: z.boolean(),
  pushEnabled: z.boolean(),
  maxDailyPush: z.number().int().min(1).max(10).optional(),
});
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;

export const learningModeUpdateSchema = z.object({
  mode: learningModeSchema,
});
export type LearningModeUpdate = z.infer<typeof learningModeUpdateSchema>;

export const subjectProgressSchema = z.object({
  subjectId: z.string().uuid(),
  name: z.string(),
  topicsTotal: z.number().int(),
  topicsCompleted: z.number().int(),
  topicsVerified: z.number().int(),
  urgencyScore: z.number(),
  retentionStatus: z.enum(['strong', 'fading', 'weak']),
  lastSessionAt: z.string().datetime().nullable(),
});
export type SubjectProgress = z.infer<typeof subjectProgressSchema>;

export const topicProgressSchema = z.object({
  topicId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  completionStatus: z.enum([
    'not_started',
    'in_progress',
    'completed',
    'verified',
    'stable',
  ]),
  retentionStatus: z.enum(['strong', 'fading', 'weak', 'forgotten']).nullable(),
  struggleStatus: z.enum(['normal', 'needs_deepening', 'blocked']),
  masteryScore: z.number().min(0).max(1).nullable(),
  summaryExcerpt: z.string().nullable(),
  xpStatus: z.enum(['pending', 'verified', 'decayed']).nullable(),
});
export type TopicProgress = z.infer<typeof topicProgressSchema>;

export const dashboardChildSchema = z.object({
  profileId: z.string().uuid(),
  displayName: z.string(),
  summary: z.string(),
  sessionsThisWeek: z.number().int(),
  sessionsLastWeek: z.number().int(),
  totalTimeThisWeek: z.number().int(),
  totalTimeLastWeek: z.number().int(),
  trend: z.enum(['up', 'down', 'stable']),
  subjects: z.array(
    z.object({
      name: z.string(),
      retentionStatus: z.enum(['strong', 'fading', 'weak']),
    })
  ),
  guidedVsImmediateRatio: z.number().min(0).max(1),
});
export type DashboardChild = z.infer<typeof dashboardChildSchema>;
