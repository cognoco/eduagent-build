import { sm2 } from './sm2.js';
import type { RetentionCard } from './sm2.js';

describe('sm2', () => {
  it('new card with quality 5 gives interval 1, reps 1, ease >= 2.5', () => {
    const result = sm2({ quality: 5 });
    expect(result.card.interval).toBe(1);
    expect(result.card.repetitions).toBe(1);
    expect(result.card.easeFactor).toBeGreaterThanOrEqual(2.5);
    expect(result.wasSuccessful).toBe(true);
  });

  it('new card with quality 0 gives interval 1, reps 0, wasSuccessful false', () => {
    const result = sm2({ quality: 0 });
    expect(result.card.interval).toBe(1);
    expect(result.card.repetitions).toBe(0);
    expect(result.wasSuccessful).toBe(false);
  });

  it('second review with quality 4 gives interval 6, reps 2', () => {
    const firstResult = sm2({ quality: 4 });
    const secondResult = sm2({ quality: 4, card: firstResult.card });
    expect(secondResult.card.interval).toBe(6);
    expect(secondResult.card.repetitions).toBe(2);
    expect(secondResult.wasSuccessful).toBe(true);
  });

  it('third review interval equals previous interval * easeFactor (rounded)', () => {
    const first = sm2({ quality: 4 });
    const second = sm2({ quality: 4, card: first.card });
    const third = sm2({ quality: 4, card: second.card });
    const expectedInterval = Math.round(
      second.card.interval * third.card.easeFactor
    );
    // The ease factor used in interval calc is calculated before rounding,
    // so we verify the interval is close to previous * ease
    expect(third.card.interval).toBe(
      Math.round(
        second.card.interval * second.card.easeFactor +
          (0.1 - (5 - 4) * (0.08 + (5 - 4) * 0.02)) * second.card.interval
      )
      // Actually, interval = round(prevInterval * newEase), and newEase is computed from prevEase.
      // Let's just verify it's greater than the second interval.
    );
    expect(third.card.interval).toBeGreaterThan(second.card.interval);
    expect(third.card.repetitions).toBe(3);
  });

  it('quality 2 (failure) resets repetitions to 0, interval to 1', () => {
    const first = sm2({ quality: 5 });
    const second = sm2({ quality: 5, card: first.card });
    const failed = sm2({ quality: 2, card: second.card });
    expect(failed.card.repetitions).toBe(0);
    expect(failed.card.interval).toBe(1);
    expect(failed.wasSuccessful).toBe(false);
  });

  it('ease factor never goes below 1.3', () => {
    // Repeatedly fail to drive ease down
    let card: RetentionCard | undefined;
    for (let i = 0; i < 20; i++) {
      const result = sm2({ quality: 0, card });
      card = result.card;
    }
    expect(card!.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('multiple consecutive successes increase interval', () => {
    let card: RetentionCard | undefined;
    const intervals: number[] = [];

    for (let i = 0; i < 6; i++) {
      const result = sm2({ quality: 5, card });
      card = result.card;
      intervals.push(card.interval);
    }

    // After the first two reviews (interval 1, then 6), intervals should keep growing
    for (let i = 3; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
  });

  it('multiple consecutive failures keep ease at minimum', () => {
    let card: RetentionCard | undefined;
    for (let i = 0; i < 10; i++) {
      const result = sm2({ quality: 0, card });
      card = result.card;
    }
    expect(card!.easeFactor).toBe(1.3);
    expect(card!.repetitions).toBe(0);
    expect(card!.interval).toBe(1);
  });

  it('returns valid ISO 8601 dates', () => {
    const result = sm2({ quality: 4 });
    expect(() => new Date(result.card.lastReviewedAt)).not.toThrow();
    expect(() => new Date(result.card.nextReviewAt)).not.toThrow();
    expect(new Date(result.card.nextReviewAt).getTime()).toBeGreaterThan(
      new Date(result.card.lastReviewedAt).getTime()
    );
  });

  it('quality 3 (borderline success) still counts as successful', () => {
    const result = sm2({ quality: 3 });
    expect(result.wasSuccessful).toBe(true);
    expect(result.card.repetitions).toBe(1);
  });

  it('NaN quality treats as 0, produces valid card', () => {
    const result = sm2({ quality: NaN });
    expect(result.wasSuccessful).toBe(false);
    expect(result.card.repetitions).toBe(0);
    expect(result.card.interval).toBe(1);
    expect(Number.isFinite(result.card.easeFactor)).toBe(true);
    expect(result.card.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('Infinity quality treats as 0, produces valid card', () => {
    const result = sm2({ quality: Infinity });
    expect(result.wasSuccessful).toBe(false);
    expect(result.card.repetitions).toBe(0);
    expect(result.card.interval).toBe(1);
    expect(Number.isFinite(result.card.easeFactor)).toBe(true);
    expect(result.card.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('-Infinity quality treats as 0, produces valid card', () => {
    const result = sm2({ quality: -Infinity });
    expect(result.wasSuccessful).toBe(false);
    expect(result.card.repetitions).toBe(0);
    expect(result.card.interval).toBe(1);
    expect(Number.isFinite(result.card.easeFactor)).toBe(true);
    expect(result.card.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('undefined quality coerced treats as 0, produces valid card', () => {
    const result = sm2({ quality: undefined as unknown as number });
    expect(result.wasSuccessful).toBe(false);
    expect(result.card.repetitions).toBe(0);
    expect(result.card.interval).toBe(1);
    expect(Number.isFinite(result.card.easeFactor)).toBe(true);
    expect(result.card.easeFactor).toBeGreaterThanOrEqual(1.3);
  });
});
