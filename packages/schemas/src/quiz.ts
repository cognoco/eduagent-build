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
        'Theme must contain only letters, numbers, spaces, and basic punctuation',
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
  // [BUG-STALE-OPTIONS] Defense-in-depth: API uses answerMode to verify MC
  // answers are actually in question.options, catching stale-options race
  // conditions on the client before they corrupt the score.
  answerMode: z.enum(['free_text', 'multiple_choice']).optional(),
});
export type QuestionCheckInput = z.infer<typeof questionCheckInputSchema>;

// [F-Q-02/F-Q-07] Check response reveals correctAnswer on wrong submissions
// so the client can highlight the right option and show the person's name.
export const questionCheckResponseSchema = z.object({
  correct: z.boolean(),
  correctAnswer: z.string().optional(),
});
export type QuestionCheckResponse = z.infer<typeof questionCheckResponseSchema>;

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
  // Persisted from the in-progress submission so the round-detail screen
  // can dim clues the user never revealed. Optional for backward compat.
  cluesUsed: z.number().int().min(0).max(5).optional(),
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
  // [BUG-926] languageCode is populated for vocabulary rows (the language being
  // practised), and null for capitals / guess_who rows. The client uses this to
  // match a stat row to the specific language subject card.
  languageCode: z.string().nullable(),
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

// ─── Route response schemas ───────────────────────────────────────────────
// These validate the outbound JSON from quiz route handlers.

/** POST /quiz/rounds/prefetch — only exposes the round id. */
export const prefetchRoundResponseSchema = z.object({
  id: z.string().uuid(),
});
export type PrefetchRoundResponse = z.infer<typeof prefetchRoundResponseSchema>;

/**
 * GET /quiz/rounds/recent — extends recentRoundSchema with the human-readable
 * activityLabel added by the route layer.
 */
export const recentRoundListItemSchema = recentRoundSchema.extend({
  activityLabel: z.string(),
});
export type RecentRoundListItem = z.infer<typeof recentRoundListItemSchema>;

/**
 * GET /quiz/rounds/:id (active) — client-safe question list plus activityLabel.
 * Extends quizRoundResponseSchema which already contains id, activityType,
 * theme, questions, total, and optional difficultyBump.
 */
export const activeRoundDetailResponseSchema = quizRoundResponseSchema.extend({
  activityLabel: z.string(),
});
export type ActiveRoundDetailResponse = z.infer<
  typeof activeRoundDetailResponseSchema
>;

/**
 * Questions in a completed round: client-safe base fields plus the answer
 * context that is safe to reveal after grading (correctAnswer + acceptedAliases).
 * acceptedAliases is undefined for guess_who questions.
 */
export const completedRoundQuestionSchema = z.intersection(
  clientQuizQuestionSchema,
  z.object({
    correctAnswer: z.string(),
    acceptedAliases: z.array(z.string()).optional(),
  }),
);
export type CompletedRoundQuestion = z.infer<
  typeof completedRoundQuestionSchema
>;

/**
 * GET /quiz/rounds/:id (completed) — extends the shared base with grading
 * context (score, results, celebrationTier) and overrides `questions` with the
 * post-grading shape that reveals correct answers.
 */
export const completedRoundDetailResponseSchema = quizRoundResponseSchema
  .omit({ difficultyBump: true, questions: true })
  .extend({
    activityLabel: z.string(),
    status: quizRoundStatusSchema,
    score: z.number().int().nonnegative().nullable(),
    xpEarned: z.number().int().nonnegative().nullable(),
    celebrationTier: z.enum(['perfect', 'great', 'nice']),
    completedAt: z.string().optional(),
    questions: z.array(completedRoundQuestionSchema),
    results: z.unknown(),
  });
export type CompletedRoundDetailResponse = z.infer<
  typeof completedRoundDetailResponseSchema
>;

/** POST /quiz/missed-items/mark-surfaced */
export const markSurfacedResponseSchema = z.object({
  markedCount: z.number().int().nonnegative(),
});
export type MarkSurfacedResponse = z.infer<typeof markSurfacedResponseSchema>;

/** GET /quiz/stats — array of per-activity round stats. */
export const quizStatsListResponseSchema = z.array(quizStatsSchema);
export type QuizStatsListResponse = z.infer<typeof quizStatsListResponseSchema>;
