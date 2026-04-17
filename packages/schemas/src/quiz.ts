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
});
export type VocabularyQuestion = z.infer<typeof vocabularyQuestionSchema>;

export const quizQuestionSchema = z.discriminatedUnion('type', [
  capitalsQuestionSchema,
  vocabularyQuestionSchema,
]);
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const questionResultSchema = z.object({
  questionIndex: z.number().int().min(0),
  correct: z.boolean(),
  answerGiven: z.string(),
  timeMs: z.number().int().min(0),
});
export type QuestionResult = z.infer<typeof questionResultSchema>;

export const generateRoundInputSchema = z
  .object({
    activityType: quizActivityTypeSchema,
    themePreference: z.string().optional(),
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

export const quizRoundResponseSchema = z.object({
  id: z.string().uuid(),
  activityType: quizActivityTypeSchema,
  theme: z.string(),
  questions: z.array(quizQuestionSchema),
  total: z.number().int().positive(),
});
export type QuizRoundResponse = z.infer<typeof quizRoundResponseSchema>;

export const completeRoundResponseSchema = z.object({
  score: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  xpEarned: z.number().int().nonnegative(),
  celebrationTier: z.enum(['perfect', 'great', 'nice']),
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
