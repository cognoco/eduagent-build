import {
  childSessionSchema,
  progressOverviewResponseSchema,
  streakCardSchema,
  insightCardSchema,
  reviewDueCardSchema,
  challengeCardSchema,
  coachingCardSchema,
  celebrationNameSchema,
  celebrationReasonSchema,
  celebrationLevelSchema,
  withdrawalArchivePreferenceSchema,
  withdrawalArchivePreferenceUpdateSchema,
  familyPoolBreakdownSharingUpdateSchema,
  pendingCelebrationSchema,
  streakSchema,
  xpSummarySchema,
  notificationPrefsSchema,
  celebrationLevelUpdateSchema,
  celebrationLevelQuerySchema,
  celebrationSeenSchema,
  pushTokenRegisterSchema,
  notificationPrefsResponseSchema,
  getNotificationsResponseSchema,
  getCelebrationLevelResponseSchema,
  pendingCelebrationsResponseSchema,
  celebrationSeenResponseSchema,
  pushTokenRegisteredResponseSchema,
  notifyParentSubscribeResponseSchema,
  subjectProgressSchema,
  topicProgressSchema,
  learningResumeScopeSchema,
  learningResumeKindSchema,
  learningResumeTargetSchema,
  dashboardChildProgressSchema,
  dashboardChildSchema,
  pendingNoticeTypeSchema,
  pendingNoticeSchema,
  dashboardDataSchema,
  coachingCardTypeSchema,
  curriculumCompleteCardSchema,
  homeworkConnectionCardSchema,
  continueBookCardSchema,
  bookSuggestionCardSchema,
  milestoneCelebrationCardSchema,
  quizDiscoveryCardSchema,
  homeCardIdSchema,
  homeCardSchema,
  homeCardInteractionTypeSchema,
  homeCardInteractionSchema,
  dailyPlanItemSchema,
  dailyPlanSchema,
  overdueTopicSchema,
  overdueSubjectSchema,
  overdueTopicsResponseSchema,
  subjectProgressEndpointResponseSchema,
  topicProgressEndpointResponseSchema,
  nextReviewTopicSchema,
  reviewSummaryResponseSchema,
  activeSessionResponseSchema,
  topicResolveResponseSchema,
  resumeTargetResponseSchema,
  continueSuggestionResponseSchema,
  streakEndpointResponseSchema,
  xpSummaryEndpointResponseSchema,
  childDetailResponseSchema,
  progressSummarySchema,
  childSessionsResponseSchema,
  childSessionsQuerySchema,
  childSessionsPageResponseSchema,
  childSessionDetailResponseSchema,
  practiceActivityHistoryQuerySchema,
  practiceActivityHistoryItemSchema,
  practiceActivityHistoryResponseSchema,
  memoryCategoryKeySchema,
  curatedMemoryItemSchema,
  memoryCategorySchema,
  parentTellItemSchema,
  curatedMemoryViewSchema,
  childMemoryResponseSchema,
  dashboardResponseSchema,
  demoDashboardDataSchema,
  coachingCardEndpointResponseSchema,
  noticeSeenResponseSchema,
  reportViewedResponseSchema,
  getWithdrawalArchivePreferenceResponseSchema,
  updateWithdrawalArchivePreferenceResponseSchema,
  getFamilyPoolBreakdownSharingResponseSchema,
  updateFamilyPoolBreakdownSharingResponseSchema,
} from './progress.js';

// Test data factory — UUIDs must be RFC 9562 compliant (version 4, variant 1)
const TEST_UUID = '550e8400-e29b-41d4-a716-446655440000';

const baseCard = {
  id: TEST_UUID,
  profileId: TEST_UUID,
  title: 'Test Card',
  body: 'Test body',
  priority: 5,
  expiresAt: null,
  createdAt: '2025-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------
describe('celebrationNameSchema', () => {
  it('accepts all 4 celebration names', () => {
    for (const val of [
      'polar_star',
      'twin_stars',
      'comet',
      'orions_belt',
    ] as const) {
      expect(celebrationNameSchema.safeParse(val).success).toBe(true);
    }
  });

  it('rejects invalid name', () => {
    expect(celebrationNameSchema.safeParse('shooting_star').success).toBe(
      false,
    );
  });
});

describe('celebrationReasonSchema', () => {
  it('accepts all 12 celebration reasons', () => {
    for (const val of [
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
    ] as const) {
      expect(celebrationReasonSchema.safeParse(val).success).toBe(true);
    }
  });

  it('rejects invalid reason', () => {
    expect(celebrationReasonSchema.safeParse('login').success).toBe(false);
  });
});

describe('celebrationLevelSchema', () => {
  it('accepts all, big_only, off', () => {
    for (const val of ['all', 'big_only', 'off'] as const) {
      expect(celebrationLevelSchema.safeParse(val).success).toBe(true);
    }
  });
});

describe('withdrawalArchivePreferenceSchema', () => {
  it('accepts auto, always, never', () => {
    for (const val of ['auto', 'always', 'never'] as const) {
      expect(withdrawalArchivePreferenceSchema.safeParse(val).success).toBe(
        true,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Simple update wrappers
// ---------------------------------------------------------------------------
describe('withdrawalArchivePreferenceUpdateSchema', () => {
  it('wraps valid preference value', () => {
    expect(
      withdrawalArchivePreferenceUpdateSchema.safeParse({ value: 'auto' })
        .success,
    ).toBe(true);
  });

  it('rejects invalid value', () => {
    expect(
      withdrawalArchivePreferenceUpdateSchema.safeParse({ value: 'maybe' })
        .success,
    ).toBe(false);
  });
});

describe('familyPoolBreakdownSharingUpdateSchema', () => {
  it('accepts boolean value', () => {
    expect(
      familyPoolBreakdownSharingUpdateSchema.safeParse({ value: true }).success,
    ).toBe(true);
    expect(
      familyPoolBreakdownSharingUpdateSchema.safeParse({ value: false })
        .success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pendingCelebrationSchema
// ---------------------------------------------------------------------------
describe('pendingCelebrationSchema', () => {
  it('accepts valid celebration', () => {
    const result = pendingCelebrationSchema.safeParse({
      celebration: 'comet',
      reason: 'topic_mastered',
      queuedAt: '2025-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts nullable detail', () => {
    expect(
      pendingCelebrationSchema.safeParse({
        celebration: 'polar_star',
        reason: 'streak_7',
        detail: null,
        queuedAt: '2025-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid celebration name', () => {
    expect(
      pendingCelebrationSchema.safeParse({
        celebration: 'supernova',
        reason: 'streak_7',
        queuedAt: '2025-01-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// streakSchema
// ---------------------------------------------------------------------------
describe('streakSchema', () => {
  it('accepts a valid streak', () => {
    const result = streakSchema.safeParse({
      currentStreak: 7,
      longestStreak: 30,
      lastActivityDate: '2025-01-01',
      gracePeriodStartDate: null,
      isOnGracePeriod: false,
      graceDaysRemaining: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null dates', () => {
    const result = streakSchema.safeParse({
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
      gracePeriodStartDate: null,
      isOnGracePeriod: false,
      graceDaysRemaining: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects graceDaysRemaining above 3', () => {
    expect(
      streakSchema.safeParse({
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
        gracePeriodStartDate: null,
        isOnGracePeriod: false,
        graceDaysRemaining: 4,
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// xpSummarySchema
// ---------------------------------------------------------------------------
describe('xpSummarySchema', () => {
  it('accepts valid xp summary', () => {
    const result = xpSummarySchema.safeParse({
      totalXp: 1500,
      verifiedXp: 1200,
      pendingXp: 300,
      decayedXp: 50,
      topicsCompleted: 12,
      topicsVerified: 10,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// notificationPrefsSchema
// ---------------------------------------------------------------------------
describe('notificationPrefsSchema', () => {
  it('accepts minimal prefs (required fields)', () => {
    const result = notificationPrefsSchema.safeParse({
      reviewReminders: true,
      dailyReminders: false,
      pushEnabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts full prefs with all optional fields', () => {
    const result = notificationPrefsSchema.safeParse({
      reviewReminders: true,
      dailyReminders: true,
      weeklyProgressPush: true,
      weeklyProgressEmail: false,
      monthlyProgressEmail: true,
      pushEnabled: true,
      maxDailyPush: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects maxDailyPush above 10', () => {
    expect(
      notificationPrefsSchema.safeParse({
        reviewReminders: true,
        dailyReminders: false,
        pushEnabled: true,
        maxDailyPush: 11,
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Update schemas
// ---------------------------------------------------------------------------
describe('celebrationLevelUpdateSchema', () => {
  it('accepts celebrationLevel with optional childProfileId', () => {
    expect(
      celebrationLevelUpdateSchema.safeParse({
        celebrationLevel: 'all',
        childProfileId: TEST_UUID,
      }).success,
    ).toBe(true);
  });

  it('accepts celebrationLevel without childProfileId', () => {
    expect(
      celebrationLevelUpdateSchema.safeParse({ celebrationLevel: 'off' })
        .success,
    ).toBe(true);
  });
});

describe('celebrationLevelQuerySchema', () => {
  it('accepts empty object', () => {
    expect(celebrationLevelQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts optional childProfileId', () => {
    expect(
      celebrationLevelQuerySchema.safeParse({ childProfileId: TEST_UUID })
        .success,
    ).toBe(true);
  });
});

describe('celebrationSeenSchema', () => {
  it('accepts child and parent viewer', () => {
    expect(celebrationSeenSchema.safeParse({ viewer: 'child' }).success).toBe(
      true,
    );
    expect(celebrationSeenSchema.safeParse({ viewer: 'parent' }).success).toBe(
      true,
    );
  });

  it('rejects invalid viewer', () => {
    expect(
      celebrationSeenSchema.safeParse({ viewer: 'guardian' }).success,
    ).toBe(false);
  });
});

describe('pushTokenRegisterSchema', () => {
  it('accepts a non-empty token', () => {
    expect(
      pushTokenRegisterSchema.safeParse({ token: 'ExponentPushToken[xxx]' })
        .success,
    ).toBe(true);
  });

  it('rejects empty token', () => {
    expect(pushTokenRegisterSchema.safeParse({ token: '' }).success).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Response schemas (settings routes)
// ---------------------------------------------------------------------------
describe('notificationPrefsResponseSchema', () => {
  it('accepts valid response with all required fields', () => {
    const result = notificationPrefsResponseSchema.safeParse({
      reviewReminders: true,
      dailyReminders: false,
      weeklyProgressPush: true,
      weeklyProgressEmail: false,
      monthlyProgressEmail: true,
      pushEnabled: true,
      pushTokenRegistered: true,
      maxDailyPush: 3,
    });
    expect(result.success).toBe(true);
  });
});

describe('getNotificationsResponseSchema', () => {
  it('wraps preferences', () => {
    const result = getNotificationsResponseSchema.safeParse({
      preferences: {
        reviewReminders: true,
        dailyReminders: false,
        weeklyProgressPush: true,
        weeklyProgressEmail: false,
        monthlyProgressEmail: true,
        pushEnabled: true,
        pushTokenRegistered: true,
        maxDailyPush: 3,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('getCelebrationLevelResponseSchema', () => {
  it('accepts valid celebration level', () => {
    expect(
      getCelebrationLevelResponseSchema.safeParse({
        celebrationLevel: 'big_only',
      }).success,
    ).toBe(true);
  });
});

describe('getWithdrawalArchivePreferenceResponseSchema', () => {
  it('accepts valid preference', () => {
    expect(
      getWithdrawalArchivePreferenceResponseSchema.safeParse({ value: 'never' })
        .success,
    ).toBe(true);
  });
});

describe('updateWithdrawalArchivePreferenceResponseSchema', () => {
  it('accepts valid preference', () => {
    expect(
      updateWithdrawalArchivePreferenceResponseSchema.safeParse({
        value: 'always',
      }).success,
    ).toBe(true);
  });
});

describe('getFamilyPoolBreakdownSharingResponseSchema', () => {
  it('accepts boolean value', () => {
    expect(
      getFamilyPoolBreakdownSharingResponseSchema.safeParse({ value: true })
        .success,
    ).toBe(true);
  });
});

describe('updateFamilyPoolBreakdownSharingResponseSchema', () => {
  it('accepts boolean value', () => {
    expect(
      updateFamilyPoolBreakdownSharingResponseSchema.safeParse({ value: false })
        .success,
    ).toBe(true);
  });
});

describe('pendingCelebrationsResponseSchema', () => {
  it('accepts empty array', () => {
    expect(
      pendingCelebrationsResponseSchema.safeParse({ pendingCelebrations: [] })
        .success,
    ).toBe(true);
  });
});

describe('celebrationSeenResponseSchema', () => {
  it('accepts ok: true literal', () => {
    expect(celebrationSeenResponseSchema.safeParse({ ok: true }).success).toBe(
      true,
    );
  });

  it('rejects ok: false', () => {
    expect(celebrationSeenResponseSchema.safeParse({ ok: false }).success).toBe(
      false,
    );
  });
});

describe('pushTokenRegisteredResponseSchema', () => {
  it('accepts registered boolean', () => {
    expect(
      pushTokenRegisteredResponseSchema.safeParse({ registered: true }).success,
    ).toBe(true);
    expect(
      pushTokenRegisteredResponseSchema.safeParse({ registered: false })
        .success,
    ).toBe(true);
  });
});

describe('notifyParentSubscribeResponseSchema', () => {
  it('accepts sent/rateLimited booleans', () => {
    const result = notifyParentSubscribeResponseSchema.safeParse({
      sent: true,
      rateLimited: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional reason', () => {
    const result = notifyParentSubscribeResponseSchema.safeParse({
      sent: false,
      rateLimited: true,
      reason: 'Rate limit exceeded',
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Progress schemas
// ---------------------------------------------------------------------------
describe('subjectProgressSchema', () => {
  it('accepts valid subject progress', () => {
    const result = subjectProgressSchema.safeParse({
      subjectId: TEST_UUID,
      name: 'Mathematics',
      topicsTotal: 20,
      topicsCompleted: 10,
      topicsVerified: 8,
      topicsMastered: 6,
      topicsLearning: 4,
      urgencyScore: 0.7,
      retentionStatus: 'fading',
      lastSessionAt: '2025-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null lastSessionAt', () => {
    expect(
      subjectProgressSchema.safeParse({
        subjectId: TEST_UUID,
        name: 'Physics',
        topicsTotal: 10,
        topicsCompleted: 0,
        topicsVerified: 0,
        topicsMastered: 0,
        topicsLearning: 0,
        urgencyScore: 0.0,
        retentionStatus: 'strong',
        lastSessionAt: null,
      }).success,
    ).toBe(true);
  });

  it('rejects invalid retentionStatus', () => {
    expect(
      subjectProgressSchema.safeParse({
        subjectId: TEST_UUID,
        name: 'Physics',
        topicsTotal: 10,
        topicsCompleted: 0,
        topicsVerified: 0,
        topicsMastered: 0,
        topicsLearning: 0,
        urgencyScore: 0.0,
        retentionStatus: 'excellent',
        lastSessionAt: null,
      }).success,
    ).toBe(false);
  });
});

describe('topicProgressSchema', () => {
  it('accepts valid topic progress', () => {
    const result = topicProgressSchema.safeParse({
      topicId: TEST_UUID,
      title: 'Quadratic Equations',
      description: 'Solving second-degree polynomials',
      completionStatus: 'completed',
      retentionStatus: 'strong',
      daysSinceLastReview: 3,
      struggleStatus: 'normal',
      masteryScore: 0.85,
      masteredAt: '2025-01-02T00:00:00.000Z',
      strongReviews: 2,
      strongReviewsTarget: 5,
      summaryExcerpt: null,
      xpStatus: 'verified',
      totalSessions: 5,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all nullable fields as null', () => {
    const result = topicProgressSchema.safeParse({
      topicId: TEST_UUID,
      title: 'New Topic',
      description: '',
      completionStatus: 'not_started',
      retentionStatus: null,
      daysSinceLastReview: null,
      struggleStatus: 'normal',
      masteryScore: null,
      masteredAt: null,
      strongReviews: 0,
      strongReviewsTarget: 5,
      summaryExcerpt: null,
      xpStatus: null,
      totalSessions: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid completionStatus', () => {
    expect(
      topicProgressSchema.safeParse({
        topicId: TEST_UUID,
        title: 'Test',
        description: '',
        completionStatus: 'archived',
        retentionStatus: null,
        daysSinceLastReview: null,
        struggleStatus: 'normal',
        masteryScore: null,
        masteredAt: null,
        strongReviews: 0,
        strongReviewsTarget: 5,
        summaryExcerpt: null,
        xpStatus: null,
        totalSessions: 0,
      }).success,
    ).toBe(false);
  });
});

describe('learningResumeScopeSchema', () => {
  it('accepts empty scope', () => {
    expect(learningResumeScopeSchema.safeParse({}).success).toBe(true);
  });

  it('accepts scope with all optional IDs', () => {
    expect(
      learningResumeScopeSchema.safeParse({
        subjectId: TEST_UUID,
        bookId: TEST_UUID,
        topicId: TEST_UUID,
      }).success,
    ).toBe(true);
  });
});

describe('learningResumeKindSchema', () => {
  it('accepts all 5 resume kinds', () => {
    for (const val of [
      'active_session',
      'paused_session',
      'recent_topic',
      'next_topic',
      'subject_freeform',
    ] as const) {
      expect(learningResumeKindSchema.safeParse(val).success).toBe(true);
    }
  });
});

describe('learningResumeTargetSchema', () => {
  it('accepts valid target', () => {
    const result = learningResumeTargetSchema.safeParse({
      subjectId: TEST_UUID,
      subjectName: 'Mathematics',
      topicId: null,
      topicTitle: null,
      sessionId: null,
      resumeFromSessionId: null,
      resumeKind: 'next_topic',
      lastActivityAt: null,
      reason: 'Continue where you left off',
    });
    expect(result.success).toBe(true);
  });
});

describe('dashboardChildProgressSchema', () => {
  it('accepts valid child progress', () => {
    const result = dashboardChildProgressSchema.safeParse({
      snapshotDate: '2025-01-01',
      topicsMastered: 5,
      vocabularyTotal: 200,
      minutesThisWeek: 45,
      weeklyDeltaTopicsMastered: 2,
      weeklyDeltaVocabularyTotal: null,
      weeklyDeltaTopicsExplored: null,
      engagementTrend: 'stable',
      guidance: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('dashboardChildSchema', () => {
  it('accepts a valid dashboard child', () => {
    const result = dashboardChildSchema.safeParse({
      profileId: TEST_UUID,
      displayName: 'Alex',
      consentStatus: 'CONSENTED',
      respondedAt: null,
      summary: 'Active learner',
      sessionsThisWeek: 3,
      sessionsLastWeek: 2,
      totalTimeThisWeek: 60,
      totalTimeLastWeek: 45,
      exchangesThisWeek: 20,
      exchangesLastWeek: 15,
      trend: 'up',
      subjects: [],
      guidedVsImmediateRatio: 0.6,
      retentionTrend: 'stable',
      totalSessions: 10,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pendingNoticeSchema
// ---------------------------------------------------------------------------
describe('pendingNoticeSchema', () => {
  it('accepts valid notice', () => {
    const result = pendingNoticeSchema.safeParse({
      id: TEST_UUID,
      type: 'consent_archived',
      payload: { childName: 'Alex' },
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('pendingNoticeTypeSchema accepts both values', () => {
    expect(pendingNoticeTypeSchema.safeParse('consent_archived').success).toBe(
      true,
    );
    expect(pendingNoticeTypeSchema.safeParse('consent_deleted').success).toBe(
      true,
    );
  });
});

describe('dashboardDataSchema', () => {
  it('accepts minimal dashboard data', () => {
    const result = dashboardDataSchema.safeParse({
      children: [],
      demoMode: false,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CoachingCard schemas
// ---------------------------------------------------------------------------
describe('CoachingCard schemas', () => {
  describe('streakCardSchema', () => {
    it('parses valid streak card', () => {
      const card = {
        ...baseCard,
        type: 'streak',
        currentStreak: 7,
        graceRemaining: 0,
      };
      expect(streakCardSchema.parse(card)).toEqual(card);
    });
  });

  describe('insightCardSchema', () => {
    it('parses valid insight card', () => {
      const card = {
        ...baseCard,
        type: 'insight',
        topicId: TEST_UUID,
        insightType: 'strength',
      };
      expect(insightCardSchema.parse(card)).toEqual(card);
    });
  });

  describe('reviewDueCardSchema', () => {
    it('parses valid review due card', () => {
      const card = {
        ...baseCard,
        type: 'review_due',
        topicId: TEST_UUID,
        dueAt: '2025-02-01T00:00:00.000Z',
        easeFactor: 2.5,
      };
      expect(reviewDueCardSchema.parse(card)).toEqual(card);
    });

    it('rejects easeFactor below 1.3', () => {
      const card = {
        ...baseCard,
        type: 'review_due',
        topicId: TEST_UUID,
        dueAt: '2025-02-01T00:00:00.000Z',
        easeFactor: 1.0,
      };
      expect(() => reviewDueCardSchema.parse(card)).toThrow();
    });
  });

  describe('challengeCardSchema', () => {
    it('parses valid challenge card', () => {
      const card = {
        ...baseCard,
        type: 'challenge',
        topicId: TEST_UUID,
        difficulty: 'hard',
        xpReward: 150,
      };
      expect(challengeCardSchema.parse(card)).toEqual(card);
    });
  });

  describe('curriculumCompleteCardSchema', () => {
    it('parses valid curriculum complete card', () => {
      const card = {
        ...baseCard,
        type: 'curriculum_complete',
      };
      expect(curriculumCompleteCardSchema.parse(card)).toMatchObject({
        type: 'curriculum_complete',
      });
    });
  });

  describe('homeworkConnectionCardSchema', () => {
    it('parses valid homework connection card', () => {
      const result = homeworkConnectionCardSchema.safeParse({
        ...baseCard,
        type: 'homework_connection',
        topicId: TEST_UUID,
        bookTitle: 'Harry Potter',
        bookEmoji: '📚',
        homeworkSkill: 'Reading comprehension',
      });
      expect(result.success).toBe(true);
    });

    it('accepts null bookTitle and bookEmoji', () => {
      const result = homeworkConnectionCardSchema.safeParse({
        ...baseCard,
        type: 'homework_connection',
        topicId: TEST_UUID,
        bookTitle: null,
        bookEmoji: null,
        homeworkSkill: 'Algebra',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('continueBookCardSchema', () => {
    it('parses valid continue book card', () => {
      const result = continueBookCardSchema.safeParse({
        ...baseCard,
        type: 'continue_book',
        topicId: TEST_UUID,
        bookTitle: 'The Hobbit',
        bookEmoji: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('bookSuggestionCardSchema', () => {
    it('parses valid book suggestion card', () => {
      const result = bookSuggestionCardSchema.safeParse({
        ...baseCard,
        type: 'book_suggestion',
        bookId: TEST_UUID,
        bookTitle: 'A Brief History of Time',
        bookEmoji: '🌌',
        subjectName: 'Physics',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('milestoneCelebrationCardSchema', () => {
    it('parses valid milestone celebration card', () => {
      const result = milestoneCelebrationCardSchema.safeParse({
        ...baseCard,
        type: 'milestone_celebration',
        milestoneId: TEST_UUID,
        milestoneType: 'vocabulary_count',
        threshold: 100,
      });
      expect(result.success).toBe(true);
    });

    it('accepts topic_mastered_count milestoneType', () => {
      const result = milestoneCelebrationCardSchema.safeParse({
        ...baseCard,
        type: 'milestone_celebration',
        milestoneId: TEST_UUID,
        milestoneType: 'topic_mastered_count',
        threshold: 10,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('quizDiscoveryCardSchema', () => {
    it('parses valid quiz discovery card', () => {
      const result = quizDiscoveryCardSchema.safeParse({
        ...baseCard,
        type: 'quiz_discovery',
        activityType: 'vocabulary',
        missedItemCount: 3,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missedItemCount below 1', () => {
      expect(
        quizDiscoveryCardSchema.safeParse({
          ...baseCard,
          type: 'quiz_discovery',
          activityType: 'capitals',
          missedItemCount: 0,
        }).success,
      ).toBe(false);
    });
  });

  describe('coachingCardSchema (discriminated union)', () => {
    it('accepts all 4 original card types', () => {
      const cards = [
        { ...baseCard, type: 'streak', currentStreak: 3, graceRemaining: 1 },
        {
          ...baseCard,
          type: 'insight',
          topicId: TEST_UUID,
          insightType: 'milestone',
        },
        {
          ...baseCard,
          type: 'review_due',
          topicId: TEST_UUID,
          dueAt: '2025-02-01T00:00:00.000Z',
          easeFactor: 2.5,
        },
        {
          ...baseCard,
          type: 'challenge',
          topicId: TEST_UUID,
          difficulty: 'easy',
          xpReward: 50,
        },
      ];
      for (const card of cards) {
        expect(() => coachingCardSchema.parse(card)).not.toThrow();
      }
    });

    it('rejects invalid type', () => {
      const card = { ...baseCard, type: 'invalid_type' };
      expect(() => coachingCardSchema.parse(card)).toThrow();
    });

    it('rejects priority outside 1-10 range', () => {
      const card = {
        ...baseCard,
        type: 'streak',
        currentStreak: 1,
        graceRemaining: 0,
        priority: 11,
      };
      expect(() => streakCardSchema.parse(card)).toThrow();
    });

    it('accepts nullable expiresAt', () => {
      const card = {
        ...baseCard,
        type: 'streak',
        currentStreak: 1,
        graceRemaining: 0,
        expiresAt: null,
      };
      expect(streakCardSchema.parse(card).expiresAt).toBeNull();
    });

    it('accepts datetime expiresAt', () => {
      const card = {
        ...baseCard,
        type: 'streak',
        currentStreak: 1,
        graceRemaining: 0,
        expiresAt: '2025-12-31T23:59:59.999Z',
      };
      expect(streakCardSchema.parse(card).expiresAt).toBe(
        '2025-12-31T23:59:59.999Z',
      );
    });
  });

  describe('coachingCardTypeSchema', () => {
    it('accepts all 10 card types', () => {
      for (const val of [
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
      ] as const) {
        expect(coachingCardTypeSchema.safeParse(val).success).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Home Card schemas
// ---------------------------------------------------------------------------
describe('homeCardIdSchema', () => {
  it('accepts all home card IDs', () => {
    for (const val of [
      'resume_session',
      'restore_subjects',
      'curriculum_complete',
      'review',
      'study',
      'homework',
      'ask',
      'family',
      'link_child',
    ] as const) {
      expect(homeCardIdSchema.safeParse(val).success).toBe(true);
    }
  });
});

describe('homeCardSchema', () => {
  it('accepts minimal home card', () => {
    const result = homeCardSchema.safeParse({
      id: 'study',
      title: 'Study',
      subtitle: 'Continue learning',
      primaryLabel: 'Start',
      priority: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts home card with all optional fields', () => {
    const result = homeCardSchema.safeParse({
      id: 'review',
      title: 'Review',
      subtitle: 'Practice retention',
      badge: '3 due',
      primaryLabel: 'Review now',
      secondaryLabel: 'Later',
      priority: 2,
      compact: true,
      subjectId: TEST_UUID,
      subjectName: 'Math',
      topicId: TEST_UUID,
      topicName: 'Algebra',
    });
    expect(result.success).toBe(true);
  });
});

describe('homeCardInteractionTypeSchema', () => {
  it('accepts tap and dismiss', () => {
    expect(homeCardInteractionTypeSchema.safeParse('tap').success).toBe(true);
    expect(homeCardInteractionTypeSchema.safeParse('dismiss').success).toBe(
      true,
    );
  });
});

describe('homeCardInteractionSchema', () => {
  it('accepts valid interaction', () => {
    const result = homeCardInteractionSchema.safeParse({
      cardId: 'study',
      interactionType: 'tap',
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Daily Plan schemas
// ---------------------------------------------------------------------------
describe('dailyPlanItemSchema', () => {
  it('accepts valid plan item', () => {
    const result = dailyPlanItemSchema.safeParse({
      type: 'review',
      title: 'Review Algebra',
      subtitle: '3 topics due',
      route: '/subjects/math/review',
    });
    expect(result.success).toBe(true);
  });

  it('accepts plan item with optional fields', () => {
    const result = dailyPlanItemSchema.safeParse({
      type: 'continue',
      title: 'Continue Calculus',
      subtitle: 'Pick up where you left off',
      estimatedMinutes: 15,
      route: '/subjects/math',
      topicId: TEST_UUID,
      subjectId: TEST_UUID,
    });
    expect(result.success).toBe(true);
  });
});

describe('dailyPlanSchema', () => {
  it('accepts valid daily plan', () => {
    const result = dailyPlanSchema.safeParse({
      greeting: 'Good morning, Alex!',
      items: [],
      streakDays: 7,
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 4 items', () => {
    const item = {
      type: 'review' as const,
      title: 'Review',
      subtitle: 'Do it',
      route: '/review',
    };
    expect(
      dailyPlanSchema.safeParse({
        greeting: 'Hi',
        items: [item, item, item, item, item],
        streakDays: 0,
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Overdue Topics schemas
// ---------------------------------------------------------------------------
describe('overdueTopicSchema', () => {
  it('accepts valid overdue topic', () => {
    expect(
      overdueTopicSchema.safeParse({
        topicId: TEST_UUID,
        topicTitle: 'Algebra',
        overdueDays: 5,
        failureCount: 2,
        retentionStatus: 'forgotten',
      }).success,
    ).toBe(true);
  });
});

describe('overdueSubjectSchema', () => {
  it('accepts valid overdue subject', () => {
    expect(
      overdueSubjectSchema.safeParse({
        subjectId: TEST_UUID,
        subjectName: 'Mathematics',
        overdueCount: 3,
        topics: [],
      }).success,
    ).toBe(true);
  });
});

describe('overdueTopicsResponseSchema', () => {
  it('accepts empty overdue response', () => {
    expect(
      overdueTopicsResponseSchema.safeParse({
        totalOverdue: 0,
        subjects: [],
        truncated: false,
        displayedCount: 0,
      }).success,
    ).toBe(true);
  });

  it('accepts truncated response with displayedCount', () => {
    expect(
      overdueTopicsResponseSchema.safeParse({
        totalOverdue: 501,
        subjects: [],
        truncated: true,
        displayedCount: 500,
      }).success,
    ).toBe(true);
  });

  it('rejects response missing truncated field', () => {
    expect(
      overdueTopicsResponseSchema.safeParse({
        totalOverdue: 0,
        subjects: [],
        displayedCount: 0,
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Endpoint response wrapper schemas
// ---------------------------------------------------------------------------
describe('subjectProgressEndpointResponseSchema', () => {
  it('wraps subjectProgress', () => {
    const result = subjectProgressEndpointResponseSchema.safeParse({
      progress: {
        subjectId: TEST_UUID,
        name: 'Math',
        topicsTotal: 10,
        topicsCompleted: 5,
        topicsVerified: 4,
        topicsMastered: 3,
        topicsLearning: 2,
        urgencyScore: 0.5,
        retentionStatus: 'strong',
        lastSessionAt: null,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('topicProgressEndpointResponseSchema', () => {
  it('wraps topicProgress', () => {
    const result = topicProgressEndpointResponseSchema.safeParse({
      topic: {
        topicId: TEST_UUID,
        title: 'Algebra',
        description: '',
        completionStatus: 'in_progress',
        retentionStatus: null,
        daysSinceLastReview: null,
        struggleStatus: 'normal',
        masteryScore: null,
        masteredAt: null,
        strongReviews: 0,
        strongReviewsTarget: 5,
        summaryExcerpt: null,
        xpStatus: null,
        totalSessions: 3,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('nextReviewTopicSchema', () => {
  it('accepts valid next review topic', () => {
    expect(
      nextReviewTopicSchema.safeParse({
        topicId: TEST_UUID,
        subjectId: TEST_UUID,
        subjectName: 'Physics',
        topicTitle: 'Newton laws',
      }).success,
    ).toBe(true);
  });
});

describe('reviewSummaryResponseSchema', () => {
  it('accepts response with null nextReviewTopic', () => {
    expect(
      reviewSummaryResponseSchema.safeParse({
        totalOverdue: 0,
        nextReviewTopic: null,
        nextUpcomingReviewAt: null,
      }).success,
    ).toBe(true);
  });
});

describe('activeSessionResponseSchema', () => {
  it('accepts null (no active session)', () => {
    expect(activeSessionResponseSchema.safeParse(null).success).toBe(true);
  });

  it('accepts sessionId object', () => {
    expect(
      activeSessionResponseSchema.safeParse({ sessionId: TEST_UUID }).success,
    ).toBe(true);
  });
});

describe('topicResolveResponseSchema', () => {
  it('accepts valid topic resolve response', () => {
    expect(
      topicResolveResponseSchema.safeParse({
        subjectId: TEST_UUID,
        subjectName: 'Math',
        topicTitle: 'Fractions',
      }).success,
    ).toBe(true);
  });
});

describe('resumeTargetResponseSchema', () => {
  it('accepts null target', () => {
    expect(resumeTargetResponseSchema.safeParse({ target: null }).success).toBe(
      true,
    );
  });
});

describe('continueSuggestionResponseSchema', () => {
  it('accepts null suggestion', () => {
    expect(
      continueSuggestionResponseSchema.safeParse({ suggestion: null }).success,
    ).toBe(true);
  });

  it('accepts valid suggestion', () => {
    const result = continueSuggestionResponseSchema.safeParse({
      suggestion: {
        subjectId: TEST_UUID,
        subjectName: 'Math',
        topicId: TEST_UUID,
        topicTitle: 'Calculus',
        lastSessionId: null,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('streakEndpointResponseSchema', () => {
  it('wraps streak data', () => {
    expect(
      streakEndpointResponseSchema.safeParse({
        streak: {
          currentStreak: 5,
          longestStreak: 10,
          lastActivityDate: '2025-01-01',
          gracePeriodStartDate: null,
          isOnGracePeriod: false,
          graceDaysRemaining: 0,
        },
      }).success,
    ).toBe(true);
  });
});

describe('xpSummaryEndpointResponseSchema', () => {
  it('wraps xp summary', () => {
    expect(
      xpSummaryEndpointResponseSchema.safeParse({
        xp: {
          totalXp: 500,
          verifiedXp: 400,
          pendingXp: 100,
          decayedXp: 20,
          topicsCompleted: 8,
          topicsVerified: 7,
        },
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dashboard response schemas
// ---------------------------------------------------------------------------
describe('dashboardResponseSchema', () => {
  it('is an alias for dashboardDataSchema', () => {
    expect(
      dashboardResponseSchema.safeParse({ children: [], demoMode: false })
        .success,
    ).toBe(true);
  });
});

describe('childDetailResponseSchema', () => {
  it('accepts null child', () => {
    expect(childDetailResponseSchema.safeParse({ child: null }).success).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// progressSummarySchema
// ---------------------------------------------------------------------------
describe('progressSummarySchema', () => {
  it('accepts valid summary', () => {
    const result = progressSummarySchema.safeParse({
      summary: 'Great progress this week!',
      generatedAt: '2025-01-01T00:00:00.000Z',
      basedOnLastSessionAt: null,
      latestSessionId: TEST_UUID,
      activityState: 'fresh',
      nudgeRecommended: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all nullable fields as null', () => {
    const result = progressSummarySchema.safeParse({
      summary: null,
      generatedAt: null,
      basedOnLastSessionAt: null,
      latestSessionId: null,
      activityState: 'no_recent_activity',
      nudgeRecommended: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all three activityState values', () => {
    for (const val of ['fresh', 'no_recent_activity', 'stale'] as const) {
      expect(
        progressSummarySchema.safeParse({
          summary: null,
          generatedAt: null,
          basedOnLastSessionAt: null,
          latestSessionId: null,
          activityState: val,
          nudgeRecommended: false,
        }).success,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// childSessionSchema
// ---------------------------------------------------------------------------
describe('childSessionSchema', () => {
  it('preserves fluency drill scores in child session responses', () => {
    const session = {
      sessionId: TEST_UUID,
      subjectId: TEST_UUID,
      subjectName: 'Spanish',
      topicId: TEST_UUID,
      topicTitle: 'Present tense',
      sessionType: 'learning',
      startedAt: '2025-01-01T00:00:00.000Z',
      endedAt: null,
      exchangeCount: 4,
      escalationRung: 2,
      durationSeconds: 300,
      wallClockSeconds: 360,
      displayTitle: 'Spanish practice',
      displaySummary: null,
      homeworkSummary: null,
      highlight: 'Strong recall',
      narrative: null,
      conversationPrompt: null,
      engagementSignal: 'focused',
      drills: [
        {
          correct: 4,
          total: 5,
          createdAt: '2025-01-01T00:05:00.000Z',
        },
      ],
    };

    expect(childSessionSchema.parse(session).drills).toEqual(session.drills);
  });
});

// ---------------------------------------------------------------------------
// Child sessions query/page schemas
// ---------------------------------------------------------------------------
describe('childSessionsResponseSchema', () => {
  it('accepts empty sessions array', () => {
    expect(
      childSessionsResponseSchema.safeParse({ sessions: [] }).success,
    ).toBe(true);
  });
});

describe('childSessionsQuerySchema', () => {
  it('accepts empty query', () => {
    expect(childSessionsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('coerces limit from string', () => {
    const result = childSessionsQuerySchema.parse({ limit: '10' });
    expect(result.limit).toBe(10);
  });

  it('rejects limit above 50', () => {
    expect(childSessionsQuerySchema.safeParse({ limit: 51 }).success).toBe(
      false,
    );
  });
});

describe('childSessionsPageResponseSchema', () => {
  it('accepts sessions with null nextCursor', () => {
    expect(
      childSessionsPageResponseSchema.safeParse({
        sessions: [],
        nextCursor: null,
      }).success,
    ).toBe(true);
  });

  it('accepts sessions with UUID nextCursor', () => {
    expect(
      childSessionsPageResponseSchema.safeParse({
        sessions: [],
        nextCursor: TEST_UUID,
      }).success,
    ).toBe(true);
  });
});

describe('childSessionDetailResponseSchema', () => {
  it('wraps a child session', () => {
    const session = {
      sessionId: TEST_UUID,
      subjectId: TEST_UUID,
      subjectName: 'Math',
      topicId: null,
      topicTitle: null,
      sessionType: 'learning' as const,
      startedAt: '2025-01-01T00:00:00.000Z',
      endedAt: null,
      exchangeCount: 2,
      escalationRung: 1,
      durationSeconds: null,
      wallClockSeconds: null,
      displayTitle: 'Math session',
      displaySummary: null,
      homeworkSummary: null,
      highlight: null,
      narrative: null,
      conversationPrompt: null,
      engagementSignal: null,
      drills: [],
    };
    expect(
      childSessionDetailResponseSchema.safeParse({ session }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Memory schemas
// ---------------------------------------------------------------------------
describe('memoryCategoryKeySchema', () => {
  it('accepts all 5 category keys', () => {
    for (const val of [
      'struggles',
      'interests',
      'strengths',
      'communicationNotes',
      'learningStyle',
    ] as const) {
      expect(memoryCategoryKeySchema.safeParse(val).success).toBe(true);
    }
  });
});

describe('curatedMemoryItemSchema', () => {
  it('accepts valid memory item', () => {
    const result = curatedMemoryItemSchema.safeParse({
      category: 'interests',
      value: 'football',
      statement: 'Alex is interested in football',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional confidence', () => {
    const result = curatedMemoryItemSchema.safeParse({
      category: 'strengths',
      value: 'pattern recognition',
      statement: 'Strong at identifying patterns',
      confidence: 'high',
    });
    expect(result.success).toBe(true);
  });
});

describe('memoryCategorySchema', () => {
  it('accepts category with items', () => {
    expect(
      memoryCategorySchema.safeParse({
        label: 'Interests',
        items: [],
      }).success,
    ).toBe(true);
  });
});

describe('parentTellItemSchema', () => {
  it('accepts valid parent tell item', () => {
    expect(
      parentTellItemSchema.safeParse({
        id: 'item-1',
        content: 'My child loves football',
        createdAt: '2025-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});

describe('curatedMemoryViewSchema', () => {
  it('accepts valid memory view', () => {
    const result = curatedMemoryViewSchema.safeParse({
      categories: [],
      parentContributions: [],
      settings: {
        memoryEnabled: true,
        collectionEnabled: true,
        injectionEnabled: false,
        accommodationMode: null,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('childMemoryResponseSchema', () => {
  it('wraps curated memory view', () => {
    const result = childMemoryResponseSchema.safeParse({
      memory: {
        categories: [],
        parentContributions: [],
        settings: {
          memoryEnabled: true,
          collectionEnabled: true,
          injectionEnabled: true,
          accommodationMode: null,
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// demoDashboardDataSchema
// ---------------------------------------------------------------------------
describe('demoDashboardDataSchema', () => {
  it('accepts demo data with non-UUID profileId and demoMode: true', () => {
    const result = demoDashboardDataSchema.safeParse({
      children: [
        {
          profileId: 'demo-child-1', // non-UUID is allowed
          displayName: 'Demo Child',
          consentStatus: null,
          respondedAt: null,
          summary: 'Demo summary',
          sessionsThisWeek: 3,
          sessionsLastWeek: 2,
          totalTimeThisWeek: 60,
          totalTimeLastWeek: 45,
          exchangesThisWeek: 15,
          exchangesLastWeek: 10,
          trend: 'stable',
          subjects: [],
          guidedVsImmediateRatio: 0.5,
          retentionTrend: 'stable',
          totalSessions: 5,
        },
      ],
      demoMode: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects demoMode: false', () => {
    expect(
      demoDashboardDataSchema.safeParse({ children: [], demoMode: false })
        .success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// coachingCardEndpointResponseSchema
// ---------------------------------------------------------------------------
describe('coachingCardEndpointResponseSchema', () => {
  it('accepts cold start with null card and null fallback', () => {
    expect(
      coachingCardEndpointResponseSchema.safeParse({
        coldStart: true,
        card: null,
        fallback: null,
      }).success,
    ).toBe(true);
  });

  it('accepts response with a coaching card', () => {
    const result = coachingCardEndpointResponseSchema.safeParse({
      coldStart: false,
      card: {
        ...baseCard,
        type: 'streak',
        currentStreak: 5,
        graceRemaining: 0,
      },
      fallback: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts cold start with fallback actions', () => {
    const result = coachingCardEndpointResponseSchema.safeParse({
      coldStart: true,
      card: null,
      fallback: {
        actions: [
          {
            key: 'start_learning',
            label: 'Start Learning',
            description: 'Begin your first session',
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// noticeSeenResponseSchema / reportViewedResponseSchema
// ---------------------------------------------------------------------------
describe('noticeSeenResponseSchema', () => {
  it('accepts seen: true literal', () => {
    expect(noticeSeenResponseSchema.safeParse({ seen: true }).success).toBe(
      true,
    );
  });

  it('rejects seen: false', () => {
    expect(noticeSeenResponseSchema.safeParse({ seen: false }).success).toBe(
      false,
    );
  });
});

describe('reportViewedResponseSchema', () => {
  it('accepts viewed: true literal', () => {
    expect(reportViewedResponseSchema.safeParse({ viewed: true }).success).toBe(
      true,
    );
  });

  it('rejects viewed: false', () => {
    expect(
      reportViewedResponseSchema.safeParse({ viewed: false }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// progressOverviewResponseSchema
// ---------------------------------------------------------------------------
describe('progressOverviewResponseSchema', () => {
  it('defaults practiceSummary for older API payloads', () => {
    const parsed = progressOverviewResponseSchema.parse({
      subjects: [],
      totalTopicsCompleted: 0,
      totalTopicsVerified: 0,
      totalTopicsMastered: 0,
      totalTopicsLearning: 0,
    });

    expect(parsed.practiceActivityCount).toBe(0);
    expect(parsed.practiceSummary.totals.activitiesCompleted).toBe(0);
    expect(parsed.practiceSummary.byType).toEqual([]);
  });

  it('accepts three-state overview totals', () => {
    const parsed = progressOverviewResponseSchema.parse({
      subjects: [
        {
          subjectId: TEST_UUID,
          name: 'Math',
          topicsTotal: 8,
          topicsCompleted: 5,
          topicsVerified: 4,
          topicsMastered: 3,
          topicsLearning: 2,
          urgencyScore: 0,
          retentionStatus: 'strong',
          lastSessionAt: null,
        },
      ],
      totalTopicsCompleted: 5,
      totalTopicsVerified: 4,
      totalTopicsMastered: 3,
      totalTopicsLearning: 2,
    });

    expect(parsed.totalTopicsMastered).toBe(3);
    expect(parsed.totalTopicsLearning).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Practice activity history (Journal "My past activity")
// ---------------------------------------------------------------------------
describe('practiceActivityHistoryQuerySchema', () => {
  it('accepts an empty query', () => {
    expect(practiceActivityHistoryQuerySchema.safeParse({}).success).toBe(true);
  });

  it('coerces limit from string', () => {
    const result = practiceActivityHistoryQuerySchema.parse({ limit: '10' });
    expect(result.limit).toBe(10);
  });

  it('rejects limit above 50', () => {
    expect(
      practiceActivityHistoryQuerySchema.safeParse({ limit: 51 }).success,
    ).toBe(false);
  });

  it('accepts an optional activity type filter', () => {
    expect(
      practiceActivityHistoryQuerySchema.parse({ type: 'dictation' }).type,
    ).toBe('dictation');
  });

  it('rejects an unknown activity type', () => {
    expect(
      practiceActivityHistoryQuerySchema.safeParse({ type: 'homework' })
        .success,
    ).toBe(false);
  });
});

describe('practiceActivityHistoryItemSchema', () => {
  it('accepts an item with a topic and subject', () => {
    expect(
      practiceActivityHistoryItemSchema.safeParse({
        id: TEST_UUID,
        activityType: 'assessment',
        topicTitle: 'Photosynthesis',
        subjectName: 'Biology',
        occurredAt: '2026-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('accepts null topic and subject (best-effort metadata)', () => {
    expect(
      practiceActivityHistoryItemSchema.safeParse({
        id: TEST_UUID,
        activityType: 'dictation',
        topicTitle: null,
        subjectName: null,
        occurredAt: '2026-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('coerces a Date occurredAt to an ISO string', () => {
    const parsed = practiceActivityHistoryItemSchema.parse({
      id: TEST_UUID,
      activityType: 'quiz',
      topicTitle: null,
      subjectName: 'Maths',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(parsed.occurredAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('practiceActivityHistoryResponseSchema', () => {
  it('accepts an empty page with null cursor', () => {
    expect(
      practiceActivityHistoryResponseSchema.safeParse({
        items: [],
        nextCursor: null,
      }).success,
    ).toBe(true);
  });

  it('accepts a page with a UUID cursor', () => {
    expect(
      practiceActivityHistoryResponseSchema.safeParse({
        items: [],
        nextCursor: TEST_UUID,
      }).success,
    ).toBe(true);
  });
});
