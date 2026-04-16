import {
  capitalsLlmOutputSchema,
  capitalsQuestionSchema,
  completeRoundInputSchema,
  generateRoundInputSchema,
  questionResultSchema,
  quizActivityTypeSchema,
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
});
