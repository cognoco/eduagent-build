import {
  capitalsLlmOutputSchema,
  capitalsQuestionSchema,
  completeRoundInputSchema,
  generateRoundInputSchema,
  guessWhoLlmOutputSchema,
  guessWhoQuestionSchema,
  questionResultSchema,
  quizActivityTypeSchema,
  quizQuestionSchema,
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
        validQuestion
      );
    });

    it('requires exactly 3 distractors', () => {
      expect(() =>
        capitalsQuestionSchema.parse({
          ...validQuestion,
          distractors: ['Berlin', 'Madrid'],
        })
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
        validQuestion
      );
    });

    it('requires exactly 3 distractors', () => {
      expect(() =>
        vocabularyQuestionSchema.parse({
          ...validQuestion,
          distractors: ['cat', 'bird'],
        })
      ).toThrow();
    });

    it('requires at least 1 accepted answer', () => {
      expect(() =>
        vocabularyQuestionSchema.parse({
          ...validQuestion,
          acceptedAnswers: [],
        })
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
        }).type
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
        }).type
      ).toBe('vocabulary');
    });

    it('rejects unknown types', () => {
      expect(() =>
        quizQuestionSchema.parse({
          type: 'flashcard',
          question: 'test',
        })
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
        })
      ).toBeTruthy();
    });

    it('rejects negative timeMs', () => {
      expect(() =>
        questionResultSchema.parse({
          questionIndex: 0,
          correct: true,
          answerGiven: 'Paris',
          timeMs: -1,
        })
      ).toThrow();
    });
  });

  describe('generateRoundInputSchema', () => {
    it('accepts minimal input', () => {
      expect(
        generateRoundInputSchema.parse({
          activityType: 'capitals',
        })
      ).toEqual({ activityType: 'capitals' });
    });

    it('accepts optional themePreference', () => {
      expect(
        generateRoundInputSchema.parse({
          activityType: 'capitals',
          themePreference: 'Central Europe',
        })
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
        })
      ).toEqual({
        activityType: 'vocabulary',
        subjectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      });
    });

    it('rejects vocabulary input without subjectId', () => {
      expect(() =>
        generateRoundInputSchema.parse({
          activityType: 'vocabulary',
        })
      ).toThrow(/subjectId/);
    });
  });

  describe('completeRoundInputSchema', () => {
    it('requires at least one result', () => {
      expect(() => completeRoundInputSchema.parse({ results: [] })).toThrow();
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
        validGuessWho
      );
    });

    it('requires exactly 5 clues', () => {
      expect(() =>
        guessWhoQuestionSchema.parse({
          ...validGuessWho,
          clues: ['Clue 1', 'Clue 2', 'Clue 3'],
        })
      ).toThrow();
    });

    it('requires exactly 4 MC fallback options', () => {
      expect(() =>
        guessWhoQuestionSchema.parse({
          ...validGuessWho,
          mcFallbackOptions: ['A', 'B'],
        })
      ).toThrow();
    });

    it('requires at least 1 accepted alias', () => {
      expect(() =>
        guessWhoQuestionSchema.parse({
          ...validGuessWho,
          acceptedAliases: [],
        })
      ).toThrow();
    });

    it('rejects when correctAnswer does not match canonicalName', () => {
      expect(() =>
        guessWhoQuestionSchema.parse({
          ...validGuessWho,
          correctAnswer: 'Wrong Name',
        })
      ).toThrow();
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
        })
      ).toThrow();
      expect(() =>
        questionResultSchema.parse({
          questionIndex: 0,
          correct: true,
          answerGiven: 'X',
          timeMs: 1000,
          cluesUsed: 6,
        })
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
        })
      ).toThrow();
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
        })
      ).toThrow();
    });
  });
});
