import { deriveReviewOutcome } from './review-callback';
import type { RetentionState } from './retention';

function card(overrides: Partial<RetentionState> = {}): RetentionState {
  return {
    topicId: 'topic-1',
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 1,
    failureCount: 0,
    consecutiveSuccesses: 0,
    xpStatus: 'pending',
    nextReviewAt: null,
    lastReviewedAt: null,
    ...overrides,
  };
}

describe('deriveReviewOutcome', () => {
  describe('first_time', () => {
    it('returns first_time when there is no card', () => {
      expect(deriveReviewOutcome(null, null)).toBe('first_time');
      expect(deriveReviewOutcome(null, 100)).toBe('first_time');
    });

    it('returns first_time when repetitions === 0 and no failures, even with stale success signals', () => {
      expect(
        deriveReviewOutcome(
          card({
            repetitions: 0,
            failureCount: 0,
            xpStatus: 'verified',
            consecutiveSuccesses: 3,
          }),
          2,
        ),
      ).toBe('first_time');
    });
  });

  describe('long_gap (precedence over cracked/wobbled)', () => {
    it('returns long_gap when daysSinceLastReview > 30, even for a verified card', () => {
      expect(
        deriveReviewOutcome(card({ repetitions: 5, xpStatus: 'verified' }), 45),
      ).toBe('long_gap');
    });

    it('returns long_gap for a previously-failed card past the gap', () => {
      expect(
        deriveReviewOutcome(card({ repetitions: 2, failureCount: 3 }), 31),
      ).toBe('long_gap');
    });

    it('does NOT treat exactly 30 days as a long gap (strict >)', () => {
      expect(
        deriveReviewOutcome(card({ repetitions: 5, xpStatus: 'verified' }), 30),
      ).toBe('cracked');
    });

    it('does NOT treat a null gap as long_gap', () => {
      expect(
        deriveReviewOutcome(
          card({ repetitions: 5, xpStatus: 'verified' }),
          null,
        ),
      ).toBe('cracked');
    });
  });

  describe('cracked', () => {
    it('returns cracked when xpStatus is verified', () => {
      expect(
        deriveReviewOutcome(card({ repetitions: 3, xpStatus: 'verified' }), 2),
      ).toBe('cracked');
    });

    it('returns cracked when consecutiveSuccesses >= 1 (xpStatus pending)', () => {
      expect(
        deriveReviewOutcome(
          card({ repetitions: 2, consecutiveSuccesses: 1 }),
          1,
        ),
      ).toBe('cracked');
    });
  });

  describe('wobbled', () => {
    it('returns wobbled when failureCount > 0 and not verified', () => {
      expect(
        deriveReviewOutcome(
          card({ repetitions: 2, failureCount: 1, consecutiveSuccesses: 0 }),
          1,
        ),
      ).toBe('wobbled');
    });

    it('returns wobbled when xpStatus is decayed', () => {
      expect(
        deriveReviewOutcome(card({ repetitions: 2, xpStatus: 'decayed' }), 3),
      ).toBe('wobbled');
    });

    it('returns wobbled for a failed-only card (SM-2 reset repetitions to 0 but failureCount > 0)', () => {
      // A learner who only ever missed this topic: SM-2 resets repetitions to 0
      // on a failed recall (sm2: "quality 2 resets repetitions to 0"), so this
      // must NOT short-circuit to first_time and lose the wobbled framing.
      expect(
        deriveReviewOutcome(
          card({ repetitions: 0, failureCount: 1, xpStatus: 'decayed' }),
          2,
        ),
      ).toBe('wobbled');
    });
  });

  describe('unknown (safe neutral default)', () => {
    it('returns unknown for a touched card with no success or failure signal', () => {
      expect(
        deriveReviewOutcome(
          card({
            repetitions: 1,
            failureCount: 0,
            consecutiveSuccesses: 0,
            xpStatus: 'pending',
          }),
          1,
        ),
      ).toBe('unknown');
    });
  });
});
