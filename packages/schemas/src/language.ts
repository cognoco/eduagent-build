import { z } from 'zod';

export const pedagogyModeSchema = z.enum(['socratic', 'four_strands']);
export type PedagogyMode = z.infer<typeof pedagogyModeSchema>;

export const vocabTypeSchema = z.enum(['word', 'chunk']);
export type VocabType = z.infer<typeof vocabTypeSchema>;

export const cefrLevelSchema = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
export type CefrLevel = z.infer<typeof cefrLevelSchema>;

export const languageCodeSchema = z.string().min(2).max(10);
export type LanguageCode = z.infer<typeof languageCodeSchema>;

export const languageDetectionSchema = z.object({
  code: languageCodeSchema,
  pedagogyMode: pedagogyModeSchema.default('four_strands'),
  matchedName: z.string(),
  sttLocale: z.string(),
  ttsVoice: z.string(),
});
export type LanguageDetection = z.infer<typeof languageDetectionSchema>;

export const languageSetupSchema = z.object({
  nativeLanguage: z.string().min(2).max(50),
  startingLevel: cefrLevelSchema,
});
export type LanguageSetupInput = z.infer<typeof languageSetupSchema>;

export const nativeLanguageUpdateSchema = z.object({
  nativeLanguage: z.string().min(2).max(50).nullable(),
});
export type NativeLanguageUpdateInput = z.infer<
  typeof nativeLanguageUpdateSchema
>;

export const nativeLanguageResponseSchema = z.object({
  nativeLanguage: z.string().min(2).max(50).nullable(),
});
export type NativeLanguageResponse = z.infer<
  typeof nativeLanguageResponseSchema
>;

export const vocabularySchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  term: z.string().min(1).max(200),
  termNormalized: z.string().min(1).max(200),
  translation: z.string().min(1).max(500),
  type: vocabTypeSchema,
  cefrLevel: cefrLevelSchema.nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  mastered: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Vocabulary = z.infer<typeof vocabularySchema>;

export const vocabularyCreateSchema = z.object({
  term: z.string().min(1).max(200),
  translation: z.string().min(1).max(500),
  type: vocabTypeSchema.default('word'),
  cefrLevel: cefrLevelSchema.optional(),
  milestoneId: z.string().uuid().optional(),
});
export type VocabularyCreateInput = z.infer<typeof vocabularyCreateSchema>;

export const vocabularyUpdateSchema = z.object({
  translation: z.string().min(1).max(500).optional(),
  type: vocabTypeSchema.optional(),
  cefrLevel: cefrLevelSchema.nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  mastered: z.boolean().optional(),
});
export type VocabularyUpdateInput = z.infer<typeof vocabularyUpdateSchema>;

export const vocabularyReviewSchema = z.object({
  quality: z.number().int().min(0).max(5),
});
export type VocabularyReviewInput = z.infer<typeof vocabularyReviewSchema>;

export const vocabularyRetentionCardSchema = z.object({
  vocabularyId: z.string().uuid(),
  easeFactor: z.number(),
  intervalDays: z.number().int(),
  repetitions: z.number().int(),
  lastReviewedAt: z.string().datetime().nullable(),
  nextReviewAt: z.string().datetime().nullable(),
  failureCount: z.number().int(),
  consecutiveSuccesses: z.number().int(),
});
export type VocabularyRetentionCard = z.infer<
  typeof vocabularyRetentionCardSchema
>;

// ---------------------------------------------------------------------------
// Route-level vocabulary response schemas
// ---------------------------------------------------------------------------

/** GET /subjects/:subjectId/vocabulary */
export const vocabularyListResponseSchema = z.object({
  vocabulary: z.array(vocabularySchema),
});
export type VocabularyListResponse = z.infer<
  typeof vocabularyListResponseSchema
>;

/** POST /subjects/:subjectId/vocabulary */
export const vocabularyCreateResponseSchema = z.object({
  vocabulary: vocabularySchema,
});
export type VocabularyCreateResponse = z.infer<
  typeof vocabularyCreateResponseSchema
>;

/** POST /subjects/:subjectId/vocabulary/:vocabularyId/review */
export const vocabularyReviewResponseSchema = z.object({
  vocabulary: vocabularySchema,
  retention: vocabularyRetentionCardSchema,
});
export type VocabularyReviewResponse = z.infer<
  typeof vocabularyReviewResponseSchema
>;

/** DELETE /subjects/:subjectId/vocabulary/:vocabularyId */
export const vocabularyDeleteResponseSchema = z.object({
  success: z.boolean(),
});
export type VocabularyDeleteResponse = z.infer<
  typeof vocabularyDeleteResponseSchema
>;

export const languageMilestoneProgressSchema = z.object({
  milestoneId: z.string().uuid(),
  milestoneTitle: z.string(),
  currentLevel: cefrLevelSchema,
  currentSublevel: z.string(),
  wordsMastered: z.number().int().nonnegative(),
  wordsTarget: z.number().int().nonnegative(),
  chunksMastered: z.number().int().nonnegative(),
  chunksTarget: z.number().int().nonnegative(),
  milestoneProgress: z.number().min(0).max(1),
});
export type LanguageMilestoneProgress = z.infer<
  typeof languageMilestoneProgressSchema
>;

export const languageProgressSchema = z.object({
  subjectId: z.string().uuid(),
  languageCode: languageCodeSchema,
  pedagogyMode: pedagogyModeSchema,
  currentLevel: cefrLevelSchema.nullable(),
  currentSublevel: z.string().nullable(),
  currentMilestone: languageMilestoneProgressSchema.nullable(),
  nextMilestone: z
    .object({
      milestoneId: z.string().uuid(),
      milestoneTitle: z.string(),
      level: cefrLevelSchema,
      sublevel: z.string(),
    })
    .nullable(),
});
export type LanguageProgress = z.infer<typeof languageProgressSchema>;
