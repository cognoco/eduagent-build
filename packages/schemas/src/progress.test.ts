import {
  streakCardSchema,
  insightCardSchema,
  reviewDueCardSchema,
  challengeCardSchema,
  coachingCardSchema,
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

  describe('coachingCardSchema (discriminated union)', () => {
    it('accepts all 4 card types', () => {
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
        '2025-12-31T23:59:59.999Z'
      );
    });
  });
});
