import { z } from 'zod';
import { isoDateField } from './common.ts';

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

export const languageSetupSchema = z
  .object({
    nativeLanguage: z.string().min(2).max(50),
    startingLevel: cefrLevelSchema,
  })
  .strict();
export type LanguageSetupInput = z.infer<typeof languageSetupSchema>;

export const nativeLanguageUpdateSchema = z
  .object({
    nativeLanguage: z.string().min(2).max(50).nullable(),
  })
  .strict();
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
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type Vocabulary = z.infer<typeof vocabularySchema>;

export const vocabularyCreateSchema = z
  .object({
    term: z.string().min(1).max(200),
    translation: z.string().min(1).max(500),
    type: vocabTypeSchema.default('word'),
    cefrLevel: cefrLevelSchema.optional(),
    milestoneId: z.string().uuid().optional(),
  })
  .strict();
export type VocabularyCreateInput = z.infer<typeof vocabularyCreateSchema>;

export const vocabularyUpdateSchema = z.object({
  translation: z.string().min(1).max(500).optional(),
  type: vocabTypeSchema.optional(),
  cefrLevel: cefrLevelSchema.nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  mastered: z.boolean().optional(),
});
export type VocabularyUpdateInput = z.infer<typeof vocabularyUpdateSchema>;

export const vocabularyReviewSchema = z
  .object({
    quality: z.number().int().min(0).max(5),
  })
  .strict();
export type VocabularyReviewInput = z.infer<typeof vocabularyReviewSchema>;

export const vocabularyRetentionCardSchema = z.object({
  vocabularyId: z.string().uuid(),
  easeFactor: z.number(),
  intervalDays: z.number().int(),
  repetitions: z.number().int(),
  lastReviewedAt: isoDateField.nullable(),
  nextReviewAt: isoDateField.nullable(),
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

// WI-1552: cross-session Four Strands next-practice pointer. Persisted on
// `subjects.next_language_practice_pointer` at session-completed time and
// read back to seed the strand choice for the following session. `strand`
// deliberately duplicates the `LanguageStrand` enum values from
// stream-fallback.ts's streamLanguageLearningActivitySchema rather than
// importing it — stream-fallback.ts imports cefrLevelSchema from this file,
// so importing back would be circular. `reason` is safe debug metadata
// (strand counts only, no learner content) — never rendered verbatim in the
// mobile UI; see docs/plans/2026-07-11-wi1552-cross-session-next-practice.md.
export const languageStrandNameSchema = z.enum([
  'meaning_input',
  'meaning_output',
  'language_focus',
  'fluency',
]);
export type LanguageStrandName = z.infer<typeof languageStrandNameSchema>;

export const languageNextPracticePointerSchema = z.object({
  strand: languageStrandNameSchema,
  reason: z.string().min(1),
  sessionStrandCounts: z.object({
    meaning_input: z.number().int().nonnegative(),
    meaning_output: z.number().int().nonnegative(),
    language_focus: z.number().int().nonnegative(),
    fluency: z.number().int().nonnegative(),
  }),
  computedAt: isoDateField,
});
export type LanguageNextPracticePointer = z.infer<
  typeof languageNextPracticePointerSchema
>;

// WI-1553: four_strands session-end learning summary — derived entirely from
// session_events at session-completed time (no LLM calls). Persisted as
// session_summaries.language_learning_summary (additive jsonb column) and
// surfaced via sessionSummarySchema.languageLearningSummary. Every field is
// nullable/empty-array so the mobile UI can positively omit unavailable data
// rather than render a negative placeholder (docs/plans/2026-07-11-wi1553-
// session-end-summary.md, AC2). Reuses languageStrandNameSchema above for
// nextRecommendationStrand — that pointer is read from the already-persisted
// subjects.next_language_practice_pointer (WI-1552), never recomputed here.
export const languageSessionSummaryWordSchema = z.object({
  term: z.string().min(1),
  type: vocabTypeSchema,
});
export type LanguageSessionSummaryWord = z.infer<
  typeof languageSessionSummaryWordSchema
>;

export const languageSessionSummarySchema = z.object({
  practicedScenario: z.string().min(1).nullable(),
  newWords: z.array(languageSessionSummaryWordSchema),
  strengthenedWords: z.array(languageSessionSummaryWordSchema),
  grammarPatterns: z.array(z.string()),
  comprehension: z
    .object({
      correct: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .nullable(),
  speakingAttempts: z.number().int().nonnegative(),
  fluency: z
    .object({
      correct: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .nullable(),
  nextRecommendationStrand: languageStrandNameSchema.nullable(),
});
export type LanguageSessionSummaryData = z.infer<
  typeof languageSessionSummarySchema
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
  nextPractice: languageNextPracticePointerSchema.nullable(),
  strandBalance: z
    .object({
      counts: z.object({
        meaning_input: z.number().int().nonnegative(),
        meaning_output: z.number().int().nonnegative(),
        language_focus: z.number().int().nonnegative(),
        fluency: z.number().int().nonnegative(),
      }),
      sessionsSampled: z.number().int().nonnegative(),
    })
    .nullable()
    .default(null),
  skillProfile: z
    .array(
      z.object({
        skill: z.enum([
          'vocabulary',
          'grammar',
          'reading',
          'listening',
          'speaking',
          'fluency',
        ]),
        progress: z.number().min(0).max(1).nullable(),
        evidenceCount: z.number().int().nonnegative(),
      }),
    )
    .nullable()
    .default(null),
});
export type LanguageProgress = z.infer<typeof languageProgressSchema>;
