import { z } from 'zod';

import { IMAGE_BASE64_MAX } from './common.ts';

// --- Shared types ---

// [WI-150 / WI-206] Payload caps for dictation review.
// Caps bound the prompt the vision LLM ultimately receives so an attacker
// who controls /dictation/review input cannot inflate token cost beyond a
// single metered request's worth. Enforced at three layers:
//   1. zod schema (per-field caps below)
//   2. route handler (total-prompt-char budget — `DICTATION_REVIEW_MAX_PROMPT_CHARS`)
//   3. service entry (defense-in-depth — same budget check before the LLM call)
export const DICTATION_REVIEW_MAX_SENTENCES = 50;
export const DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS = 500;
export const DICTATION_REVIEW_MAX_PROMPT_CHARS = 12_000;

export const dictationSentenceSchema = z.object({
  text: z
    .string()
    .max(DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS)
    .describe('Original sentence text with punctuation'),
  withPunctuation: z
    .string()
    .max(DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS)
    .describe('Sentence with punctuation spoken as words'),
  wordCount: z.number().int().positive(),
  // [F-180 / S6] Cap chunk arrays so an oversized payload is rejected 4xx
  // rather than processed. 100 chunks per sentence exceeds any realistic TTS
  // scenario. Each string is also capped at DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS
  // (500) — matching the cap on `text`/`withPunctuation` — so the chunk fields
  // cannot inflate wire size beyond a credible budget even though they don't
  // reach the LLM.
  /** Natural phrase-boundary chunks for TTS playback (original text). */
  chunks: z
    .array(z.string().max(DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS))
    .max(100)
    .optional(),
  /** Natural phrase-boundary chunks with punctuation spoken as words. */
  chunksWithPunctuation: z
    .array(z.string().max(DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS))
    .max(100)
    .optional(),
});
export type DictationSentence = z.infer<typeof dictationSentenceSchema>;

export const dictationPaceSchema = z.enum(['slow', 'normal', 'fast']);
export type DictationPace = z.infer<typeof dictationPaceSchema>;

export const dictationModeSchema = z.enum(['homework', 'surprise']);
export type DictationMode = z.infer<typeof dictationModeSchema>;

// --- prepare-homework ---

export const prepareHomeworkInputSchema = z
  .object({
    text: z.string().min(1).max(10000),
  })
  .strict();
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

export const recordDictationResultInputSchema = z
  .object({
    completionKey: z.string().uuid().optional(),
    localDate: z.string().date(),
    sentenceCount: z.number().int().positive(),
    mistakeCount: z.number().int().nonnegative().nullable().optional(),
    mode: dictationModeSchema,
    reviewed: z.boolean().optional().default(false),
    subjectId: z.string().uuid().nullish(),
    // [WI-902] Source sentence texts of the exercise, persisted so the learner
    // can review the full text in their dictation history. Optional: old
    // clients omit it (history falls back to a count summary). Capped to the
    // same per-sentence/count budget as the review path.
    sentences: z
      .array(z.string().max(DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS))
      .max(DICTATION_REVIEW_MAX_SENTENCES)
      .optional(),
  })
  .strict();
export type RecordDictationResultInput = z.infer<
  typeof recordDictationResultInputSchema
>;

// --- dictation review input (vision-based grading) ---

export const dictationReviewInputSchema = z
  .object({
    imageBase64: z.string().min(1).max(IMAGE_BASE64_MAX),
    imageMimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    sentences: z
      .array(dictationSentenceSchema)
      .min(1)
      .max(DICTATION_REVIEW_MAX_SENTENCES),
    language: z.string().min(2).max(10),
  })
  .strict();

/**
 * Returns the total number of prompt-bearing characters in the input —
 * the union of `text` and `withPunctuation` across all sentences. This is
 * the budget the route/service guard compares against
 * `DICTATION_REVIEW_MAX_PROMPT_CHARS`.
 */
export function dictationReviewPromptCharCount(input: {
  sentences: Array<{ text: string; withPunctuation: string }>;
}): number {
  return input.sentences.reduce(
    (sum, s) => sum + s.text.length + s.withPunctuation.length,
    0,
  );
}
export type DictationReviewInput = z.infer<typeof dictationReviewInputSchema>;

// --- dictation result (for streak tracking) ---

export const dictationResultSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  completionKey: z.string().uuid(),
  date: z.string().date(),
  sentenceCount: z.number().int().positive(),
  mistakeCount: z.number().int().nonnegative().nullable(),
  mode: dictationModeSchema,
  reviewed: z.boolean(),
  // [WI-902] Persisted source sentence texts. Null for rows recorded before
  // full-text persistence (or by clients that omit it).
  sentences: z.array(z.string()).nullable(),
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

// --- dictation history response ---

// [WI-902] Recent dictation sessions, newest first, each carrying its persisted
// source `sentences` (null for pre-persistence rows). Powers the mobile
// dictation-history surface so learners can review the full text of past
// exercises, not just aggregate counts.
export const dictationHistorySchema = z.object({
  entries: z.array(dictationResultSchema),
});
export type DictationHistory = z.infer<typeof dictationHistorySchema>;
