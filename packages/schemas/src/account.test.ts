/**
 * [BUG-206] dataExportSchema — centralised export-row schema.
 *
 * Tightening from `z.record(z.string(), z.unknown())` inline per-table to a
 * single named alias (`dataExportRowSchema`) gives us one place to ratchet
 * stricter per-table shapes in future PRs. These tests pin the contract.
 */

import {
  accountDeletionResponseSchema,
  accountDeletionStatusResponseSchema,
  cancelDeletionResponseSchema,
  dataExportAssessmentRowSchema,
  dataExportConsentSchema,
  dataExportRowSchema,
  dataExportSchema,
  dataExportSubjectRowSchema,
  dataExportSubscriptionRowSchema,
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
    it('deferred per-table aliases still reference the canonical row schema', () => {
      // Only non-tightened (deferred) aliases stay as dataExportRowSchema.
      // [WI-978] subscriptions + assessments have been tightened to real z.object
      // schemas — they are intentionally NOT toBe(dataExportRowSchema) any more.
      expect(dataExportSubjectRowSchema).toBe(dataExportRowSchema);
      // Verify the tightened schemas are distinct (not the stub):
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

    it('accepts subjects/subscriptions/quotaPools arrays', () => {
      // [WI-978] subscriptions now uses the tightened dataExportSubscriptionRowSchema;
      // the payload must match the real schema (not an arbitrary record).
      // Nullable fields must be explicitly null (not undefined) — DB nullable
      // columns return null, not undefined.
      const result = dataExportSchema.safeParse({
        account: { email: 'user@example.com', createdAt: ISO },
        profiles: [],
        consentStates: [],
        subjects: [{ id: UUID, name: 'Math' }],
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
        quotaPools: [{ pool: 'free' }],
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
  });
});
