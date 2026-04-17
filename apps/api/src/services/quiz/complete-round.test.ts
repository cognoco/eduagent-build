import type {
  CapitalsQuestion,
  GuessWhoQuestion,
  QuestionResult,
  QuizQuestion,
} from '@eduagent/schemas';
import {
  buildMissedItemText,
  calculateScore,
  calculateXp,
  getCelebrationTier,
  getGuessWhoSm2Quality,
  getVocabSm2Quality,
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

describe('buildMissedItemText', () => {
  it('formats capitals missed items', () => {
    expect(
      buildMissedItemText({
        type: 'capitals',
        country: 'France',
        correctAnswer: 'Paris',
        acceptedAliases: ['Paris'],
        distractors: ['Berlin', 'Madrid', 'Rome'],
        funFact: '',
        isLibraryItem: false,
      })
    ).toBe('What is the capital of France?');
  });

  it('formats vocabulary missed items', () => {
    expect(
      buildMissedItemText({
        type: 'vocabulary',
        term: 'der Hund',
        correctAnswer: 'dog',
        acceptedAnswers: ['dog'],
        distractors: ['cat', 'bird', 'fish'],
        funFact: '',
        cefrLevel: 'A1',
        isLibraryItem: false,
      })
    ).toBe('Translate: der Hund');
  });
});

describe('getVocabSm2Quality', () => {
  it('returns 4 for correct answers', () => {
    expect(getVocabSm2Quality(true)).toBe(4);
  });

  it('returns 2 for wrong answers', () => {
    expect(getVocabSm2Quality(false)).toBe(2);
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

  it('accepts vocabulary answers from acceptedAnswers', () => {
    const question: QuizQuestion = {
      type: 'vocabulary',
      term: 'der Hund',
      correctAnswer: 'dog',
      acceptedAnswers: ['dog', 'the dog'],
      distractors: ['cat', 'bird', 'fish'],
      funFact: '',
      cefrLevel: 'A1',
      isLibraryItem: false,
    };

    expect(isAnswerCorrect(question, 'the dog')).toBe(true);
    expect(isAnswerCorrect(question, 'cat')).toBe(false);
  });

  it('rejects wrong answers even if client claims correct', () => {
    expect(isAnswerCorrect(question, 'Lyon')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAnswerCorrect(question, '')).toBe(false);
  });
});

describe('validateResults (anti-tampering)', () => {
  const questions: QuizQuestion[] = [
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

describe('isAnswerCorrect — guess_who', () => {
  const guessWhoQuestion: GuessWhoQuestion = {
    type: 'guess_who',
    canonicalName: 'Isaac Newton',
    correctAnswer: 'Isaac Newton',
    acceptedAliases: ['Newton', 'Sir Isaac Newton'],
    clues: ['C1', 'C2', 'C3', 'C4', 'C5'],
    mcFallbackOptions: ['Isaac Newton', 'Einstein', 'Tesla', 'Curie'],
    funFact: 'Fact.',
    isLibraryItem: false,
  };

  it('matches exact canonical name', () => {
    expect(isAnswerCorrect(guessWhoQuestion, 'Isaac Newton')).toBe(true);
  });

  it('matches exact alias', () => {
    expect(isAnswerCorrect(guessWhoQuestion, 'Newton')).toBe(true);
  });

  it('matches fuzzy (Levenshtein within threshold)', () => {
    // "Newten" vs "Newton" (6 chars) → maxDistance = 1, distance = 1 → match
    expect(isAnswerCorrect(guessWhoQuestion, 'Newten')).toBe(true);
  });

  it('rejects answer exceeding distance threshold', () => {
    expect(isAnswerCorrect(guessWhoQuestion, 'Mozart')).toBe(false);
  });

  it('rejects empty answer', () => {
    expect(isAnswerCorrect(guessWhoQuestion, '')).toBe(false);
  });
});

describe('buildMissedItemText — guess_who', () => {
  it('formats guess_who missed items with easiest clue', () => {
    expect(
      buildMissedItemText({
        type: 'guess_who',
        canonicalName: 'Marie Curie',
        correctAnswer: 'Marie Curie',
        acceptedAliases: ['Curie'],
        clues: [
          'Vague',
          'Less vague',
          'Hint',
          'Big hint',
          'Nobel Prize for radioactivity',
        ],
        mcFallbackOptions: ['Curie', 'Darwin', 'Tesla', 'Pasteur'],
        funFact: 'Fact.',
        isLibraryItem: false,
      })
    ).toBe('Who is this person? Nobel Prize for radioactivity');
  });
});

describe('calculateXp — guess_who clue bonus', () => {
  it('adds clue bonus for free-text correct answers', () => {
    const results: QuestionResult[] = [
      {
        questionIndex: 0,
        correct: true,
        answerGiven: 'Newton',
        timeMs: 8000,
        cluesUsed: 2,
        answerMode: 'free_text',
      },
      {
        questionIndex: 1,
        correct: true,
        answerGiven: 'Curie',
        timeMs: 3000,
        cluesUsed: 1,
        answerMode: 'free_text',
      },
      {
        questionIndex: 2,
        correct: false,
        answerGiven: 'Wrong',
        timeMs: 15000,
        cluesUsed: 5,
        answerMode: 'free_text',
      },
      {
        questionIndex: 3,
        correct: true,
        answerGiven: 'Tesla',
        timeMs: 12000,
        cluesUsed: 4,
        answerMode: 'multiple_choice',
      },
    ];
    // base: 3 correct × 10 = 30
    // timer: 1 answer < 5000ms (Curie) × 2 = 2
    // perfect: 3/4 ≠ perfect → 0
    // clue bonus (free_text only): (5-2)×3 + (5-1)×3 = 9 + 12 = 21. MC gets 0.
    // total: 30 + 2 + 0 + 21 = 53
    expect(calculateXp(results, 4, 'guess_who')).toBe(53);
  });

  it('gives no clue bonus for MC answers', () => {
    const results: QuestionResult[] = [
      {
        questionIndex: 0,
        correct: true,
        answerGiven: 'Newton',
        timeMs: 8000,
        cluesUsed: 4,
        answerMode: 'multiple_choice',
      },
    ];
    // base: 10, timer: 0, perfect: 25 (1/1), clue bonus: 0 (MC)
    expect(calculateXp(results, 1, 'guess_who')).toBe(35);
  });

  it('works unchanged for non-guess_who activities', () => {
    const results: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 2000 },
    ];
    // base: 10, timer: 2, perfect: 25
    expect(calculateXp(results, 1)).toBe(37);
    expect(calculateXp(results, 1, 'capitals')).toBe(37);
  });
});

describe('getGuessWhoSm2Quality', () => {
  it('returns 5 for free-text guess in 1-2 clues', () => {
    expect(getGuessWhoSm2Quality(true, 1, 'free_text')).toBe(5);
    expect(getGuessWhoSm2Quality(true, 2, 'free_text')).toBe(5);
  });

  it('returns 3 for free-text guess in 3-4 clues', () => {
    expect(getGuessWhoSm2Quality(true, 3, 'free_text')).toBe(3);
    expect(getGuessWhoSm2Quality(true, 4, 'free_text')).toBe(3);
  });

  it('returns 2 for free-text guess in 5 clues', () => {
    expect(getGuessWhoSm2Quality(true, 5, 'free_text')).toBe(2);
  });

  it('returns 2 for MC tap regardless of clue count', () => {
    expect(getGuessWhoSm2Quality(true, 4, 'multiple_choice')).toBe(2);
    expect(getGuessWhoSm2Quality(true, 5, 'multiple_choice')).toBe(2);
  });

  it('returns 1 for missed entirely', () => {
    expect(getGuessWhoSm2Quality(false, 5, 'free_text')).toBe(1);
    expect(getGuessWhoSm2Quality(false, 5, 'multiple_choice')).toBe(1);
  });
});
