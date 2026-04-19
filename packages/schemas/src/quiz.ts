import { z } from 'zod';

export const quizActivityTypeSchema = z.enum([
  'capitals',
  'vocabulary',
  'guess_who',
]);
export type QuizActivityType = z.infer<typeof quizActivityTypeSchema>;

export const quizRoundStatusSchema = z.enum([
  'active',
  'completed',
  'abandoned',
]);
export type QuizRoundStatus = z.infer<typeof quizRoundStatusSchema>;

export const capitalsQuestionSchema = z.object({
  type: z.literal('capitals'),
  country: z.string(),
  correctAnswer: z.string(),
  acceptedAliases: z.array(z.string()).min(1),
  distractors: z.array(z.string()).length(3),
  funFact: z.string(),
  isLibraryItem: z.boolean(),
  topicId: z.string().uuid().nullable().optional(),
  freeTextEligible: z.boolean().optional(),
});
export type CapitalsQuestion = z.infer<typeof capitalsQuestionSchema>;

export const vocabularyQuestionSchema = z.object({
  type: z.literal('vocabulary'),
  term: z.string(),
  correctAnswer: z.string(),
  acceptedAnswers: z.array(z.string()).min(1),
  distractors: z.array(z.string()).length(3),
  funFact: z.string(),
  cefrLevel: z.string(),
  isLibraryItem: z.boolean(),
  vocabularyId: z.string().uuid().nullable().optional(),
  freeTextEligible: z.boolean().optional(),
});
export type VocabularyQuestion = z.infer<typeof vocabularyQuestionSchema>;

export const guessWhoQuestionSchema = z
  .object({
    type: z.literal('guess_who'),
    canonicalName: z.string(),
    correctAnswer: z.string(),
    acceptedAliases: z.array(z.string()).min(1),
    era: z.string().optional(),
    clues: z.array(z.string().max(200)).length(5),
    mcFallbackOptions: z.array(z.string()).length(4),
    funFact: z.string().max(200),
    isLibraryItem: z.boolean(),
    topicId: z.string().uuid().nullable().optional(),
  })
  .refine((question) => question.correctAnswer === question.canonicalName, {
    message: 'correctAnswer must match canonicalName',
    path: ['correctAnswer'],
  });
export type GuessWhoQuestion = z.infer<typeof guessWhoQuestionSchema>;

export const quizQuestionSchema = z.discriminatedUnion('type', [
  capitalsQuestionSchema,
  vocabularyQuestionSchema,
  guessWhoQuestionSchema,
]);
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

// ─── Client-safe question schemas ────────────────────────────────────────
// Answer fields (correctAnswer, acceptedAliases, acceptedAnswers,
// canonicalName) stripped to prevent answer leaking via network inspection.
// MC types get a pre-shuffled `options` array; guess_who keeps
// mcFallbackOptions as-is (already contains the correct answer unlabeled).

export const clientCapitalsQuestionSchema = z.object({
  type: z.literal('capitals'),
  country: z.string(),
  options: z.array(z.string()).min(2),
  funFact: z.string(),
  isLibraryItem: z.boolean(),
  topicId: z.string().uuid().nullable().optional(),
  freeTextEligible: z.boolean().optional(),
});

export const clientVocabularyQuestionSchema = z.object({
  type: z.literal('vocabulary'),
  term: z.string(),
  options: z.array(z.string()).min(2),
  funFact: z.string(),
  cefrLevel: z.string(),
  isLibraryItem: z.boolean(),
  vocabularyId: z.string().uuid().nullable().optional(),
  freeTextEligible: z.boolean().optional(),
});

export const clientGuessWhoQuestionSchema = z.object({
  type: z.literal('guess_who'),
  clues: z.array(z.string().max(200)).length(5),
  mcFallbackOptions: z.array(z.string()).length(4),
  funFact: z.string().max(200),
  isLibraryItem: z.boolean(),
  topicId: z.string().uuid().nullable().optional(),
});

export const clientQuizQuestionSchema = z.discriminatedUnion('type', [
  clientCapitalsQuestionSchema,
  clientVocabularyQuestionSchema,
  clientGuessWhoQuestionSchema,
]);
export type ClientQuizQuestion = z.infer<typeof clientQuizQuestionSchema>;

export const questionResultSchema = z.object({
  questionIndex: z.number().int().min(0),
  correct: z.boolean(),
  answerGiven: z.string(),
  timeMs: z.number().int().min(0),
  cluesUsed: z.number().int().min(0).max(5).optional(),
  answerMode: z.enum(['free_text', 'multiple_choice']).optional(),
  /** [BUG-469] User disputes the LLM's correctness judgment.
   * Persisted through to ValidatedQuestionResult in the JSONB results column
   * so disputed answers can be reviewed in analytics. */
  disputed: z.boolean().optional(),
});
export type QuestionResult = z.infer<typeof questionResultSchema>;

export const generateRoundInputSchema = z
  .object({
    activityType: quizActivityTypeSchema,
    themePreference: z
      .string()
      .max(100)
      .regex(
        /^[\p{L}\p{N} ,.'!?_-]+$/u,
        'Theme must contain only letters, numbers, spaces, and basic punctuation'
      )
      .optional(),
    subjectId: z.string().uuid().optional(),
  })
  .refine((data) => data.activityType !== 'vocabulary' || !!data.subjectId, {
    message: 'subjectId is required for vocabulary rounds',
    path: ['subjectId'],
  });
export type GenerateRoundInput = z.infer<typeof generateRoundInputSchema>;

export const completeRoundInputSchema = z.object({
  results: z.array(questionResultSchema).min(1),
});
export type CompleteRoundInput = z.infer<typeof completeRoundInputSchema>;

export const questionCheckInputSchema = z.object({
  questionIndex: z.number().int().min(0),
  answerGiven: z.string().min(1),
});
export type QuestionCheckInput = z.infer<typeof questionCheckInputSchema>;

// Client-safe round response — answer fields stripped from questions
export const quizRoundResponseSchema = z.object({
  id: z.string().uuid(),
  activityType: quizActivityTypeSchema,
  theme: z.string(),
  questions: z.array(clientQuizQuestionSchema),
  total: z.number().int().positive(),
  difficultyBump: z.boolean().optional(),
});
export type QuizRoundResponse = z.infer<typeof quizRoundResponseSchema>;

// Server-internal round response — full question data for DB/service use
export const internalQuizRoundResponseSchema = z.object({
  id: z.string().uuid(),
  activityType: quizActivityTypeSchema,
  theme: z.string(),
  questions: z.array(quizQuestionSchema),
  total: z.number().int().positive(),
});
export type InternalQuizRoundResponse = z.infer<
  typeof internalQuizRoundResponseSchema
>;

export const validatedQuestionResultSchema = z.object({
  questionIndex: z.number().int().min(0),
  correct: z.boolean(),
  correctAnswer: z.string(),
  // [F-040] The user's submitted answer — surfaced to the results screen so
  // we can render "You said: X" on missed-question cards without a second
  // round-trip. Server-authoritative: copied from validatedResults.
  // Optional for backward compat: rows stored before this field was added
  // won't have it in the JSONB column.
  answerGiven: z.string().optional(),
  // [BUG-469] Persisted dispute flag — true when the user disputed the
  // server's correctness judgment for this question. Enables analytics
  // review of disputed answers.
  disputed: z.boolean().optional(),
});
export type ValidatedQuestionResult = z.infer<
  typeof validatedQuestionResultSchema
>;

export const completeRoundResponseSchema = z.object({
  score: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  xpEarned: z.number().int().nonnegative(),
  celebrationTier: z.enum(['perfect', 'great', 'nice']),
  droppedResults: z.number().int().nonnegative().default(0),
  questionResults: z.array(validatedQuestionResultSchema),
});
export type CompleteRoundResponse = z.infer<typeof completeRoundResponseSchema>;

export const recentRoundSchema = z.object({
  id: z.string().uuid(),
  activityType: quizActivityTypeSchema,
  theme: z.string(),
  score: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  xpEarned: z.number().int().nonnegative(),
  completedAt: z.string(),
});
export type RecentRound = z.infer<typeof recentRoundSchema>;

export const quizStatsSchema = z.object({
  activityType: quizActivityTypeSchema,
  roundsPlayed: z.number().int().nonnegative(),
  bestScore: z.number().int().nonnegative().nullable(),
  bestTotal: z.number().int().positive().nullable(),
  totalXp: z.number().int().nonnegative(),
  bestConsecutive: z.number().int().nonnegative().nullable().optional(),
});
export type QuizStats = z.infer<typeof quizStatsSchema>;

export const capitalsLlmQuestionSchema = z.object({
  country: z.string(),
  correctAnswer: z.string(),
  distractors: z.array(z.string()).length(3),
  funFact: z.string(),
});

export const capitalsLlmOutputSchema = z.object({
  theme: z.string(),
  questions: z.array(capitalsLlmQuestionSchema).min(1),
});
export type CapitalsLlmOutput = z.infer<typeof capitalsLlmOutputSchema>;

export const vocabularyLlmQuestionSchema = z.object({
  term: z.string(),
  correctAnswer: z.string(),
  acceptedAnswers: z.array(z.string()).min(1),
  distractors: z.array(z.string()).length(3),
  funFact: z.string(),
  cefrLevel: z.string(),
});

export const vocabularyLlmOutputSchema = z.object({
  theme: z.string(),
  targetLanguage: z.string(),
  questions: z.array(vocabularyLlmQuestionSchema).min(1),
});
export type VocabularyLlmOutput = z.infer<typeof vocabularyLlmOutputSchema>;

export const guessWhoLlmPersonSchema = z.object({
  canonicalName: z.string(),
  acceptedAliases: z.array(z.string()).min(1),
  era: z.string().optional(),
  clues: z.array(z.string().max(200)).length(5),
  mcFallbackOptions: z.array(z.string()).length(4),
  funFact: z.string().max(200),
});
export type GuessWhoLlmPerson = z.infer<typeof guessWhoLlmPersonSchema>;

export const guessWhoLlmOutputSchema = z.object({
  theme: z.string(),
  questions: z.array(guessWhoLlmPersonSchema).min(1),
});
export type GuessWhoLlmOutput = z.infer<typeof guessWhoLlmOutputSchema>;

export const markSurfacedInputSchema = z.object({
  activityType: quizActivityTypeSchema,
});
export type MarkSurfacedInput = z.infer<typeof markSurfacedInputSchema>;
