import { z } from 'zod';

// --- Shared types ---

export const dictationSentenceSchema = z.object({
  text: z.string().describe('Original sentence text with punctuation'),
  withPunctuation: z
    .string()
    .describe('Sentence with punctuation spoken as words'),
  wordCount: z.number().int().positive(),
  /** Natural phrase-boundary chunks for TTS playback (original text). */
  chunks: z.array(z.string()).optional(),
  /** Natural phrase-boundary chunks with punctuation spoken as words. */
  chunksWithPunctuation: z.array(z.string()).optional(),
});
export type DictationSentence = z.infer<typeof dictationSentenceSchema>;

export const dictationPaceSchema = z.enum(['slow', 'normal', 'fast']);
export type DictationPace = z.infer<typeof dictationPaceSchema>;

export const dictationModeSchema = z.enum(['homework', 'surprise']);
export type DictationMode = z.infer<typeof dictationModeSchema>;

// --- prepare-homework ---

export const prepareHomeworkInputSchema = z.object({
  text: z.string().min(1).max(10000),
});
export type PrepareHomeworkInput = z.infer<typeof prepareHomeworkInputSchema>;

export const prepareHomeworkOutputSchema = z.object({
  sentences: z.array(dictationSentenceSchema).min(1),
  language: z.string().min(2).max(10),
});
export type PrepareHomeworkOutput = z.infer<typeof prepareHomeworkOutputSchema>;

// --- generate ---

export const generateDictationOutputSchema = z.object({
  sentences: z.array(dictationSentenceSchema).min(1),
  title: z.string(),
  topic: z.string(),
  language: z.string().min(2).max(10),
});
export type GenerateDictationOutput = z.infer<
  typeof generateDictationOutputSchema
>;

// --- dictation review (AI vision-based grading) ---

export const dictationMistakeSchema = z.object({
  sentenceIndex: z.number().int().nonnegative(),
  original: z.string(),
  written: z.string(),
  error: z.string(),
  correction: z.string(),
  explanation: z.string(),
});
export type DictationMistake = z.infer<typeof dictationMistakeSchema>;

export const dictationReviewResultSchema = z.object({
  totalSentences: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  mistakes: z.array(dictationMistakeSchema),
});
export type DictationReviewResult = z.infer<typeof dictationReviewResultSchema>;

// --- dictation result input (for recording results) ---

export const recordDictationResultInputSchema = z.object({
  localDate: z.string().date(),
  sentenceCount: z.number().int().positive(),
  mistakeCount: z.number().int().nonnegative().nullable().optional(),
  mode: dictationModeSchema,
  reviewed: z.boolean().optional().default(false),
});
export type RecordDictationResultInput = z.infer<
  typeof recordDictationResultInputSchema
>;

// --- dictation review input (vision-based grading) ---

/** Max base64 length: ~2 MB base64 ≈ 1.5 MB raw image */
const MAX_BASE64_LENGTH = 2 * 1024 * 1024;

export const dictationReviewInputSchema = z.object({
  imageBase64: z.string().min(1).max(MAX_BASE64_LENGTH),
  imageMimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sentences: z.array(dictationSentenceSchema).min(1),
  language: z.string().min(2).max(10),
});
export type DictationReviewInput = z.infer<typeof dictationReviewInputSchema>;

// --- dictation result (for streak tracking) ---

export const dictationResultSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  date: z.string().date(),
  sentenceCount: z.number().int().positive(),
  mistakeCount: z.number().int().nonnegative().nullable(),
  mode: dictationModeSchema,
  reviewed: z.boolean(),
});
export type DictationResult = z.infer<typeof dictationResultSchema>;

// --- record dictation result response ---

export const recordDictationResultResponseSchema = z.object({
  result: dictationResultSchema,
});
export type RecordDictationResultResponse = z.infer<
  typeof recordDictationResultResponseSchema
>;

// --- dictation streak response ---

export const dictationStreakSchema = z.object({
  streak: z.number().int().nonnegative(),
  lastDate: z.string().date().nullable(),
});
export type DictationStreak = z.infer<typeof dictationStreakSchema>;
