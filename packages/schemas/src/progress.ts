import { z } from 'zod';
import { milestoneTypeSchema } from './snapshots';

export const learningModeSchema = z.enum(['serious', 'casual']);
export type LearningMode = z.infer<typeof learningModeSchema>;

export const celebrationNameSchema = z.enum([
  'polar_star',
  'twin_stars',
  'comet',
  'orions_belt',
]);
export type CelebrationName = z.infer<typeof celebrationNameSchema>;

export const celebrationReasonSchema = z.enum([
  'polar_star',
  'twin_stars',
  'comet',
  'orions_belt',
  'deep_diver',
  'persistent',
  'topic_mastered',
  'curriculum_complete',
  'evaluate_success',
  'teach_back_success',
  'streak_7',
  'streak_30',
]);
export type CelebrationReason = z.infer<typeof celebrationReasonSchema>;

export const celebrationLevelSchema = z.enum(['all', 'big_only', 'off']);
export type CelebrationLevel = z.infer<typeof celebrationLevelSchema>;

export const pendingCelebrationSchema = z.object({
  celebration: celebrationNameSchema,
  reason: celebrationReasonSchema,
  detail: z.string().nullable().optional(),
  queuedAt: z.string().datetime(),
});
export type PendingCelebration = z.infer<typeof pendingCelebrationSchema>;

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
  weeklyProgressPush: z.boolean().optional(),
  pushEnabled: z.boolean(),
  maxDailyPush: z.number().int().min(1).max(10).optional(),
});
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;

export const learningModeUpdateSchema = z.object({
  mode: learningModeSchema,
});
export type LearningModeUpdate = z.infer<typeof learningModeUpdateSchema>;

export const celebrationLevelUpdateSchema = z.object({
  celebrationLevel: celebrationLevelSchema,
});
export type CelebrationLevelUpdate = z.infer<
  typeof celebrationLevelUpdateSchema
>;

export const celebrationSeenSchema = z.object({
  viewer: z.enum(['child', 'parent']),
});
export type CelebrationSeenInput = z.infer<typeof celebrationSeenSchema>;

export const pushTokenRegisterSchema = z.object({
  token: z.string().min(1),
});
export type PushTokenRegisterInput = z.infer<typeof pushTokenRegisterSchema>;

export const subjectProgressSchema = z.object({
  subjectId: z.string().uuid(),
  name: z.string(),
  topicsTotal: z.number().int(),
  topicsCompleted: z.number().int(),
  topicsVerified: z.number().int(),
  urgencyScore: z.number(),
  retentionStatus: z.enum(['strong', 'fading', 'weak', 'forgotten']),
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
  totalSessions: z.number().int().min(0),
});
export type TopicProgress = z.infer<typeof topicProgressSchema>;

export const learningResumeScopeSchema = z.object({
  subjectId: z.string().uuid().optional(),
  bookId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
});
export type LearningResumeScope = z.infer<typeof learningResumeScopeSchema>;

export const learningResumeKindSchema = z.enum([
  'active_session',
  'paused_session',
  'recent_topic',
  'next_topic',
  'subject_freeform',
]);
export type LearningResumeKind = z.infer<typeof learningResumeKindSchema>;

export const learningResumeTargetSchema = z.object({
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  topicId: z.string().uuid().nullable(),
  topicTitle: z.string().nullable(),
  sessionId: z.string().uuid().nullable(),
  resumeFromSessionId: z.string().uuid().nullable(),
  resumeKind: learningResumeKindSchema,
  lastActivityAt: z.string().datetime().nullable(),
  reason: z.string(),
});
export type LearningResumeTarget = z.infer<typeof learningResumeTargetSchema>;

export const dashboardChildProgressSchema = z.object({
  snapshotDate: z.string(),
  topicsMastered: z.number().int(),
  vocabularyTotal: z.number().int(),
  minutesThisWeek: z.number().int(),
  weeklyDeltaTopicsMastered: z.number().int().nullable(),
  weeklyDeltaVocabularyTotal: z.number().int().nullable(),
  weeklyDeltaTopicsExplored: z.number().int().nullable(),
  engagementTrend: z.enum(['increasing', 'stable', 'declining']),
  guidance: z.string().nullable(),
});
export type DashboardChildProgress = z.infer<
  typeof dashboardChildProgressSchema
>;

export const dashboardChildSchema = z.object({
  profileId: z.string().uuid(),
  displayName: z.string(),
  summary: z.string(),
  sessionsThisWeek: z.number().int(),
  sessionsLastWeek: z.number().int(),
  totalTimeThisWeek: z.number().int(),
  totalTimeLastWeek: z.number().int(),
  exchangesThisWeek: z.number().int(),
  exchangesLastWeek: z.number().int(),
  trend: z.enum(['up', 'down', 'stable']),
  subjects: z.array(
    z.object({
      subjectId: z.string().uuid().optional(),
      name: z.string(),
      retentionStatus: z.enum(['strong', 'fading', 'weak', 'forgotten']),
      rawInput: z.string().nullable().optional(),
    })
  ),
  guidedVsImmediateRatio: z.number().min(0).max(1),
  retentionTrend: z.enum(['improving', 'declining', 'stable']),
  totalSessions: z.number().int(),
  progress: dashboardChildProgressSchema.nullable().optional(),
  currentStreak: z.number().int().default(0),
  longestStreak: z.number().int().default(0),
  totalXp: z.number().int().default(0),
});
export type DashboardChild = z.infer<typeof dashboardChildSchema>;

export const coachingCardCelebrationResponseSchema = z.object({
  pendingCelebrations: z.array(pendingCelebrationSchema),
});
export type CoachingCardCelebrationResponse = z.infer<
  typeof coachingCardCelebrationResponseSchema
>;

// Dashboard data — parent view wrapper

export const dashboardDataSchema = z.object({
  children: z.array(dashboardChildSchema),
  demoMode: z.boolean(),
});
export type DashboardData = z.infer<typeof dashboardDataSchema>;

// ---------------------------------------------------------------------------
// Coaching Cards (Epic 4 — Story 4.4)
// ---------------------------------------------------------------------------

export const coachingCardTypeSchema = z.enum([
  'streak',
  'insight',
  'review_due',
  'challenge',
  'curriculum_complete',
  'homework_connection',
  'continue_book',
  'book_suggestion',
  'milestone_celebration',
  'quiz_discovery',
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

export const curriculumCompleteCardSchema = z.object({
  ...baseCoachingCardFields,
  type: z.literal('curriculum_complete'),
});
export type CurriculumCompleteCard = z.infer<
  typeof curriculumCompleteCardSchema
>;

// --- Epic 7: Book-aware coaching cards ---

export const homeworkConnectionCardSchema = z.object({
  ...baseCoachingCardFields,
  type: z.literal('homework_connection'),
  topicId: z.string().uuid(),
  bookTitle: z.string().nullable(),
  bookEmoji: z.string().nullable(),
  homeworkSkill: z.string(),
});
export type HomeworkConnectionCard = z.infer<
  typeof homeworkConnectionCardSchema
>;

export const continueBookCardSchema = z.object({
  ...baseCoachingCardFields,
  type: z.literal('continue_book'),
  topicId: z.string().uuid(),
  bookTitle: z.string(),
  bookEmoji: z.string().nullable(),
});
export type ContinueBookCard = z.infer<typeof continueBookCardSchema>;

export const bookSuggestionCardSchema = z.object({
  ...baseCoachingCardFields,
  type: z.literal('book_suggestion'),
  bookId: z.string().uuid(),
  bookTitle: z.string(),
  bookEmoji: z.string().nullable(),
  subjectName: z.string(),
});
export type BookSuggestionCard = z.infer<typeof bookSuggestionCardSchema>;

export const milestoneCelebrationCardSchema = z.object({
  ...baseCoachingCardFields,
  type: z.literal('milestone_celebration'),
  milestoneId: z.string().uuid(),
  milestoneType: milestoneTypeSchema,
  threshold: z.number().int(),
});
export type MilestoneCelebrationCard = z.infer<
  typeof milestoneCelebrationCardSchema
>;

export const quizDiscoveryCardSchema = z.object({
  ...baseCoachingCardFields,
  type: z.literal('quiz_discovery'),
  activityType: z.enum(['capitals', 'vocabulary', 'guess_who']),
  missedItemCount: z.number().int().min(1),
});
export type QuizDiscoveryCard = z.infer<typeof quizDiscoveryCardSchema>;

export const coachingCardSchema = z.discriminatedUnion('type', [
  streakCardSchema,
  insightCardSchema,
  reviewDueCardSchema,
  challengeCardSchema,
  curriculumCompleteCardSchema,
  homeworkConnectionCardSchema,
  continueBookCardSchema,
  bookSuggestionCardSchema,
  milestoneCelebrationCardSchema,
  quizDiscoveryCardSchema,
]);
export type CoachingCard = z.infer<typeof coachingCardSchema>;

// ---------------------------------------------------------------------------
// Home Cards (Epic 12 / Epic 14 home-surface parity)
// ---------------------------------------------------------------------------

export const homeCardIdSchema = z.enum([
  'resume_session',
  'restore_subjects',
  'curriculum_complete',
  'review',
  'study',
  'homework',
  'ask',
  'family',
  'link_child',
]);
export type HomeCardId = z.infer<typeof homeCardIdSchema>;

export const homeCardSchema = z.object({
  id: homeCardIdSchema,
  title: z.string(),
  subtitle: z.string(),
  badge: z.string().optional(),
  primaryLabel: z.string(),
  secondaryLabel: z.string().optional(),
  priority: z.number().int(),
  compact: z.boolean().optional(),
  subjectId: z.string().uuid().optional(),
  subjectName: z.string().optional(),
  topicId: z.string().uuid().optional(),
  topicName: z.string().optional(),
});
export type HomeCard = z.infer<typeof homeCardSchema>;

export const homeCardsResponseSchema = z.object({
  cards: z.array(homeCardSchema),
  coldStart: z.boolean(),
});
export type HomeCardsResponse = z.infer<typeof homeCardsResponseSchema>;

export const homeCardInteractionTypeSchema = z.enum(['tap', 'dismiss']);
export type HomeCardInteractionType = z.infer<
  typeof homeCardInteractionTypeSchema
>;

export const homeCardInteractionSchema = z.object({
  cardId: homeCardIdSchema,
  interactionType: homeCardInteractionTypeSchema,
});
export type HomeCardInteractionInput = z.infer<
  typeof homeCardInteractionSchema
>;

// ---------------------------------------------------------------------------
// Daily Learning Plan (recall notifications + home screen plan)
// ---------------------------------------------------------------------------

export const dailyPlanItemSchema = z.object({
  type: z.enum(['review', 'continue', 'streak']),
  title: z.string(),
  subtitle: z.string(),
  estimatedMinutes: z.number().int().optional(),
  route: z.string(),
  topicId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
});
export type DailyPlanItem = z.infer<typeof dailyPlanItemSchema>;

export const dailyPlanSchema = z.object({
  greeting: z.string(),
  items: z.array(dailyPlanItemSchema).max(4),
  streakDays: z.number().int(),
});
export type DailyPlan = z.infer<typeof dailyPlanSchema>;

// ---------------------------------------------------------------------------
// Overdue Topics (relearn flow)
// ---------------------------------------------------------------------------

export const overdueTopicSchema = z.object({
  topicId: z.string().uuid(),
  topicTitle: z.string(),
  overdueDays: z.number().int().min(0),
  failureCount: z.number().int().min(0),
});
export type OverdueTopic = z.infer<typeof overdueTopicSchema>;

export const overdueSubjectSchema = z.object({
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  overdueCount: z.number().int().min(0),
  topics: z.array(overdueTopicSchema),
});
export type OverdueSubject = z.infer<typeof overdueSubjectSchema>;

export const overdueTopicsResponseSchema = z.object({
  totalOverdue: z.number().int().min(0),
  subjects: z.array(overdueSubjectSchema),
});
export type OverdueTopicsResponse = z.infer<typeof overdueTopicsResponseSchema>;

// ---------------------------------------------------------------------------
// Route-level response schemas (progress routes)
// ---------------------------------------------------------------------------

export const subjectProgressEndpointResponseSchema = z.object({
  progress: subjectProgressSchema,
});
export type SubjectProgressEndpointResponse = z.infer<
  typeof subjectProgressEndpointResponseSchema
>;

export const topicProgressEndpointResponseSchema = z.object({
  topic: topicProgressSchema,
});
export type TopicProgressEndpointResponse = z.infer<
  typeof topicProgressEndpointResponseSchema
>;

export const progressOverviewResponseSchema = z.object({
  subjects: z.array(subjectProgressSchema),
  totalTopicsCompleted: z.number().int(),
  totalTopicsVerified: z.number().int(),
});
export type ProgressOverviewResponse = z.infer<
  typeof progressOverviewResponseSchema
>;

export const nextReviewTopicSchema = z.object({
  topicId: z.string().uuid(),
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  topicTitle: z.string(),
});
export type NextReviewTopic = z.infer<typeof nextReviewTopicSchema>;

export const reviewSummaryResponseSchema = z.object({
  totalOverdue: z.number().int().min(0),
  nextReviewTopic: nextReviewTopicSchema.nullable(),
  nextUpcomingReviewAt: z.string().nullable(),
});
export type ReviewSummaryResponse = z.infer<typeof reviewSummaryResponseSchema>;

export const activeSessionResponseSchema = z
  .object({ sessionId: z.string().uuid() })
  .nullable();
export type ActiveSessionResponse = z.infer<typeof activeSessionResponseSchema>;

export const topicResolveResponseSchema = z.object({
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  topicTitle: z.string(),
});
export type TopicResolveResponse = z.infer<typeof topicResolveResponseSchema>;

export const resumeTargetResponseSchema = z.object({
  target: learningResumeTargetSchema.nullable(),
});
export type ResumeTargetResponse = z.infer<typeof resumeTargetResponseSchema>;

export const continueSuggestionSchema = z
  .object({
    subjectId: z.string().uuid(),
    subjectName: z.string(),
    topicId: z.string().uuid(),
    topicTitle: z.string(),
    lastSessionId: z.string().uuid().nullable(),
  })
  .nullable();

export const continueSuggestionResponseSchema = z.object({
  suggestion: continueSuggestionSchema,
});
export type ContinueSuggestionResponse = z.infer<
  typeof continueSuggestionResponseSchema
>;
