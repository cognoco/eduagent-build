import {
  buildCapitalsMasteryLibraryItem,
  buildGuessWhoMasteryLibraryItem,
  applyQuizSm2,
} from './mastery-provider';

describe('mastery-provider', () => {
  describe('buildCapitalsMasteryLibraryItem', () => {
    it('builds a LibraryItem from mastery row data', () => {
      const item = buildCapitalsMasteryLibraryItem({
        itemKey: 'slovakia',
        itemAnswer: 'Bratislava',
      });
      expect(item.question).toBe('slovakia');
      expect(item.answer).toBe('Bratislava');
    });
  });

  describe('buildGuessWhoMasteryLibraryItem', () => {
    it('builds a LibraryItem from mastery row data', () => {
      const item = buildGuessWhoMasteryLibraryItem({
        itemKey: 'abc123def456ab78',
        itemAnswer: 'Isaac Newton',
      });
      expect(item.id).toBe('abc123def456ab78');
      expect(item.answer).toBe('Isaac Newton');
    });
  });

  describe('applyQuizSm2', () => {
    const baseInput = {
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      lastReviewedAt: new Date('2026-04-18T10:00:00Z'),
      nextReviewAt: new Date('2026-04-19T10:00:00Z'),
    };

    it('applies SM-2 for a new card with quality 3', () => {
      const result = applyQuizSm2(baseInput, 3);
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(1);
      expect(result.easeFactor).toBeCloseTo(2.36, 1);
    });

    it('resets on quality < 3', () => {
      const result = applyQuizSm2(
        { ...baseInput, interval: 6, repetitions: 3 },
        1
      );
      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
    });

    it('returns a valid Date for nextReviewAt', () => {
      const result = applyQuizSm2(baseInput, 4);
      expect(result.nextReviewAt).toBeInstanceOf(Date);
      expect(result.nextReviewAt.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
