import {
  capitalsLlmOutputSchema,
  capitalsQuestionSchema,
  completeRoundInputSchema,
  completedRoundDetailResponseSchema,
  generateRoundInputSchema,
  guessWhoLlmOutputSchema,
  guessWhoQuestionSchema,
  questionCheckInputSchema,
  questionCheckResponseSchema,
  questionResultSchema,
  quizActivityTypeSchema,
  quizQuestionSchema,
  recentRoundSchema,
  vocabularyLlmOutputSchema,
  vocabularyQuestionSchema,
} from './quiz.js';

describe('quiz schemas', () => {
  describe('quizActivityTypeSchema', () => {
    it('accepts valid activity types', () => {
      expect(quizActivityTypeSchema.parse('capitals')).toBe('capitals');
      expect(quizActivityTypeSchema.parse('vocabulary')).toBe('vocabulary');
      expect(quizActivityTypeSchema.parse('guess_who')).toBe('guess_who');
    });

    it('rejects invalid types', () => {
      expect(() => quizActivityTypeSchema.parse('flashcards')).toThrow();
    });
  });

  describe('capitalsQuestionSchema', () => {
    const validQuestion = {
      type: 'capitals' as const,
      country: 'France',
      correctAnswer: 'Paris',
      acceptedAliases: ['Paris'],
      distractors: ['Berlin', 'Madrid', 'Rome'],
      funFact: 'Paris is known as the City of Light.',
      isLibraryItem: false,
    };

    it('accepts a valid question', () => {
      expect(capitalsQuestionSchema.parse(validQuestion)).toEqual(
        validQuestion,
      );
    });

    it('requires exactly 3 distractors', () => {
      expect(() =>
        capitalsQuestionSchema.parse({
          ...validQuestion,
          distractors: ['Berlin', 'Madrid'],
        }),
      ).toThrow();
    });
  });

  describe('vocabularyQuestionSchema', () => {
    const validQuestion = {
      type: 'vocabulary' as const,
      term: 'der Hund',
      correctAnswer: 'dog',
      acceptedAnswers: ['dog', 'the dog'],
      distractors: ['cat', 'bird', 'fish'],
      funFact: 'Hund is one of the first German words many learners meet.',
      cefrLevel: 'A1',
      isLibraryItem: false,
    };

    it('accepts a valid vocabulary question', () => {
      expect(vocabularyQuestionSchema.parse(validQuestion)).toEqual(
        validQuestion,
      );
    });

    it('requires exactly 3 distractors', () => {
      expect(() =>
        vocabularyQuestionSchema.parse({
          ...validQuestion,
          distractors: ['cat', 'bird'],
        }),
      ).toThrow();
    });

    it('requires at least 1 accepted answer', () => {
      expect(() =>
        vocabularyQuestionSchema.parse({
          ...validQuestion,
          acceptedAnswers: [],
        }),
      ).toThrow();
    });
  });

  describe('quizQuestionSchema', () => {
    it('accepts capitals questions', () => {
      expect(
        quizQuestionSchema.parse({
          type: 'capitals',
          country: 'France',
          correctAnswer: 'Paris',
          acceptedAliases: ['Paris'],
          distractors: ['Berlin', 'Madrid', 'Rome'],
          funFact: 'Fact.',
          isLibraryItem: false,
        }).type,
      ).toBe('capitals');
    });

    it('accepts vocabulary questions', () => {
      expect(
        quizQuestionSchema.parse({
          type: 'vocabulary',
          term: 'der Hund',
          correctAnswer: 'dog',
          acceptedAnswers: ['dog'],
          distractors: ['cat', 'bird', 'fish'],
          funFact: 'Fact.',
          cefrLevel: 'A1',
          isLibraryItem: true,
          vocabularyId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        }).type,
      ).toBe('vocabulary');
    });

    it('rejects unknown types', () => {
      expect(() =>
        quizQuestionSchema.parse({
          type: 'flashcard',
          question: 'test',
        }),
      ).toThrow();
    });
  });

  describe('questionResultSchema', () => {
    it('accepts a valid result', () => {
      expect(
        questionResultSchema.parse({
          questionIndex: 0,
          correct: true,
          answerGiven: 'Paris',
          timeMs: 3200,
        }),
      ).toBeTruthy();
    });

    it('rejects negative timeMs', () => {
      expect(() =>
        questionResultSchema.parse({
          questionIndex: 0,
          correct: true,
          answerGiven: 'Paris',
          timeMs: -1,
        }),
      ).toThrow();
    });

    it('[F-142] rejects answerGiven exceeding 1000 chars', () => {
      expect(() =>
        questionResultSchema.parse({
          questionIndex: 0,
          correct: false,
          answerGiven: 'x'.repeat(1001),
          timeMs: 100,
        }),
      ).toThrow();
    });

    it('[F-142] accepts answerGiven at the 1000-char limit', () => {
      expect(
        questionResultSchema.parse({
          questionIndex: 0,
          correct: false,
          answerGiven: 'x'.repeat(1000),
          timeMs: 100,
        }).answerGiven,
      ).toHaveLength(1000);
    });
  });

  describe('generateRoundInputSchema', () => {
    it('accepts minimal input', () => {
      expect(
        generateRoundInputSchema.parse({
          activityType: 'capitals',
        }),
      ).toEqual({ activityType: 'capitals' });
    });

    it('accepts optional themePreference', () => {
      expect(
        generateRoundInputSchema.parse({
          activityType: 'capitals',
          themePreference: 'Central Europe',
        }),
      ).toEqual({
        activityType: 'capitals',
        themePreference: 'Central Europe',
      });
    });

    it('accepts vocabulary input with subjectId', () => {
      expect(
        generateRoundInputSchema.parse({
          activityType: 'vocabulary',
          subjectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        }),
      ).toEqual({
        activityType: 'vocabulary',
        subjectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      });
    });

    it('rejects vocabulary input without subjectId', () => {
      expect(() =>
        generateRoundInputSchema.parse({
          activityType: 'vocabulary',
        }),
      ).toThrow(/subjectId/);
    });
  });

  describe('completeRoundInputSchema', () => {
    it('requires at least one result', () => {
      expect(() => completeRoundInputSchema.parse({ results: [] })).toThrow();
    });

    it('[F-142] rejects more than 10 results', () => {
      const result = {
        questionIndex: 0,
        correct: true,
        answerGiven: 'Paris',
        timeMs: 1000,
      };
      expect(() =>
        completeRoundInputSchema.parse({
          results: Array.from({ length: 11 }, (_, i) => ({
            ...result,
            questionIndex: i,
          })),
        }),
      ).toThrow();
    });

    it('[F-142] accepts exactly 10 results', () => {
      const result = {
        correct: true,
        answerGiven: 'Paris',
        timeMs: 1000,
      };
      expect(
        completeRoundInputSchema.parse({
          results: Array.from({ length: 10 }, (_, i) => ({
            ...result,
            questionIndex: i,
          })),
        }).results,
      ).toHaveLength(10);
    });
  });

  describe('questionCheckInputSchema', () => {
    it('[BREAK/WI-163] accepts finalAttempt and cluesUsed for server-recorded checks', () => {
      expect(
        questionCheckInputSchema.parse({
          questionIndex: 0,
          answerGiven: 'Newton',
          answerMode: 'free_text',
          finalAttempt: false,
          cluesUsed: 2,
        }),
      ).toEqual({
        questionIndex: 0,
        answerGiven: 'Newton',
        answerMode: 'free_text',
        finalAttempt: false,
        cluesUsed: 2,
      });
    });

    it('[BREAK/WI-163] rejects out-of-range check cluesUsed', () => {
      expect(() =>
        questionCheckInputSchema.parse({
          questionIndex: 0,
          answerGiven: 'Newton',
          cluesUsed: 6,
        }),
      ).toThrow();
    });

    it('[F-179] rejects answerGiven exceeding 1000 chars (DoS bound on Levenshtein)', () => {
      expect(() =>
        questionCheckInputSchema.parse({
          questionIndex: 0,
          answerGiven: 'x'.repeat(1001),
        }),
      ).toThrow();
    });

    it('[F-179] accepts answerGiven at the 1000-char limit', () => {
      expect(
        questionCheckInputSchema.parse({
          questionIndex: 0,
          answerGiven: 'x'.repeat(1000),
        }).answerGiven,
      ).toHaveLength(1000);
    });
  });

  describe('questionCheckResponseSchema', () => {
    it('[WI-1624] accepts Capitals feedback with picked-city and correct-capital facts', () => {
      const response = {
        correct: false,
        correctAnswer: 'Paris',
        capitalsFeedback: {
          pickedCity: {
            city: 'Berlin',
            country: 'Germany',
            fact: 'Berlin has more bridges than Venice.',
          },
          correctCapital: {
            city: 'Paris',
            country: 'France',
            fact: 'Paris was originally a Roman city called Lutetia.',
          },
        },
      };

      expect(questionCheckResponseSchema.parse(response)).toEqual(response);
    });

    it('[WI-1624] accepts Capitals feedback that degrades to the correct-capital fact only', () => {
      const response = {
        correct: false,
        correctAnswer: 'Paris',
        capitalsFeedback: {
          pickedCity: null,
          correctCapital: {
            city: 'Paris',
            country: 'France',
            fact: 'Paris was originally a Roman city called Lutetia.',
          },
        },
      };

      expect(questionCheckResponseSchema.parse(response)).toEqual(response);
    });
  });

  describe('capitalsLlmOutputSchema', () => {
    it('accepts valid LLM output', () => {
      const output = {
        theme: 'Central European Capitals',
        questions: [
          {
            country: 'Austria',
            correctAnswer: 'Vienna',
            distractors: ['Salzburg', 'Graz', 'Innsbruck'],
            funFact: 'Vienna was the heart of the Habsburg Empire.',
          },
        ],
      };

      expect(capitalsLlmOutputSchema.parse(output)).toEqual(output);
    });
  });

  describe('vocabularyLlmOutputSchema', () => {
    it('accepts valid LLM output', () => {
      const output = {
        theme: 'German Animals',
        targetLanguage: 'German',
        questions: [
          {
            term: 'die Katze',
            correctAnswer: 'cat',
            acceptedAnswers: ['cat', 'the cat'],
            distractors: ['dog', 'bird', 'fish'],
            funFact: 'Katze comes from Latin cattus.',
            cefrLevel: 'A1',
          },
        ],
      };

      expect(vocabularyLlmOutputSchema.parse(output)).toEqual(output);
    });
  });

  describe('guessWhoQuestionSchema', () => {
    const validGuessWho = {
      type: 'guess_who' as const,
      canonicalName: 'Isaac Newton',
      correctAnswer: 'Isaac Newton',
      acceptedAliases: ['Newton', 'Sir Isaac Newton'],
      clues: ['Clue 1', 'Clue 2', 'Clue 3', 'Clue 4', 'Clue 5'],
      mcFallbackOptions: [
        'Isaac Newton',
        'Galileo Galilei',
        'Albert Einstein',
        'Nikola Tesla',
      ],
      funFact: 'Newton invented the cat flap.',
      isLibraryItem: false,
    };

    it('accepts valid guess_who question', () => {
      expect(guessWhoQuestionSchema.parse(validGuessWho)).toEqual(
        validGuessWho,
      );
    });

    it('requires exactly 5 clues', () => {
      expect(() =>
        guessWhoQuestionSchema.parse({
          ...validGuessWho,
          clues: ['Clue 1', 'Clue 2', 'Clue 3'],
        }),
      ).toThrow();
    });

    it('requires exactly 4 MC fallback options', () => {
      expect(() =>
        guessWhoQuestionSchema.parse({
          ...validGuessWho,
          mcFallbackOptions: ['A', 'B'],
        }),
      ).toThrow();
    });

    it('requires at least 1 accepted alias', () => {
      expect(() =>
        guessWhoQuestionSchema.parse({
          ...validGuessWho,
          acceptedAliases: [],
        }),
      ).toThrow();
    });

    it('rejects when correctAnswer does not match canonicalName', () => {
      expect(() =>
        guessWhoQuestionSchema.parse({
          ...validGuessWho,
          correctAnswer: 'Wrong Name',
        }),
      ).toThrow();
    });

    it('rejects canonicalName longer than 300 characters', () => {
      expect(() =>
        guessWhoQuestionSchema.parse({
          ...validGuessWho,
          canonicalName: 'a'.repeat(301),
          correctAnswer: 'a'.repeat(301),
        }),
      ).toThrow();
    });

    it('rejects an alias longer than 300 characters', () => {
      expect(() =>
        guessWhoQuestionSchema.parse({
          ...validGuessWho,
          acceptedAliases: ['a'.repeat(301)],
        }),
      ).toThrow();
    });

    it('accepts canonicalName and alias at exactly 300 characters', () => {
      const name = 'a'.repeat(300);
      expect(() =>
        guessWhoQuestionSchema.parse({
          ...validGuessWho,
          canonicalName: name,
          correctAnswer: name,
          acceptedAliases: [name],
        }),
      ).not.toThrow();
    });
  });

  describe('quizQuestionSchema (discriminated union with guess_who)', () => {
    it('accepts guess_who question via discriminated union', () => {
      const q = {
        type: 'guess_who' as const,
        canonicalName: 'Newton',
        correctAnswer: 'Newton',
        acceptedAliases: ['Newton'],
        clues: ['C1', 'C2', 'C3', 'C4', 'C5'],
        mcFallbackOptions: ['Newton', 'Einstein', 'Tesla', 'Curie'],
        funFact: 'Fact.',
        isLibraryItem: false,
      };
      expect(quizQuestionSchema.parse(q).type).toBe('guess_who');
    });
  });

  describe('questionResultSchema with Guess Who fields', () => {
    it('accepts result with cluesUsed and answerMode', () => {
      const result = {
        questionIndex: 0,
        correct: true,
        answerGiven: 'Newton',
        timeMs: 8000,
        cluesUsed: 3,
        answerMode: 'free_text' as const,
      };
      expect(questionResultSchema.parse(result)).toEqual(result);
    });

    it('accepts result without optional Guess Who fields (backward compat)', () => {
      const result = {
        questionIndex: 0,
        correct: true,
        answerGiven: 'Paris',
        timeMs: 2000,
      };
      expect(questionResultSchema.parse(result)).toEqual(result);
    });

    it('accepts cluesUsed: 0 (no clues shown)', () => {
      const result = {
        questionIndex: 0,
        correct: true,
        answerGiven: 'X',
        timeMs: 1000,
        cluesUsed: 0,
      };
      expect(questionResultSchema.parse(result)).toEqual(result);
    });

    it('rejects cluesUsed outside 0-5 range', () => {
      expect(() =>
        questionResultSchema.parse({
          questionIndex: 0,
          correct: true,
          answerGiven: 'X',
          timeMs: 1000,
          cluesUsed: -1,
        }),
      ).toThrow();
      expect(() =>
        questionResultSchema.parse({
          questionIndex: 0,
          correct: true,
          answerGiven: 'X',
          timeMs: 1000,
          cluesUsed: 6,
        }),
      ).toThrow();
    });

    it('rejects invalid answerMode', () => {
      expect(() =>
        questionResultSchema.parse({
          questionIndex: 0,
          correct: true,
          answerGiven: 'X',
          timeMs: 1000,
          answerMode: 'voice',
        }),
      ).toThrow();
    });
  });

  describe('recentRoundSchema [BUG-209] — completedAt is a strict ISO datetime', () => {
    const UUID = '550e8400-e29b-41d4-a716-446655440000';
    const base = {
      id: UUID,
      activityType: 'capitals' as const,
      theme: 'EU capitals',
      score: 8,
      total: 10,
      xpEarned: 80,
    };

    it('accepts a valid ISO datetime', () => {
      const result = recentRoundSchema.safeParse({
        ...base,
        completedAt: '2026-05-18T12:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('accepts a JS Date (Drizzle row compat)', () => {
      const result = recentRoundSchema.safeParse({
        ...base,
        completedAt: new Date('2026-05-18T12:00:00.000Z'),
      });
      expect(result.success).toBe(true);
    });

    it('REJECTS an empty string (previously accepted by bare z.string())', () => {
      const result = recentRoundSchema.safeParse({
        ...base,
        completedAt: '',
      });
      expect(result.success).toBe(false);
    });

    it('REJECTS an arbitrary non-ISO string', () => {
      const result = recentRoundSchema.safeParse({
        ...base,
        completedAt: 'sometime last week',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('completedRoundDetailResponseSchema [BUG-207] — typed results array', () => {
    const UUID = '550e8400-e29b-41d4-a716-446655440000';
    const base = {
      id: UUID,
      activityType: 'capitals' as const,
      activityLabel: 'Capitals',
      theme: 'EU capitals',
      total: 1,
      status: 'completed' as const,
      score: 1,
      xpEarned: 10,
      celebrationTier: 'perfect' as const,
      completedAt: '2026-05-18T12:00:00.000Z',
      questions: [
        {
          type: 'capitals' as const,
          country: 'France',
          options: ['Paris', 'Berlin', 'Madrid', 'Rome'],
          funFact: 'Fact',
          isLibraryItem: false,
          correctAnswer: 'Paris',
          acceptedAliases: ['Paris'],
        },
      ],
    };

    it('accepts a typed validatedQuestionResult array in results', () => {
      const result = completedRoundDetailResponseSchema.safeParse({
        ...base,
        results: [
          {
            questionIndex: 0,
            correct: true,
            correctAnswer: 'Paris',
            answerGiven: 'Paris',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('accepts an empty results array (in-progress / pre-grading)', () => {
      const result = completedRoundDetailResponseSchema.safeParse({
        ...base,
        results: [],
      });
      expect(result.success).toBe(true);
    });

    it('REJECTS arbitrary object — results must match validatedQuestionResultSchema', () => {
      const result = completedRoundDetailResponseSchema.safeParse({
        ...base,
        results: [{ totallyMadeUpField: 'nope' }],
      });
      expect(result.success).toBe(false);
    });

    it('accepts Date object on completedAt (Drizzle row compat)', () => {
      const result = completedRoundDetailResponseSchema.safeParse({
        ...base,
        completedAt: new Date('2026-05-18T12:00:00.000Z'),
        results: [],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('guessWhoLlmOutputSchema', () => {
    it('accepts valid LLM output', () => {
      const output = {
        theme: 'Scientists',
        questions: [
          {
            canonicalName: 'Isaac Newton',
            acceptedAliases: ['Newton'],
            clues: ['C1', 'C2', 'C3', 'C4', 'C5'],
            mcFallbackOptions: ['Newton', 'Einstein', 'Tesla', 'Curie'],
            funFact: 'Fact.',
          },
        ],
      };
      expect(guessWhoLlmOutputSchema.parse(output)).toEqual(output);
    });

    it('rejects empty questions array', () => {
      expect(() =>
        guessWhoLlmOutputSchema.parse({
          theme: 'X',
          questions: [],
        }),
      ).toThrow();
    });
  });
});
