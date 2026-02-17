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

// ---------------------------------------------------------------------------
// Coaching Cards (Epic 4 — Story 4.4)
// ---------------------------------------------------------------------------

export const coachingCardTypeSchema = z.enum([
  'streak',
  'insight',
  'review_due',
  'challenge',
]);
export type CoachingCardType = z.infer<typeof coachingCardTypeSchema>;

const baseCoachingCardFields = {
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  type: coachingCardTypeSchema,
  title: z.string(),
  body: z.string(),
  priority: z.number().int().min(1).max(10),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
};

export const streakCardSchema = z.object({
  ...baseCoachingCardFields,
  type: z.literal('streak'),
  currentStreak: z.number().int().min(0),
  graceRemaining: z.number().int().min(0).max(3),
});
export type StreakCard = z.infer<typeof streakCardSchema>;

export const insightCardSchema = z.object({
  ...baseCoachingCardFields,
  type: z.literal('insight'),
  topicId: z.string().uuid(),
  insightType: z.enum(['strength', 'growth_area', 'pattern', 'milestone']),
});
export type InsightCard = z.infer<typeof insightCardSchema>;

export const reviewDueCardSchema = z.object({
  ...baseCoachingCardFields,
  type: z.literal('review_due'),
  topicId: z.string().uuid(),
  dueAt: z.string().datetime(),
  easeFactor: z.number().min(1.3),
});
export type ReviewDueCard = z.infer<typeof reviewDueCardSchema>;

export const challengeCardSchema = z.object({
  ...baseCoachingCardFields,
  type: z.literal('challenge'),
  topicId: z.string().uuid(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  xpReward: z.number().int().min(0),
});
export type ChallengeCard = z.infer<typeof challengeCardSchema>;

export const coachingCardSchema = z.discriminatedUnion('type', [
  streakCardSchema,
  insightCardSchema,
  reviewDueCardSchema,
  challengeCardSchema,
]);
export type CoachingCard = z.infer<typeof coachingCardSchema>;
