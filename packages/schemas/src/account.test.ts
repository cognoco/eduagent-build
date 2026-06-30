/**
 * [BUG-206] dataExportSchema — centralised export-row schema.
 *
 * Tightening from `z.record(z.string(), z.unknown())` inline per-table to a
 * single named alias (`dataExportRowSchema`) gives us one place to ratchet
 * stricter per-table shapes in future PRs. These tests pin the contract.
 *
 * [WI-1097] All 19 deferred aliases tightened to real z.object schemas.
 */

import {
  accountDeletionResponseSchema,
  accountDeletionStatusResponseSchema,
  cancelDeletionResponseSchema,
  dataExportAssessmentRowSchema,
  dataExportConsentSchema,
  dataExportCurriculumRowSchema,
  dataExportCurriculumTopicRowSchema,
  dataExportFamilyLinkRowSchema,
  dataExportLearningModeRowSchema,
  dataExportLearningSessionRowSchema,
  dataExportMentorActivityLedgerRowSchema,
  dataExportNeedsDeepeningTopicRowSchema,
  dataExportNotificationPreferenceRowSchema,
  dataExportParkingLotItemRowSchema,
  dataExportQuotaPoolRowSchema,
  dataExportRetentionCardRowSchema,
  dataExportRowSchema,
  dataExportSchema,
  dataExportSessionEmbeddingRowSchema,
  dataExportSessionEventRowSchema,
  dataExportSessionSummaryRowSchema,
  dataExportStreakRowSchema,
  dataExportSubjectRowSchema,
  dataExportSubscriptionRowSchema,
  dataExportTeachingPreferenceRowSchema,
  dataExportTopUpCreditRowSchema,
  dataExportXpLedgerRowSchema,
} from './account.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const ISO = '2026-05-19T00:00:00.000Z';

describe('account schemas', () => {
  describe('accountDeletionResponseSchema', () => {
    it('accepts a valid scheduled-deletion response', () => {
      const result = accountDeletionResponseSchema.safeParse({
        message: 'Account deletion scheduled',
        gracePeriodEnds: ISO,
      });
      expect(result.success).toBe(true);
    });

    it('accepts a Date object on gracePeriodEnds (Drizzle compat)', () => {
      const result = accountDeletionResponseSchema.safeParse({
        message: 'Scheduled',
        gracePeriodEnds: new Date(ISO),
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing message', () => {
      expect(
        accountDeletionResponseSchema.safeParse({ gracePeriodEnds: ISO })
          .success,
      ).toBe(false);
    });
  });

  describe('cancelDeletionResponseSchema', () => {
    it('accepts a message-only response', () => {
      expect(
        cancelDeletionResponseSchema.safeParse({ message: 'Cancelled' })
          .success,
      ).toBe(true);
    });
  });

  describe('accountDeletionStatusResponseSchema', () => {
    it('accepts nullable timestamps when not scheduled', () => {
      const result = accountDeletionStatusResponseSchema.safeParse({
        scheduled: false,
        deletionScheduledAt: null,
        gracePeriodEnds: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts populated timestamps when scheduled', () => {
      const result = accountDeletionStatusResponseSchema.safeParse({
        scheduled: true,
        deletionScheduledAt: ISO,
        gracePeriodEnds: ISO,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('dataExportConsentSchema', () => {
    it('accepts a consent row with respondedAt populated', () => {
      const result = dataExportConsentSchema.safeParse({
        id: UUID,
        profileId: UUID,
        consentType: 'GDPR',
        status: 'CONSENTED',
        parentEmail: 'parent@example.com',
        requestedAt: ISO,
        respondedAt: ISO,
      });
      expect(result.success).toBe(true);
    });

    it('accepts null respondedAt and parentEmail', () => {
      const result = dataExportConsentSchema.safeParse({
        id: UUID,
        profileId: UUID,
        consentType: 'GDPR',
        status: 'PENDING',
        parentEmail: null,
        requestedAt: ISO,
        respondedAt: null,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = dataExportConsentSchema.safeParse({
        id: UUID,
        profileId: UUID,
        consentType: 'GDPR',
        status: 'PENDING',
        parentEmail: 'not-an-email',
        requestedAt: ISO,
        respondedAt: null,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('[BUG-206] dataExportRowSchema centralisation', () => {
    it('[WI-1097] all 19 tightened schemas are distinct from the stub', () => {
      // All 19 deferred aliases were z.record stubs after WI-978. After WI-1097
      // they are real z.object schemas — none must equal dataExportRowSchema.
      const tightened = [
        dataExportSubjectRowSchema,
        dataExportCurriculumRowSchema,
        dataExportCurriculumTopicRowSchema,
        dataExportLearningSessionRowSchema,
        dataExportSessionEventRowSchema,
        dataExportSessionSummaryRowSchema,
        dataExportRetentionCardRowSchema,
        dataExportXpLedgerRowSchema,
        dataExportStreakRowSchema,
        dataExportNotificationPreferenceRowSchema,
        dataExportLearningModeRowSchema,
        dataExportTeachingPreferenceRowSchema,
        dataExportParkingLotItemRowSchema,
        dataExportSessionEmbeddingRowSchema,
        dataExportQuotaPoolRowSchema,
        dataExportTopUpCreditRowSchema,
        dataExportNeedsDeepeningTopicRowSchema,
        dataExportFamilyLinkRowSchema,
        dataExportMentorActivityLedgerRowSchema,
      ];
      for (const schema of tightened) {
        expect(schema).not.toBe(dataExportRowSchema);
      }
      // Already-tightened (WI-978) schemas remain distinct:
      expect(dataExportSubscriptionRowSchema).not.toBe(dataExportRowSchema);
      expect(dataExportAssessmentRowSchema).not.toBe(dataExportRowSchema);
    });

    it('dataExportRowSchema accepts an arbitrary object row', () => {
      const result = dataExportRowSchema.safeParse({
        id: UUID,
        someColumn: 42,
        nested: { a: 1 },
      });
      expect(result.success).toBe(true);
    });

    it('dataExportRowSchema rejects primitive non-object values', () => {
      expect(dataExportRowSchema.safeParse('string-row').success).toBe(false);
      expect(dataExportRowSchema.safeParse(42).success).toBe(false);
      expect(dataExportRowSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('[WI-1097] dataExportSubjectRowSchema', () => {
    const validSubject = {
      id: UUID,
      profileId: UUID,
      name: 'Mathematics',
      rawInput: null,
      status: 'active' as const,
      pedagogyMode: 'socratic' as const,
      languageCode: null,
      createdAt: ISO,
      updatedAt: ISO,
      urgencyBoostUntil: null,
      urgencyBoostReason: null,
      bookSuggestionsLastGenerationAttemptedAt: null,
    };

    it('accepts a valid subject row', () => {
      expect(dataExportSubjectRowSchema.safeParse(validSubject).success).toBe(
        true,
      );
    });

    it('rejects a subject row missing required name', () => {
      const { name: _omit, ...rest } = validSubject;
      expect(dataExportSubjectRowSchema.safeParse(rest).success).toBe(false);
    });

    it('rejects an invalid status value', () => {
      expect(
        dataExportSubjectRowSchema.safeParse({
          ...validSubject,
          status: 'deleted',
        }).success,
      ).toBe(false);
    });
  });

  describe('[WI-1097] dataExportLearningSessionRowSchema', () => {
    const validSession = {
      id: UUID,
      profileId: UUID,
      subjectId: UUID,
      topicId: null,
      sessionType: 'learning' as const,
      verificationType: null,
      inputMode: 'text',
      status: 'completed' as const,
      escalationRung: 1,
      exchangeCount: 5,
      startedAt: ISO,
      lastActivityAt: ISO,
      endedAt: ISO,
      durationSeconds: 300,
      wallClockSeconds: 320,
      metadata: null,
      rawInput: null,
      filedAt: null,
      filingStatus: null,
      filingRetryCount: 0,
      createdAt: ISO,
      updatedAt: ISO,
    };

    it('accepts a valid learning session row', () => {
      expect(
        dataExportLearningSessionRowSchema.safeParse(validSession).success,
      ).toBe(true);
    });

    it('rejects a session row missing required profileId', () => {
      const { profileId: _omit, ...rest } = validSession;
      expect(dataExportLearningSessionRowSchema.safeParse(rest).success).toBe(
        false,
      );
    });

    it('rejects an invalid sessionType', () => {
      expect(
        dataExportLearningSessionRowSchema.safeParse({
          ...validSession,
          sessionType: 'unknown_type',
        }).success,
      ).toBe(false);
    });
  });

  describe('[WI-1097] dataExportRetentionCardRowSchema', () => {
    const validCard = {
      id: UUID,
      profileId: UUID,
      topicId: UUID,
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      masteredAt: null,
      failureCount: 0,
      consecutiveSuccesses: 0,
      xpStatus: 'pending' as const,
      evaluateDifficultyRung: null,
      createdAt: ISO,
      updatedAt: ISO,
    };

    it('accepts a valid retention card row', () => {
      expect(
        dataExportRetentionCardRowSchema.safeParse(validCard).success,
      ).toBe(true);
    });

    it('rejects when easeFactor is a string', () => {
      expect(
        dataExportRetentionCardRowSchema.safeParse({
          ...validCard,
          easeFactor: 'high',
        }).success,
      ).toBe(false);
    });

    it('rejects invalid xpStatus', () => {
      expect(
        dataExportRetentionCardRowSchema.safeParse({
          ...validCard,
          xpStatus: 'unknown',
        }).success,
      ).toBe(false);
    });
  });

  describe('[WI-1097] dataExportFamilyLinkRowSchema', () => {
    const validLink = {
      id: UUID,
      parentProfileId: UUID,
      childProfileId: UUID,
      createdAt: ISO,
    };

    it('accepts a valid family link row', () => {
      expect(dataExportFamilyLinkRowSchema.safeParse(validLink).success).toBe(
        true,
      );
    });

    it('rejects when parentProfileId is not a UUID', () => {
      expect(
        dataExportFamilyLinkRowSchema.safeParse({
          ...validLink,
          parentProfileId: 'not-a-uuid',
        }).success,
      ).toBe(false);
    });
  });

  describe('[WI-1097] dataExportMentorActivityLedgerRowSchema', () => {
    const validRow = {
      id: UUID,
      profileId: UUID,
      actorJob: 'session-closer',
      kind: 'session_completed',
      params: { topicId: UUID, xp: 10 },
      createdAt: ISO,
      surfacedAt: null,
    };

    it('accepts a valid mentor activity ledger row', () => {
      expect(
        dataExportMentorActivityLedgerRowSchema.safeParse(validRow).success,
      ).toBe(true);
    });

    it('rejects when required actorJob is missing', () => {
      const { actorJob: _omit, ...rest } = validRow;
      expect(
        dataExportMentorActivityLedgerRowSchema.safeParse(rest).success,
      ).toBe(false);
    });
  });

  describe('[WI-1097] dataExportStreakRowSchema', () => {
    it('accepts a valid streak row (lastActivityDate is text, not timestamp)', () => {
      const result = dataExportStreakRowSchema.safeParse({
        id: UUID,
        profileId: UUID,
        currentStreak: 7,
        longestStreak: 14,
        lastActivityDate: '2026-05-19',
        gracePeriodStartDate: null,
        createdAt: ISO,
        updatedAt: ISO,
      });
      expect(result.success).toBe(true);
    });

    it('rejects when currentStreak is a string', () => {
      expect(
        dataExportStreakRowSchema.safeParse({
          id: UUID,
          profileId: UUID,
          currentStreak: 'seven',
          longestStreak: 14,
          lastActivityDate: null,
          gracePeriodStartDate: null,
          createdAt: ISO,
          updatedAt: ISO,
        }).success,
      ).toBe(false);
    });
  });

  describe('[WI-1097] dataExportQuotaPoolRowSchema', () => {
    const validPool = {
      id: UUID,
      subscriptionId: UUID,
      monthlyLimit: 100,
      usedThisMonth: 42,
      dailyLimit: null,
      usedToday: 5,
      cycleResetAt: ISO,
      createdAt: ISO,
      updatedAt: ISO,
    };

    it('accepts a valid quota pool row', () => {
      expect(dataExportQuotaPoolRowSchema.safeParse(validPool).success).toBe(
        true,
      );
    });

    it('rejects when subscriptionId is missing', () => {
      const { subscriptionId: _omit, ...rest } = validPool;
      expect(dataExportQuotaPoolRowSchema.safeParse(rest).success).toBe(false);
    });
  });

  describe('[WI-1097] dataExportSessionEmbeddingRowSchema', () => {
    it('accepts a valid session embedding row (embedding as number array)', () => {
      const result = dataExportSessionEmbeddingRowSchema.safeParse({
        id: UUID,
        sessionId: UUID,
        profileId: UUID,
        topicId: null,
        embedding: [0.1, -0.2, 0.3],
        content: 'Topic summary text',
        createdAt: ISO,
      });
      expect(result.success).toBe(true);
    });

    it('rejects when embedding contains non-numbers', () => {
      expect(
        dataExportSessionEmbeddingRowSchema.safeParse({
          id: UUID,
          sessionId: UUID,
          profileId: UUID,
          topicId: null,
          embedding: ['a', 'b'],
          content: 'text',
          createdAt: ISO,
        }).success,
      ).toBe(false);
    });
  });

  describe('dataExportSchema (top-level GDPR Article 15 export)', () => {
    it('accepts a minimal export with only required fields', () => {
      const result = dataExportSchema.safeParse({
        account: {
          email: 'user@example.com',
          createdAt: ISO,
        },
        profiles: [],
        consentStates: [],
        exportedAt: ISO,
      });
      expect(result.success).toBe(true);
    });

    it('accepts subjects/subscriptions/quotaPools arrays with valid tightened rows', () => {
      // [WI-978] subscriptions uses tightened dataExportSubscriptionRowSchema.
      // [WI-1097] subjects and quotaPools now use tightened schemas too.
      // Nullable fields must be explicitly null (DB nullable columns return null).
      const result = dataExportSchema.safeParse({
        account: { email: 'user@example.com', createdAt: ISO },
        profiles: [],
        consentStates: [],
        subjects: [
          {
            id: UUID,
            profileId: UUID,
            name: 'Math',
            rawInput: null,
            status: 'active',
            pedagogyMode: 'socratic',
            languageCode: null,
            createdAt: ISO,
            updatedAt: ISO,
            urgencyBoostUntil: null,
            urgencyBoostReason: null,
            bookSuggestionsLastGenerationAttemptedAt: null,
          },
        ],
        subscriptions: [
          {
            id: UUID,
            accountId: UUID,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            tier: 'free',
            status: 'active',
            trialEndsAt: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            cancelledAt: null,
            lastStripeEventTimestamp: null,
            lastStripeEventId: null,
            revenuecatOriginalAppUserId: null,
            lastRevenuecatEventId: null,
            lastRevenuecatEventTimestampMs: null,
            createdAt: ISO,
            updatedAt: ISO,
          },
        ],
        quotaPools: [
          {
            id: UUID,
            subscriptionId: UUID,
            monthlyLimit: 100,
            usedThisMonth: 0,
            dailyLimit: null,
            usedToday: 0,
            cycleResetAt: ISO,
            createdAt: ISO,
            updatedAt: ISO,
          },
        ],
        exportedAt: ISO,
      });
      expect(result.success).toBe(true);
    });

    it('[WI-978] tightened subscription schema rejects partial/arbitrary rows', () => {
      // A bare { tier: 'free' } that the old z.record stub accepted must now fail.
      const result = dataExportSubscriptionRowSchema.safeParse({
        tier: 'free',
      });
      expect(result.success).toBe(false);
    });

    it('[WI-978] tightened subscription schema accepts a valid minimal row', () => {
      // Nullable fields must be explicitly null (DB nullable columns return null,
      // not undefined; .nullable() rejects undefined).
      const result = dataExportSubscriptionRowSchema.safeParse({
        id: UUID,
        accountId: UUID,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        tier: 'free',
        status: 'active',
        trialEndsAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelledAt: null,
        lastStripeEventTimestamp: null,
        lastStripeEventId: null,
        revenuecatOriginalAppUserId: null,
        lastRevenuecatEventId: null,
        lastRevenuecatEventTimestampMs: null,
        createdAt: ISO,
        updatedAt: ISO,
      });
      expect(result.success).toBe(true);
    });

    it('[WI-978] tightened assessment schema rejects partial rows', () => {
      // A bare { profileId: UUID } that the old z.record accepted must now fail.
      const result = dataExportAssessmentRowSchema.safeParse({
        profileId: UUID,
      });
      expect(result.success).toBe(false);
    });

    it('[WI-978] tightened assessment schema accepts a valid minimal row', () => {
      // Nullable fields must be explicitly null (DB nullable columns return null,
      // not undefined; .nullable() rejects undefined). verificationDepth and
      // exchangeHistory have .default() so they can be omitted (defaults apply).
      const result = dataExportAssessmentRowSchema.safeParse({
        id: UUID,
        profileId: UUID,
        subjectId: UUID,
        topicId: UUID,
        sessionId: null,
        status: 'passed',
        masteryScore: null,
        masteryChallengeVerifiedAt: null,
        qualityRating: null,
        createdAt: ISO,
        updatedAt: ISO,
      });
      expect(result.success).toBe(true);
    });

    it('rejects when account email is malformed', () => {
      const result = dataExportSchema.safeParse({
        account: { email: 'not-an-email', createdAt: ISO },
        profiles: [],
        consentStates: [],
        exportedAt: ISO,
      });
      expect(result.success).toBe(false);
    });

    describe('[WI-995] dataExportSchema.profiles uses publicProfileSchema — accountId stripped', () => {
      it('strips accountId from parsed profile output', () => {
        // dataExportSchema.profiles must use publicProfileSchema (omits accountId).
        // A profile with accountId set in the input must NOT have accountId in the output.
        const result = dataExportSchema.safeParse({
          account: { email: 'user@example.com', createdAt: ISO },
          profiles: [
            {
              id: UUID,
              accountId: UUID, // <-- must be stripped by publicProfileSchema
              displayName: 'Alice',
              avatarUrl: null,
              birthYear: 2000,
              location: null,
              isOwner: true,
              hasPremiumLlm: false,
              defaultAppContext: null,
              hasFamilyLinks: false,
              conversationLanguage: 'en',
              pronouns: null,
              consentStatus: null,
              linkCreatedAt: null,
              createdAt: ISO,
              updatedAt: ISO,
            },
          ],
          consentStates: [],
          exportedAt: ISO,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.profiles).toHaveLength(1);
          const profile = result.data.profiles[0]!;
          // accountId must not appear on the parsed profile
          expect(Object.keys(profile)).not.toContain('accountId');
        }
      });

      it('accepts profiles with no accountId (public shape)', () => {
        // publicProfileSchema does not require accountId — a profile built without
        // it must parse cleanly.
        const result = dataExportSchema.safeParse({
          account: { email: 'user@example.com', createdAt: ISO },
          profiles: [
            {
              id: UUID,
              displayName: 'Bob',
              avatarUrl: null,
              birthYear: 1995,
              location: null,
              isOwner: false,
              hasPremiumLlm: false,
              defaultAppContext: null,
              hasFamilyLinks: false,
              conversationLanguage: 'en',
              pronouns: null,
              consentStatus: null,
              linkCreatedAt: null,
              createdAt: ISO,
              updatedAt: ISO,
            },
          ],
          consentStates: [],
          exportedAt: ISO,
        });
        expect(result.success).toBe(true);
      });
    });
  });
});
