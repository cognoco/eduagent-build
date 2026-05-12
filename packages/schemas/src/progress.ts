import { z } from 'zod';
import {
  milestoneTypeSchema,
  knowledgeInventorySchema,
  progressHistorySchema,
  monthlyReportSummarySchema,
  monthlyReportRecordSchema,
  monthlyReportHeadlineSchema,
  weeklyReportSummarySchema,
  weeklyReportRecordSchema,
  reportPracticeSummarySchema,
} from './snapshots';
import { consentStatusSchema } from './consent';

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

export const withdrawalArchivePreferenceSchema = z.enum([
  'auto',
  'always',
  'never',
]);
export type WithdrawalArchivePreference = z.infer<
  typeof withdrawalArchivePreferenceSchema
>;

export const withdrawalArchivePreferenceUpdateSchema = z.object({
  value: withdrawalArchivePreferenceSchema,
});
export type WithdrawalArchivePreferenceUpdate = z.infer<
  typeof withdrawalArchivePreferenceUpdateSchema
>;

export const familyPoolBreakdownSharingUpdateSchema = z.object({
  value: z.boolean(),
});
export type FamilyPoolBreakdownSharingUpdate = z.infer<
  typeof familyPoolBreakdownSharingUpdateSchema
>;

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
  weeklyProgressEmail: z.boolean().optional(),
  monthlyProgressEmail: z.boolean().optional(),
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
  childProfileId: z.string().uuid().optional(),
});
export type CelebrationLevelUpdate = z.infer<
  typeof celebrationLevelUpdateSchema
>;

export const celebrationLevelQuerySchema = z.object({
  childProfileId: z.string().uuid().optional(),
});
export type CelebrationLevelQuery = z.infer<typeof celebrationLevelQuerySchema>;

export const celebrationSeenSchema = z.object({
  viewer: z.enum(['child', 'parent']),
});
export type CelebrationSeenInput = z.infer<typeof celebrationSeenSchema>;

export const pushTokenRegisterSchema = z.object({
  token: z.string().min(1),
});
export type PushTokenRegisterInput = z.infer<typeof pushTokenRegisterSchema>;

// ---------------------------------------------------------------------------
// Route-level response schemas (settings routes)
// ---------------------------------------------------------------------------

// Response variant: server always populates the optional fields, so they are
// required and the bounded range is loosened (the client should accept any
// historical value the DB might still hold).
export const notificationPrefsResponseSchema = notificationPrefsSchema.extend({
  weeklyProgressPush: z.boolean(),
  weeklyProgressEmail: z.boolean(),
  monthlyProgressEmail: z.boolean(),
  maxDailyPush: z.number().int(),
});
export type NotificationPrefsResponse = z.infer<
  typeof notificationPrefsResponseSchema
>;

export const getNotificationsResponseSchema = z.object({
  preferences: notificationPrefsResponseSchema,
});
export type GetNotificationsResponse = z.infer<
  typeof getNotificationsResponseSchema
>;

export const getLearningModeResponseSchema = z.object({
  mode: learningModeSchema,
});
export type GetLearningModeResponse = z.infer<
  typeof getLearningModeResponseSchema
>;

export const getCelebrationLevelResponseSchema = z.object({
  celebrationLevel: celebrationLevelSchema,
});
export type GetCelebrationLevelResponse = z.infer<
  typeof getCelebrationLevelResponseSchema
>;

export const getWithdrawalArchivePreferenceResponseSchema = z.object({
  value: withdrawalArchivePreferenceSchema,
});
export type GetWithdrawalArchivePreferenceResponse = z.infer<
  typeof getWithdrawalArchivePreferenceResponseSchema
>;

export const updateWithdrawalArchivePreferenceResponseSchema = z.object({
  value: withdrawalArchivePreferenceSchema,
});
export type UpdateWithdrawalArchivePreferenceResponse = z.infer<
  typeof updateWithdrawalArchivePreferenceResponseSchema
>;

export const getFamilyPoolBreakdownSharingResponseSchema = z.object({
  value: z.boolean(),
});
export type GetFamilyPoolBreakdownSharingResponse = z.infer<
  typeof getFamilyPoolBreakdownSharingResponseSchema
>;

export const updateFamilyPoolBreakdownSharingResponseSchema = z.object({
  value: z.boolean(),
});
export type UpdateFamilyPoolBreakdownSharingResponse = z.infer<
  typeof updateFamilyPoolBreakdownSharingResponseSchema
>;

// GET /celebrations/pending
export const pendingCelebrationsResponseSchema = z.object({
  pendingCelebrations: z.array(pendingCelebrationSchema),
});
export type PendingCelebrationsResponse = z.infer<
  typeof pendingCelebrationsResponseSchema
>;

// POST /celebrations/seen
export const celebrationSeenResponseSchema = z.object({
  ok: z.literal(true),
});
export type CelebrationSeenResponse = z.infer<
  typeof celebrationSeenResponseSchema
>;

export const pushTokenRegisteredResponseSchema = z.object({
  registered: z.boolean(),
});
export type PushTokenRegisteredResponse = z.infer<
  typeof pushTokenRegisteredResponseSchema
>;

export const notifyParentSubscribeResponseSchema = z.object({
  sent: z.boolean(),
  rateLimited: z.boolean(),
  reason: z.string().optional(),
});
export type NotifyParentSubscribeResponse = z.infer<
  typeof notifyParentSubscribeResponseSchema
>;

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
  daysSinceLastReview: z.number().int().min(0).nullable(),
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
  consentStatus: consentStatusSchema.nullable(),
  respondedAt: z.string().datetime().nullable(),
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
    }),
  ),
  guidedVsImmediateRatio: z.number().min(0).max(1),
  retentionTrend: z.enum(['improving', 'declining', 'stable']),
  totalSessions: z.number().int(),
  weeklyHeadline: monthlyReportHeadlineSchema.optional(),
  currentlyWorkingOn: z.array(z.string()).default([]),
  progress: dashboardChildProgressSchema.nullable().optional(),
  currentStreak: z.number().int().default(0),
  longestStreak: z.number().int().default(0),
  totalXp: z.number().int().default(0),
});
export type DashboardChild = z.infer<typeof dashboardChildSchema>;

export const pendingNoticeTypeSchema = z.enum([
  'consent_archived',
  'consent_deleted',
]);
export type PendingNoticeType = z.infer<typeof pendingNoticeTypeSchema>;

export const pendingNoticeSchema = z.object({
  id: z.string().uuid(),
  type: pendingNoticeTypeSchema,
  payload: z.object({
    childName: z.string(),
  }),
  createdAt: z.string().datetime(),
});
export type PendingNotice = z.infer<typeof pendingNoticeSchema>;

// Dashboard data — parent view wrapper

export const dashboardDataSchema = z.object({
  children: z.array(dashboardChildSchema),
  pendingNotices: z.array(pendingNoticeSchema).default([]),
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
  practiceActivityCount: z.number().int().min(0).default(0),
  practiceSummary: reportPracticeSummarySchema.optional(),
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

// ---------------------------------------------------------------------------
// Route-level response schemas (streaks routes)
// ---------------------------------------------------------------------------

export const streakEndpointResponseSchema = z.object({
  streak: streakSchema,
});
export type StreakEndpointResponse = z.infer<
  typeof streakEndpointResponseSchema
>;

export const xpSummaryEndpointResponseSchema = z.object({
  xp: xpSummarySchema,
});
export type XpSummaryEndpointResponse = z.infer<
  typeof xpSummaryEndpointResponseSchema
>;

// ---------------------------------------------------------------------------
// Route-level response schemas (dashboard routes)
// ---------------------------------------------------------------------------

// GET /dashboard — already covered by dashboardDataSchema. Re-export as a
// named response schema to follow the same naming convention as other routes.
export const dashboardResponseSchema = dashboardDataSchema;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

// GET /dashboard/children/:profileId
export const childDetailResponseSchema = z.object({
  child: dashboardChildSchema.nullable(),
});
export type ChildDetailResponse = z.infer<typeof childDetailResponseSchema>;

// GET /dashboard/children/:profileId/inventory
export const childInventoryResponseSchema = z.object({
  inventory: knowledgeInventorySchema,
});
export type ChildInventoryResponse = z.infer<
  typeof childInventoryResponseSchema
>;

// GET /dashboard/children/:profileId/progress-history
export const childProgressHistoryResponseSchema = z.object({
  history: progressHistorySchema,
});
export type ChildProgressHistoryResponse = z.infer<
  typeof childProgressHistoryResponseSchema
>;

// GET /dashboard/children/:profileId/subjects/:subjectId
export const childSubjectTopicsResponseSchema = z.object({
  topics: z.array(topicProgressSchema),
});
export type ChildSubjectTopicsResponse = z.infer<
  typeof childSubjectTopicsResponseSchema
>;

// Child session schema — mirrors the ChildSession interface in services/dashboard.ts.
// Uses inline enum values to avoid a circular import with sessions.ts
// (which already imports from progress.ts).
const homeworkSummaryInlineSchema = z.object({
  problemCount: z.number().int().min(0),
  practicedSkills: z.array(z.string()),
  independentProblemCount: z.number().int().min(0),
  guidedProblemCount: z.number().int().min(0),
  summary: z.string().min(1),
  displayTitle: z.string().min(1),
});

const childSessionDrillScoreSchema = z.object({
  correct: z.number().int().min(0),
  total: z.number().int().min(1),
  createdAt: z.string().datetime(),
});

export const childSessionSchema = z.object({
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  subjectName: z.string().nullable(),
  topicId: z.string().uuid().nullable(),
  topicTitle: z.string().nullable(),
  sessionType: z.enum(['learning', 'homework', 'interleaved']),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  exchangeCount: z.number().int(),
  escalationRung: z.number().int().min(1).max(5),
  durationSeconds: z.number().int().nullable(),
  wallClockSeconds: z.number().int().nullable(),
  displayTitle: z.string(),
  displaySummary: z.string().nullable(),
  homeworkSummary: homeworkSummaryInlineSchema.nullable(),
  highlight: z.string().nullable(),
  narrative: z.string().nullable(),
  conversationPrompt: z.string().nullable(),
  engagementSignal: z
    .enum(['curious', 'stuck', 'breezing', 'focused', 'scattered'])
    .nullable(),
  drills: z.array(childSessionDrillScoreSchema),
});
export type ChildSession = z.infer<typeof childSessionSchema>;

// GET /dashboard/children/:profileId/sessions
export const childSessionsResponseSchema = z.object({
  sessions: z.array(childSessionSchema),
});
export type ChildSessionsResponse = z.infer<typeof childSessionsResponseSchema>;

// GET /dashboard/children/:profileId/sessions/:sessionId
export const childSessionDetailResponseSchema = z.object({
  session: childSessionSchema,
});
export type ChildSessionDetailResponse = z.infer<
  typeof childSessionDetailResponseSchema
>;

// Curated memory view schema — shared contract for API and mobile memory UI.
export const memoryCategoryKeySchema = z.enum([
  'struggles',
  'interests',
  'strengths',
  'communicationNotes',
  'learningStyle',
]);
export type MemoryCategoryKey = z.infer<typeof memoryCategoryKeySchema>;

export const curatedMemoryItemSchema = z.object({
  category: memoryCategoryKeySchema,
  value: z.string(),
  statement: z.string(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
});
export type CuratedMemoryItem = z.infer<typeof curatedMemoryItemSchema>;

export const memoryCategorySchema = z.object({
  label: z.string(),
  items: z.array(curatedMemoryItemSchema),
});
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;

export const parentTellItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string(),
});
export type ParentTellItem = z.infer<typeof parentTellItemSchema>;

export const curatedMemoryViewSchema = z.object({
  categories: z.array(memoryCategorySchema),
  parentContributions: z.array(parentTellItemSchema),
  settings: z.object({
    memoryEnabled: z.boolean(),
    collectionEnabled: z.boolean(),
    injectionEnabled: z.boolean(),
    accommodationMode: z.string().nullable(),
  }),
});
export type CuratedMemoryView = z.infer<typeof curatedMemoryViewSchema>;

// GET /dashboard/children/:profileId/memory
export const childMemoryResponseSchema = z.object({
  memory: curatedMemoryViewSchema,
});
export type ChildMemoryResponse = z.infer<typeof childMemoryResponseSchema>;

// GET /dashboard/children/:profileId/reports
export const childReportsResponseSchema = z.object({
  reports: z.array(monthlyReportSummarySchema),
});
export type ChildReportsResponse = z.infer<typeof childReportsResponseSchema>;

// GET /dashboard/children/:profileId/reports/:reportId
export const childReportDetailResponseSchema = z.object({
  report: monthlyReportRecordSchema,
});
export type ChildReportDetailResponse = z.infer<
  typeof childReportDetailResponseSchema
>;

// POST /dashboard/children/:profileId/reports/:reportId/view
// POST /dashboard/children/:profileId/weekly-reports/:reportId/view
export const reportViewedResponseSchema = z.object({
  viewed: z.literal(true),
});
export type ReportViewedResponse = z.infer<typeof reportViewedResponseSchema>;

export const noticeSeenResponseSchema = z.object({
  seen: z.literal(true),
});
export type NoticeSeenResponse = z.infer<typeof noticeSeenResponseSchema>;

// GET /dashboard/children/:profileId/weekly-reports
export const weeklyReportsResponseSchema = z.object({
  reports: z.array(weeklyReportSummarySchema),
});
export type WeeklyReportsResponse = z.infer<typeof weeklyReportsResponseSchema>;

// GET /dashboard/children/:profileId/weekly-reports/:reportId
export const weeklyReportDetailResponseSchema = z.object({
  report: weeklyReportRecordSchema,
});
export type WeeklyReportDetailResponse = z.infer<
  typeof weeklyReportDetailResponseSchema
>;

// GET /dashboard/demo — demo children use non-UUID string profileIds
// (e.g. 'demo-child-1'), so a separate looser schema is needed.
const demoDashboardChildSchema = dashboardChildSchema.extend({
  profileId: z.string(),
});

export const demoDashboardDataSchema = z.object({
  children: z.array(demoDashboardChildSchema),
  pendingNotices: z.array(pendingNoticeSchema).default([]),
  demoMode: z.literal(true),
});
export type DemoDashboardData = z.infer<typeof demoDashboardDataSchema>;

// ---------------------------------------------------------------------------
// Coaching Card endpoint response (GET /v1/coaching-card)
// ---------------------------------------------------------------------------

const coldStartActionSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
});

const coldStartFallbackSchema = z.object({
  actions: z.array(coldStartActionSchema),
});

export const coachingCardEndpointResponseSchema = z.object({
  coldStart: z.boolean(),
  card: coachingCardSchema.nullable(),
  fallback: coldStartFallbackSchema.nullable(),
});
export type CoachingCardEndpointResponse = z.infer<
  typeof coachingCardEndpointResponseSchema
>;
