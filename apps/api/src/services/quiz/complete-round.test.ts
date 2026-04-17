import type { CapitalsQuestion, QuestionResult } from '@eduagent/schemas';
import {
  calculateScore,
  calculateXp,
  getCelebrationTier,
  isAnswerCorrect,
  validateResults,
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

// [ASSUMP-F5] Break tests: prove the server never trusts client `correct`.
describe('isAnswerCorrect (server-side truth)', () => {
  const question: CapitalsQuestion = {
    type: 'capitals',
    country: 'France',
    correctAnswer: 'Paris',
    acceptedAliases: ['Paris'],
    distractors: ['Lyon', 'Marseille', 'Nice'],
    funFact: '',
    isLibraryItem: false,
  };

  it('accepts the canonical answer', () => {
    expect(isAnswerCorrect(question, 'Paris')).toBe(true);
  });

  it('accepts aliases case-insensitively', () => {
    const q: CapitalsQuestion = {
      ...question,
      acceptedAliases: ['Paris', 'Paname'],
    };
    expect(isAnswerCorrect(q, 'paname')).toBe(true);
  });

  it('rejects wrong answers even if client claims correct', () => {
    expect(isAnswerCorrect(question, 'Lyon')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAnswerCorrect(question, '')).toBe(false);
  });
});

describe('validateResults (anti-tampering)', () => {
  const questions: CapitalsQuestion[] = [
    {
      type: 'capitals',
      country: 'France',
      correctAnswer: 'Paris',
      acceptedAliases: ['Paris'],
      distractors: ['Lyon', 'Marseille', 'Nice'],
      funFact: '',
      isLibraryItem: false,
    },
    {
      type: 'capitals',
      country: 'Germany',
      correctAnswer: 'Berlin',
      acceptedAliases: ['Berlin'],
      distractors: ['Munich', 'Hamburg', 'Cologne'],
      funFact: '',
      isLibraryItem: false,
    },
  ];

  it('overrides client-reported correct=true when answer is wrong', () => {
    // Attacker sends all-correct to farm XP
    const tampered: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Lyon', timeMs: 100 },
      { questionIndex: 1, correct: true, answerGiven: 'Munich', timeMs: 100 },
    ];

    const validated = validateResults(questions, tampered);

    expect(validated).toEqual([
      { questionIndex: 0, correct: false, answerGiven: 'Lyon', timeMs: 100 },
      { questionIndex: 1, correct: false, answerGiven: 'Munich', timeMs: 100 },
    ]);
    expect(calculateScore(validated)).toBe(0);
  });

  it('overrides client-reported correct=false when answer is actually right', () => {
    const underReported: QuestionResult[] = [
      { questionIndex: 0, correct: false, answerGiven: 'Paris', timeMs: 3000 },
    ];

    const validated = validateResults(questions, underReported);
    expect(validated[0]?.correct).toBe(true);
  });

  it('drops results with out-of-bounds questionIndex', () => {
    const malicious: QuestionResult[] = [
      { questionIndex: 999, correct: true, answerGiven: 'whatever', timeMs: 1 },
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 3000 },
    ];

    const validated = validateResults(questions, malicious);
    expect(validated).toHaveLength(1);
    expect(validated[0]?.questionIndex).toBe(0);
  });
});
