import { z } from 'zod';

// --- Shared types ---

export const dictationSentenceSchema = z.object({
  text: z.string().describe('Original sentence text with punctuation'),
  withPunctuation: z
    .string()
    .describe('Sentence with punctuation spoken as words'),
  wordCount: z.number().int().positive(),
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
