import type { QuestionResult } from '@eduagent/schemas';
import {
  calculateScore,
  calculateXp,
  getCelebrationTier,
} from './complete-round';

describe('calculateScore', () => {
  it('counts correct answers', () => {
    const results: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 3000 },
      { questionIndex: 1, correct: false, answerGiven: 'Munich', timeMs: 4000 },
      { questionIndex: 2, correct: true, answerGiven: 'Rome', timeMs: 2000 },
    ];

    expect(calculateScore(results)).toBe(2);
  });

  it('returns 0 for all wrong', () => {
    const results: QuestionResult[] = [
      { questionIndex: 0, correct: false, answerGiven: 'X', timeMs: 3000 },
    ];

    expect(calculateScore(results)).toBe(0);
  });
});

describe('calculateXp', () => {
  it('awards base XP per correct answer and perfect bonus', () => {
    const results: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 6000 },
      { questionIndex: 1, correct: true, answerGiven: 'Berlin', timeMs: 7000 },
    ];

    expect(calculateXp(results, 2)).toBe(45);
  });

  it('awards timer bonus for fast answers', () => {
    const results: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 3000 },
      { questionIndex: 1, correct: true, answerGiven: 'Berlin', timeMs: 4000 },
      { questionIndex: 2, correct: false, answerGiven: 'X', timeMs: 2000 },
    ];

    expect(calculateXp(results, 3)).toBe(24);
  });

  it('awards perfect bonus for 100 percent', () => {
    const results: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 6000 },
    ];

    expect(calculateXp(results, 1)).toBe(35);
  });
});

describe('getCelebrationTier', () => {
  it('returns perfect for 100 percent', () => {
    expect(getCelebrationTier(8, 8)).toBe('perfect');
  });

  it('returns great for >= 80 percent', () => {
    expect(getCelebrationTier(7, 8)).toBe('great');
  });

  it('returns nice for < 80 percent', () => {
    expect(getCelebrationTier(5, 8)).toBe('nice');
  });

  it('returns nice for zero', () => {
    expect(getCelebrationTier(0, 8)).toBe('nice');
  });
});
