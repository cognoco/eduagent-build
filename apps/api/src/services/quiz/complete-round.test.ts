import type {
  CapitalsQuestion,
  GuessWhoQuestion,
  QuestionResult,
  QuizQuestion,
  VocabularyQuestion,
} from '@eduagent/schemas';
import { BadRequestError, ConflictError } from '@eduagent/schemas';

// [CR-2026-05-19-M1] Sentry external-boundary mock — proves captureException
// fires on mastery upsert failure. Sentry is an external boundary (Sentry SDK).
const mockCaptureException = jest.fn();
jest.mock('../sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../sentry') as typeof import('../sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

const mockQueueCelebration = jest.fn();
jest.mock(
  '../celebrations' /* gc1-allow: external DB/cache write; quiz tests assert enqueue contract without touching home cache tables */,
  () => {
    const actual = jest.requireActual(
      '../celebrations',
    ) as typeof import('../celebrations');
    return {
      ...actual,
      queueCelebration: (...args: unknown[]) => mockQueueCelebration(...args),
    };
  },
);

import {
  assertAnswerInOptions,
  buildMasterySm2Input,
  buildMissedItemText,
  calculateScore,
  calculateXp,
  checkQuizAnswerWithCorrect,
  completeQuizRound,
  getCapitalsSm2Quality,
  getCelebrationTier,
  getGuessWhoSm2Quality,
  getVocabSm2Quality,
  inferVocabularyTypeFromTerm,
  isAnswerCorrect,
  validateResults,
} from './complete-round';
import { QUIZ_CONFIG } from './config';
import type { Database } from '@eduagent/database';
import * as database from '@eduagent/database';
import {
  TEST_PROFILE_ID,
  TEST_PROFILE_ID_2,
  TEST_PROFILE_ID_3,
} from '@eduagent/test-utils';

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
      }),
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
      }),
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

describe('inferVocabularyTypeFromTerm', () => {
  it('keeps article+noun entries as words', () => {
    expect(inferVocabularyTypeFromTerm('das Schwein')).toBe('word');
    expect(inferVocabularyTypeFromTerm('la casa')).toBe('word');
    expect(inferVocabularyTypeFromTerm('el perro')).toBe('word');
  });

  it('stores reusable daily phrases as chunks', () => {
    expect(inferVocabularyTypeFromTerm('Guten Morgen')).toBe('chunk');
    expect(inferVocabularyTypeFromTerm('Va bene')).toBe('chunk');
  });

  // Correctness-lens finding: the English pronoun "I" must not be treated as the
  // Italian plural article 'i', which would misclassify English 2-word terms.
  it('treats an English term beginning with "I" as a chunk, not a word', () => {
    expect(inferVocabularyTypeFromTerm('I think')).toBe('chunk');
    expect(inferVocabularyTypeFromTerm('I understand')).toBe('chunk');
  });
});

describe('getCapitalsSm2Quality', () => {
  it('returns 4 for correct', () => {
    expect(getCapitalsSm2Quality(true)).toBe(4);
  });

  it('returns 1 for incorrect', () => {
    expect(getCapitalsSm2Quality(false)).toBe(1);
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

// [BUG-STALE-OPTIONS] Defense-in-depth: assertAnswerInOptions rejects MC
// answers that are not in the server-known option set (distractors + correct).
describe('assertAnswerInOptions [BUG-STALE-OPTIONS]', () => {
  const vocabQuestion: VocabularyQuestion = {
    type: 'vocabulary',
    term: 'die Katze',
    correctAnswer: 'cat',
    acceptedAnswers: ['cat', 'the cat'],
    distractors: ['dog', 'fish', 'bird'],
    funFact: '',
    cefrLevel: 'A1',
    isLibraryItem: false,
  };

  const capitalsQuestion: CapitalsQuestion = {
    type: 'capitals',
    country: 'France',
    correctAnswer: 'Paris',
    acceptedAliases: ['Paris'],
    distractors: ['Lyon', 'Madrid', 'Rome'],
    funFact: '',
    isLibraryItem: false,
  };

  it('[BREAK] throws BadRequestError when MC vocabulary answer is not in options', () => {
    // Simulates stale-options race: 'dog' is from a different question
    expect(() =>
      assertAnswerInOptions(
        vocabQuestion,
        'dog_from_old_question',
        'multiple_choice',
      ),
    ).toThrow(BadRequestError);
  });

  it('[BREAK] throws BadRequestError when MC capitals answer is not in options', () => {
    expect(() =>
      assertAnswerInOptions(capitalsQuestion, 'Berlin', 'multiple_choice'),
    ).toThrow(BadRequestError);
  });

  it('accepts a valid MC answer that is in distractors', () => {
    expect(() =>
      assertAnswerInOptions(vocabQuestion, 'dog', 'multiple_choice'),
    ).not.toThrow();
  });

  it('accepts a valid MC answer that is the correctAnswer', () => {
    expect(() =>
      assertAnswerInOptions(vocabQuestion, 'cat', 'multiple_choice'),
    ).not.toThrow();
  });

  it('is a no-op for free_text mode (accepts any answer)', () => {
    expect(() =>
      assertAnswerInOptions(vocabQuestion, 'completely_stale', 'free_text'),
    ).not.toThrow();
  });

  it('is a no-op when answerMode is undefined (backward compat)', () => {
    expect(() =>
      assertAnswerInOptions(vocabQuestion, 'completely_stale', undefined),
    ).not.toThrow();
  });

  it('is case-insensitive for MC matching', () => {
    expect(() =>
      assertAnswerInOptions(vocabQuestion, 'CAT', 'multiple_choice'),
    ).not.toThrow();
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

  it('[BREAK/WI-230] keeps only the first result for each questionIndex', () => {
    const duplicated: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 100 },
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 100 },
      { questionIndex: 1, correct: true, answerGiven: 'Berlin', timeMs: 100 },
    ];
    const deduplicated: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 100 },
      { questionIndex: 1, correct: true, answerGiven: 'Berlin', timeMs: 100 },
    ];

    const validated = validateResults(questions, duplicated);

    expect(validated).toHaveLength(2);
    expect(validated.map((result) => result.questionIndex)).toEqual([0, 1]);
    expect(calculateScore(validated)).toBe(calculateScore(deduplicated));
    expect(calculateXp(validated, questions.length)).toBe(
      calculateXp(deduplicated, questions.length),
    );
  });

  // [BUG-STALE-OPTIONS] validateResults must drop MC results where
  // answerGiven is not in the server-known options — this is the final
  // defense layer against stale-options race results reaching the score.
  it('[BREAK/BUG-STALE-OPTIONS] drops MC vocabulary result where answerGiven is not in options', () => {
    const vocabQuestions: QuizQuestion[] = [
      {
        type: 'vocabulary',
        term: 'die Katze',
        correctAnswer: 'cat',
        acceptedAnswers: ['cat'],
        distractors: ['dog', 'fish', 'bird'],
        funFact: '',
        cefrLevel: 'A1',
        isLibraryItem: false,
      },
    ];
    // Simulates a stale-options answer: 'Bratislava' was from the previous
    // question (capitals) and got submitted against this vocabulary question.
    const staleResult: QuestionResult[] = [
      {
        questionIndex: 0,
        correct: false,
        answerGiven: 'Bratislava',
        timeMs: 500,
        answerMode: 'multiple_choice',
      },
    ];

    const validated = validateResults(vocabQuestions, staleResult);
    // The stale result must be dropped, not scored (even as wrong)
    expect(validated).toHaveLength(0);
  });

  it('[BUG-STALE-OPTIONS] does NOT drop MC result when answerGiven is a valid option', () => {
    const vocabQuestions: QuizQuestion[] = [
      {
        type: 'vocabulary',
        term: 'die Katze',
        correctAnswer: 'cat',
        acceptedAnswers: ['cat'],
        distractors: ['dog', 'fish', 'bird'],
        funFact: '',
        cefrLevel: 'A1',
        isLibraryItem: false,
      },
    ];
    const validResult: QuestionResult[] = [
      {
        questionIndex: 0,
        correct: false,
        answerGiven: 'dog',
        timeMs: 500,
        answerMode: 'multiple_choice',
      },
    ];

    const validated = validateResults(vocabQuestions, validResult);
    expect(validated).toHaveLength(1);
    expect(validated[0]?.answerGiven).toBe('dog');
    expect(validated[0]?.correct).toBe(false);
  });

  it('[BUG-STALE-OPTIONS] does NOT drop free_text result regardless of options', () => {
    const vocabQuestions: QuizQuestion[] = [
      {
        type: 'vocabulary',
        term: 'die Katze',
        correctAnswer: 'cat',
        acceptedAnswers: ['cat'],
        distractors: ['dog', 'fish', 'bird'],
        funFact: '',
        cefrLevel: 'A1',
        isLibraryItem: false,
      },
    ];
    // Free text can be any string — should never be dropped for not being in options
    const freeTextResult: QuestionResult[] = [
      {
        questionIndex: 0,
        correct: false,
        answerGiven: 'le chat',
        timeMs: 500,
        answerMode: 'free_text',
      },
    ];

    const validated = validateResults(vocabQuestions, freeTextResult);
    expect(validated).toHaveLength(1);
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
      }),
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

  it('[CR-HIGH-1] clamps cluesUsed to [0,5] — prevents negative XP from out-of-range values', () => {
    // Even if schema validation is bypassed or loosened, the XP calculation
    // must never produce negative clue bonus.
    const results: QuestionResult[] = [
      {
        questionIndex: 0,
        correct: true,
        answerGiven: 'Newton',
        timeMs: 8000,
        cluesUsed: 100 as unknown as number, // simulates bypassed validation
        answerMode: 'free_text',
      },
    ];
    // Without clamping: (5-100)*3 = -285. With clamping: (5-5)*3 = 0.
    // base: 10, timer: 0, perfect: 25 (1/1), clue bonus: 0
    expect(calculateXp(results, 1, 'guess_who')).toBe(35);
  });

  it('[CR-HIGH-1] awards maximum clue bonus when cluesUsed is 0', () => {
    const results: QuestionResult[] = [
      {
        questionIndex: 0,
        correct: true,
        answerGiven: 'Newton',
        timeMs: 8000,
        cluesUsed: 0,
        answerMode: 'free_text',
      },
    ];
    // base: 10, timer: 0, perfect: 25, clue bonus: (5-0)*3 = 15
    expect(calculateXp(results, 1, 'guess_who')).toBe(50);
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

/**
 * [CR-2026-05-19-H9] SM-2 retention scheduling MUST be driven by the
 * dedicated `last_reviewed_at` column, NOT `updated_at`.
 *
 * Background: MC-streak writes (incrementMcSuccessCount / resetMcSuccessCount)
 * touch `updated_at` on every multiple-choice answer between real reviews.
 * Previously, complete-round.ts fed `existing.updatedAt` into `applyQuizSm2`
 * as the `lastReviewedAt`, which shrank the inter-review interval and made
 * mastery items resurface sooner than the SM-2 algorithm intends.
 *
 * These are break tests: they will FAIL if the regression is reintroduced
 * (i.e. if `buildMasterySm2Input` ever returns `updatedAt` instead of the
 * real `lastReviewedAt`).
 */
describe('buildMasterySm2Input [CR-2026-05-19-H9 break test]', () => {
  const baseRow = {
    easeFactor: 2.5,
    interval: 6,
    repetitions: 2,
    nextReviewAt: new Date('2026-05-20T10:00:00Z'),
  };

  it('[BREAK] reads lastReviewedAt from the dedicated column, NOT updatedAt', () => {
    const realReviewTime = new Date('2026-04-20T10:00:00Z');
    // Simulate the bug scenario: MC-streak writes happened 1 second ago, so
    // updatedAt is "now"-ish, but the user's last REAL review was 30 days
    // ago. The retention scheduler must see the 30-day-old timestamp.
    const mcStreakDirtiedUpdatedAt = new Date('2026-05-19T23:59:59Z');

    const input = buildMasterySm2Input({
      ...baseRow,
      lastReviewedAt: realReviewTime,
      updatedAt: mcStreakDirtiedUpdatedAt,
    });

    expect(input.lastReviewedAt).toEqual(realReviewTime);
    // Explicit assertion that we did NOT pick up the dirtied timestamp.
    expect(input.lastReviewedAt).not.toEqual(mcStreakDirtiedUpdatedAt);
  });

  it('[BREAK] when updatedAt and lastReviewedAt diverge, the SM-2 input carries the real review time', () => {
    // The exact pre-fix bug: complete-round.ts read `existing.updatedAt`
    // into the SM-2 `lastReviewedAt` slot. MC-streak counter writes
    // (incrementMcSuccessCount / resetMcSuccessCount) dirty `updatedAt` on
    // every multiple-choice answer between real reviews, so the SM-2 input
    // arrived with a "just now" lastReviewedAt instead of the real (older)
    // review time. This test pins the field mapping.
    const realReviewTime = new Date('2026-04-20T10:00:00Z');
    const mcStreakDirtiedUpdatedAt = new Date('2026-05-19T23:59:59Z');

    const input = buildMasterySm2Input({
      ...baseRow,
      lastReviewedAt: realReviewTime,
      updatedAt: mcStreakDirtiedUpdatedAt,
    });

    // The SM-2 input must reflect the real review time, not the
    // MC-dirtied updatedAt. If buildMasterySm2Input ever reverts to reading
    // `updatedAt`, this assertion fails immediately — applyQuizSm2 is then
    // free to use the real timestamp (current sm2() doesn't, but the
    // contract is preserved so future algorithm changes get correct input).
    expect(input.lastReviewedAt.getTime()).toBe(realReviewTime.getTime());
    expect(input.lastReviewedAt.getTime()).toBeLessThan(
      mcStreakDirtiedUpdatedAt.getTime(),
    );
  });

  it('passes through SM-2 state fields unchanged', () => {
    const input = buildMasterySm2Input({
      easeFactor: 2.3,
      interval: 14,
      repetitions: 4,
      lastReviewedAt: new Date('2026-04-01T10:00:00Z'),
      nextReviewAt: new Date('2026-04-15T10:00:00Z'),
      updatedAt: new Date('2026-05-01T10:00:00Z'),
    });

    expect(input.easeFactor).toBe(2.3);
    expect(input.interval).toBe(14);
    expect(input.repetitions).toBe(4);
    expect(input.nextReviewAt).toEqual(new Date('2026-04-15T10:00:00Z'));
  });
});

// [CR-2026-05-19-M1] Break test — mastery upsert failure must escalate to Sentry.
// Uses jest.spyOn on createScopedRepository (avoiding jest.mock of @eduagent/database)
// so the real module loads but the repo is controlled per-test.
describe('completeQuizRound mastery upsert Sentry escalation [CR-2026-05-19-M1]', () => {
  const PROFILE_ID = TEST_PROFILE_ID;
  const ROUND_ID = '00000000-0000-4000-8000-000000000002';

  const capitalsQuestion: CapitalsQuestion = {
    type: 'capitals',
    isLibraryItem: false,
    country: 'France',
    correctAnswer: 'Paris',
    acceptedAliases: ['Paris'],
    distractors: ['Lyon', 'Nice', 'Bordeaux'],
    funFact: 'Paris is on the Seine river.',
  };

  const mockRound = {
    id: ROUND_ID,
    profileId: PROFILE_ID,
    status: 'active' as const,
    activityType: 'capitals' as const,
    total: 1,
    questions: [capitalsQuestion],
    libraryQuestionIndices: [],
    subjectId: null,
    score: null,
    xpEarned: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    // [WI-89] completeQuizRound scores from the persisted /check attempts in
    // `round.results`, not from the `results` param. Seed the recorded final
    // attempt so validatedResults is non-empty and the mastery upsert path
    // (the subject of this escalation test) is actually exercised.
    results: [
      {
        questionIndex: 0,
        correct: true,
        answerGiven: 'Paris',
        timeMs: 2000,
        finalAttempt: true,
      },
    ],
    metadata: null,
  };

  // Build a minimal repo spy that drives just the mastery upsert path.
  function makeRepoSpy(upsertImpl: () => Promise<unknown>) {
    return {
      quizRounds: {
        findById: jest.fn().mockResolvedValue(mockRound),
        // [BUG-851] completeQuizRound now uses findByIdForUpdate to row-lock
        // the round inside the transaction. Stub returns the same mockRound.
        findByIdForUpdate: jest.fn().mockResolvedValue(mockRound),
        completeActive: jest.fn().mockResolvedValue(true),
        findRecentByActivity: jest.fn().mockResolvedValue([]),
        findRecentCompletedByActivity: jest.fn().mockResolvedValue([]),
      },
      quizMasteryItems: {
        findByKey: jest.fn().mockResolvedValue(null),
        upsertFromCorrectAnswer: jest.fn().mockImplementation(upsertImpl),
        updateSm2: jest.fn().mockResolvedValue(undefined),
        findDueForProfile: jest.fn().mockResolvedValue([]),
        incrementMcSuccessCount: jest.fn().mockResolvedValue(undefined),
        resetMcSuccessCount: jest.fn().mockResolvedValue(undefined),
      },
      missedQuizItems: {
        upsertMissedItems: jest.fn().mockResolvedValue(undefined),
        softDeleteResolvedItems: jest.fn().mockResolvedValue(undefined),
      },
      profiles: { findById: jest.fn().mockResolvedValue(null) },
      subjects: { findById: jest.fn().mockResolvedValue(null) },
      xpLedger: { insert: jest.fn().mockResolvedValue(undefined) },
      vocabulary: {
        findById: jest.fn().mockResolvedValue(null),
        findByKey: jest.fn().mockResolvedValue(null),
      },
      vocabularyReviews: { upsert: jest.fn().mockResolvedValue(undefined) },
    };
  }

  // Make a fake Database where transaction() calls fn with itself (the repo spy
  // is injected via the createScopedRepository spy below).
  function makeMockDb(): Database {
    const self: Database = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(self),
      ),
    } as unknown as Database;
    return self;
  }

  let createScopedRepoSpy: jest.SpyInstance;

  afterEach(() => {
    mockCaptureException.mockClear();
    mockQueueCelebration.mockClear();
    createScopedRepoSpy?.mockRestore();
  });

  it('[BREAK] captureException fires with surface=quiz.mastery_upsert when upsertFromCorrectAnswer throws', async () => {
    const upsertError = new Error('DB connection lost during upsert');
    const repoSpy = makeRepoSpy(() => Promise.reject(upsertError));
    createScopedRepoSpy = jest
      .spyOn(database, 'createScopedRepository')
      .mockReturnValue(
        repoSpy as unknown as ReturnType<
          typeof database.createScopedRepository
        >,
      );

    const results: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 2000 },
    ];

    // Must not throw — catch block swallows the error, logs + captures it
    await expect(
      completeQuizRound(makeMockDb(), PROFILE_ID, ROUND_ID, results),
    ).resolves.toBeDefined();

    expect(mockCaptureException).toHaveBeenCalledWith(
      upsertError,
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'quiz.mastery_upsert',
          roundId: ROUND_ID,
          profileId: PROFILE_ID,
        }),
      }),
    );
  });

  it('[NEGATIVE] captureException does NOT fire on successful upsert', async () => {
    const repoSpy = makeRepoSpy(() => Promise.resolve({ id: 'mastery-1' }));
    createScopedRepoSpy = jest
      .spyOn(database, 'createScopedRepository')
      .mockReturnValue(
        repoSpy as unknown as ReturnType<
          typeof database.createScopedRepository
        >,
      );

    const results: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 2000 },
    ];

    await expect(
      completeQuizRound(makeMockDb(), PROFILE_ID, ROUND_ID, results),
    ).resolves.toBeDefined();

    expect(mockCaptureException).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extra: expect.objectContaining({ surface: 'quiz.mastery_upsert' }),
      }),
    );
  });

  it('queues a home-surface celebration for a completed quiz round', async () => {
    mockQueueCelebration.mockResolvedValue([]);
    const repoSpy = makeRepoSpy(() => Promise.resolve({ id: 'mastery-1' }));
    createScopedRepoSpy = jest
      .spyOn(database, 'createScopedRepository')
      .mockReturnValue(
        repoSpy as unknown as ReturnType<
          typeof database.createScopedRepository
        >,
      );

    await completeQuizRound(makeMockDb(), PROFILE_ID, ROUND_ID, [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 2000 },
    ]);

    expect(mockQueueCelebration).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      'comet',
      'comet',
      ROUND_ID,
    );
  });
});

// [BUG-852] checkQuizAnswerWithCorrect must bound unbounded duplicate appends
// per questionIndex. A client could otherwise call /check hundreds of times for
// one question — growing the row, or sending finalAttempt:false repeatedly then
// a finalAttempt:true with cluesUsed:0 to claim full XP. The guard:
//   (a) once a FINAL attempt is recorded for a questionIndex, any further /check
//       for that index is IDEMPOTENT — it returns post-submission feedback
//       WITHOUT appending a new attempt (covers always-final capitals/vocab
//       second submission AND guess_who post-finalization). This bounds row
//       growth while preserving the first-attempt-wins [BREAK/WI-163] contract
//       (the re-check returns 200 and cannot retro-score);
//   (b) probe (non-final) attempts per question are capped; the (cap+1)th throws
//       ConflictError.
describe('checkQuizAnswerWithCorrect [BUG-852] duplicate-append abuse guard', () => {
  const PROFILE_ID = TEST_PROFILE_ID_2;
  const ROUND_ID = '00000000-0000-4000-8000-000000000011';

  const capitalsQuestion: CapitalsQuestion = {
    type: 'capitals',
    isLibraryItem: false,
    country: 'France',
    correctAnswer: 'Paris',
    acceptedAliases: ['Paris'],
    distractors: ['Lyon', 'Nice', 'Bordeaux'],
    funFact: '',
  };

  const guessWhoQuestion: GuessWhoQuestion = {
    type: 'guess_who',
    canonicalName: 'Isaac Newton',
    correctAnswer: 'Isaac Newton',
    acceptedAliases: ['Newton'],
    clues: ['C1', 'C2', 'C3', 'C4', 'C5'],
    mcFallbackOptions: ['Isaac Newton', 'Einstein', 'Tesla', 'Curie'],
    funFact: '',
    isLibraryItem: false,
  };

  function makeRound(
    questions: QuizQuestion[],
    results: unknown[],
  ): Record<string, unknown> {
    return {
      id: ROUND_ID,
      profileId: PROFILE_ID,
      status: 'active' as const,
      activityType: 'capitals' as const,
      total: questions.length,
      questions,
      libraryQuestionIndices: [],
      subjectId: null,
      score: null,
      xpEarned: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      results,
      metadata: null,
    };
  }

  // Fake DB whose update().set().where().returning() resolves to one row, so a
  // genuine first/valid append path succeeds. The Conflict guard short-circuits
  // before reaching update(), so these tests do not depend on the SQL builder.
  function makeUpdateDb(): Database {
    const chain = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: ROUND_ID }]),
    };
    return {
      update: jest.fn().mockReturnValue(chain),
    } as unknown as Database;
  }

  function spyRepo(round: Record<string, unknown>): jest.SpyInstance {
    const repo = {
      quizRounds: { findById: jest.fn().mockResolvedValue(round) },
    };
    return jest
      .spyOn(database, 'createScopedRepository')
      .mockReturnValue(
        repo as unknown as ReturnType<typeof database.createScopedRepository>,
      );
  }

  let repoSpy: jest.SpyInstance | undefined;

  afterEach(() => {
    repoSpy?.mockRestore();
    repoSpy = undefined;
  });

  it('[BREAK/a] is idempotent for a second /check on an already-final capitals index — returns feedback WITHOUT appending', async () => {
    const round = makeRound(
      [capitalsQuestion],
      [
        {
          questionIndex: 0,
          correct: true,
          answerGiven: 'Paris',
          timeMs: 1000,
          checkedAt: new Date().toISOString(),
          finalAttempt: true,
        },
      ],
    );
    repoSpy = spyRepo(round);
    const db = makeUpdateDb();

    const result = await checkQuizAnswerWithCorrect(
      db,
      PROFILE_ID,
      ROUND_ID,
      0,
      'Lyon',
      'multiple_choice',
    );

    // First-attempt-wins: the re-check is not recorded — no jsonb append, so the
    // row cannot be grown by replaying /check on a finalized question.
    expect(db.update as unknown as jest.Mock).not.toHaveBeenCalled();
    // ...but the caller still gets honest post-submission feedback.
    expect(result).toEqual({ correct: false, correctAnswer: 'Paris' });
  });

  it('[BREAK/a] is idempotent for a /check on an already-finalized guess_who index — a cluesUsed:0 replay is NOT appended', async () => {
    const round = makeRound(
      [guessWhoQuestion],
      [
        {
          questionIndex: 0,
          correct: false,
          answerGiven: 'wrong',
          timeMs: 1000,
          checkedAt: new Date().toISOString(),
          finalAttempt: true,
          cluesUsed: 5,
        },
      ],
    );
    round.activityType = 'guess_who';
    repoSpy = spyRepo(round);
    const db = makeUpdateDb();

    const result = await checkQuizAnswerWithCorrect(
      db,
      PROFILE_ID,
      ROUND_ID,
      0,
      'Isaac Newton',
      'free_text',
      true,
      0,
    );

    // The cluesUsed:0 "full XP" replay is never recorded — first-attempt-wins
    // keeps the original finalAttempt (cluesUsed:5, wrong) authoritative.
    expect(db.update as unknown as jest.Mock).not.toHaveBeenCalled();
    expect(result).toEqual({ correct: true });
  });

  it('[BREAK/b] rejects probe (non-final) attempts beyond the per-question cap', async () => {
    // Seed cap probe (finalAttempt:false) attempts already recorded.
    const probes = Array.from(
      { length: QUIZ_CONFIG.maxProbeAttemptsPerQuestion },
      (_, i) => ({
        questionIndex: 0,
        correct: false,
        answerGiven: `guess-${i}`,
        timeMs: 1000,
        checkedAt: new Date().toISOString(),
        finalAttempt: false,
        cluesUsed: 1,
      }),
    );
    const round = makeRound([guessWhoQuestion], probes);
    round.activityType = 'guess_who';
    repoSpy = spyRepo(round);

    // The (cap+1)th probe must be rejected.
    await expect(
      checkQuizAnswerWithCorrect(
        makeUpdateDb(),
        PROFILE_ID,
        ROUND_ID,
        0,
        'still-wrong',
        'free_text',
        false,
        2,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('[NEGATIVE] allows the first probe attempt for a question (no prior results)', async () => {
    const round = makeRound([guessWhoQuestion], []);
    round.activityType = 'guess_who';
    repoSpy = spyRepo(round);

    await expect(
      checkQuizAnswerWithCorrect(
        makeUpdateDb(),
        PROFILE_ID,
        ROUND_ID,
        0,
        'wrong-guess',
        'free_text',
        false,
        1,
      ),
    ).resolves.toEqual({ correct: false });
  });

  it('[NEGATIVE] allows a probe attempt for one index when a DIFFERENT index is already final', async () => {
    const round = makeRound(
      [capitalsQuestion, guessWhoQuestion],
      [
        {
          questionIndex: 0,
          correct: true,
          answerGiven: 'Paris',
          timeMs: 1000,
          checkedAt: new Date().toISOString(),
          finalAttempt: true,
        },
      ],
    );
    round.activityType = 'guess_who';
    repoSpy = spyRepo(round);

    await expect(
      checkQuizAnswerWithCorrect(
        makeUpdateDb(),
        PROFILE_ID,
        ROUND_ID,
        1,
        'wrong-guess',
        'free_text',
        false,
        1,
      ),
    ).resolves.toEqual({ correct: false });
  });
});

// [BUG-854] completeQuizRound must reject with ConflictError (409) when the
// client calls /complete without any prior /check calls, instead of silently
// completing the round with score=0.
describe('completeQuizRound empty recordedResults guard [BUG-854]', () => {
  const PROFILE_ID = TEST_PROFILE_ID_3;
  const ROUND_ID = '00000000-0000-4000-8000-000000000012';

  const capitalsQuestion: CapitalsQuestion = {
    type: 'capitals',
    isLibraryItem: false,
    country: 'France',
    correctAnswer: 'Paris',
    acceptedAliases: ['Paris'],
    distractors: ['Lyon', 'Nice', 'Bordeaux'],
    funFact: 'Paris is on the Seine river.',
  };

  // Round with no recorded /check results — the bug scenario.
  const mockRoundNoResults = {
    id: ROUND_ID,
    profileId: PROFILE_ID,
    status: 'active' as const,
    activityType: 'capitals' as const,
    total: 1,
    questions: [capitalsQuestion],
    libraryQuestionIndices: [],
    subjectId: null,
    score: null,
    xpEarned: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    // Simulates a client that skipped /check entirely — results is an empty
    // array, so the server has no recorded attempts to score from.
    results: [],
    metadata: null,
  };

  function makeMockDb(): Database {
    const self: Database = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(self),
      ),
    } as unknown as Database;
    return self;
  }

  let createScopedRepoSpy: jest.SpyInstance;

  afterEach(() => {
    createScopedRepoSpy?.mockRestore();
  });

  it('[BREAK/BUG-854] throws ConflictError when client calls /complete without any prior /check calls', async () => {
    // Build a minimal repo spy that returns an empty-results round.
    const repoSpy = {
      quizRounds: {
        findById: jest.fn().mockResolvedValue(mockRoundNoResults),
        findByIdForUpdate: jest.fn().mockResolvedValue(mockRoundNoResults),
        completeActive: jest.fn().mockResolvedValue(true),
        findRecentByActivity: jest.fn().mockResolvedValue([]),
        findRecentCompletedByActivity: jest.fn().mockResolvedValue([]),
      },
      quizMasteryItems: {
        findByKey: jest.fn().mockResolvedValue(null),
        upsertFromCorrectAnswer: jest.fn().mockResolvedValue(null),
        updateSm2: jest.fn().mockResolvedValue(undefined),
        findDueForProfile: jest.fn().mockResolvedValue([]),
        incrementMcSuccessCount: jest.fn().mockResolvedValue(undefined),
        resetMcSuccessCount: jest.fn().mockResolvedValue(undefined),
      },
      missedQuizItems: {
        upsertMissedItems: jest.fn().mockResolvedValue(undefined),
        softDeleteResolvedItems: jest.fn().mockResolvedValue(undefined),
      },
      profiles: { findById: jest.fn().mockResolvedValue(null) },
      subjects: { findById: jest.fn().mockResolvedValue(null) },
      xpLedger: { insert: jest.fn().mockResolvedValue(undefined) },
      vocabulary: {
        findById: jest.fn().mockResolvedValue(null),
        findByKey: jest.fn().mockResolvedValue(null),
      },
      vocabularyReviews: { upsert: jest.fn().mockResolvedValue(undefined) },
    };

    createScopedRepoSpy = jest
      .spyOn(database, 'createScopedRepository')
      .mockReturnValue(
        repoSpy as unknown as ReturnType<
          typeof database.createScopedRepository
        >,
      );

    // Client provides results in the /complete body, but never called /check —
    // so round.results is empty. Must reject, not silently zero-score.
    await expect(
      completeQuizRound(makeMockDb(), PROFILE_ID, ROUND_ID, [
        { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 2000 },
      ]),
    ).rejects.toThrow(ConflictError);

    // completeActive must NOT be called — the round must not be committed.
    expect(repoSpy.quizRounds.completeActive).not.toHaveBeenCalled();
  });

  it('[NEGATIVE/BUG-854] resolves normally when round has recorded /check results', async () => {
    mockQueueCelebration.mockResolvedValue([]);

    // Same round but with a recorded /check result — the happy path.
    const mockRoundWithResults = {
      ...mockRoundNoResults,
      results: [
        {
          questionIndex: 0,
          correct: true,
          answerGiven: 'Paris',
          timeMs: 2000,
          finalAttempt: true,
        },
      ],
    };

    const repoSpy = {
      quizRounds: {
        findById: jest.fn().mockResolvedValue(mockRoundWithResults),
        findByIdForUpdate: jest.fn().mockResolvedValue(mockRoundWithResults),
        completeActive: jest.fn().mockResolvedValue(true),
        findRecentByActivity: jest.fn().mockResolvedValue([]),
        findRecentCompletedByActivity: jest.fn().mockResolvedValue([]),
      },
      quizMasteryItems: {
        findByKey: jest.fn().mockResolvedValue(null),
        upsertFromCorrectAnswer: jest.fn().mockResolvedValue(null),
        updateSm2: jest.fn().mockResolvedValue(undefined),
        findDueForProfile: jest.fn().mockResolvedValue([]),
        incrementMcSuccessCount: jest.fn().mockResolvedValue(undefined),
        resetMcSuccessCount: jest.fn().mockResolvedValue(undefined),
      },
      missedQuizItems: {
        upsertMissedItems: jest.fn().mockResolvedValue(undefined),
        softDeleteResolvedItems: jest.fn().mockResolvedValue(undefined),
      },
      profiles: { findById: jest.fn().mockResolvedValue(null) },
      subjects: { findById: jest.fn().mockResolvedValue(null) },
      xpLedger: { insert: jest.fn().mockResolvedValue(undefined) },
      vocabulary: {
        findById: jest.fn().mockResolvedValue(null),
        findByKey: jest.fn().mockResolvedValue(null),
      },
      vocabularyReviews: { upsert: jest.fn().mockResolvedValue(undefined) },
    };

    createScopedRepoSpy = jest
      .spyOn(database, 'createScopedRepository')
      .mockReturnValue(
        repoSpy as unknown as ReturnType<
          typeof database.createScopedRepository
        >,
      );

    const result = await completeQuizRound(makeMockDb(), PROFILE_ID, ROUND_ID, [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 2000 },
    ]);

    // Round completes normally with the correct score.
    expect(result.score).toBe(1);
    expect(repoSpy.quizRounds.completeActive).toHaveBeenCalledTimes(1);
  });
});
