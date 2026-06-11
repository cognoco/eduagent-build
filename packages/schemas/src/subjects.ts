import { z } from 'zod';
import { isoDateField } from './common.ts';
import {
  cefrLevelSchema,
  languageCodeSchema,
  pedagogyModeSchema,
} from './language.ts';

// Enums

export const subjectStatusSchema = z.enum(['active', 'paused', 'archived']);
export type SubjectStatus = z.infer<typeof subjectStatusSchema>;

export const subjectCurriculumStatusSchema = z.enum(['ready', 'preparing']);
export type SubjectCurriculumStatus = z.infer<
  typeof subjectCurriculumStatusSchema
>;

export const topicRelevanceSchema = z.enum([
  'core',
  'recommended',
  'contemporary',
  'emerging',
]);
export type TopicRelevance = z.infer<typeof topicRelevanceSchema>;

export const curriculumTopicSourceSchema = z.enum([
  'generated',
  'user',
  'parent_bridge',
]);
export type CurriculumTopicSource = z.infer<typeof curriculumTopicSourceSchema>;

// Subject schemas

export const subjectCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    rawInput: z.string().trim().min(1).max(200).optional(),
    focus: z.string().trim().min(1).max(200).optional(),
    focusDescription: z.string().trim().min(1).max(500).optional(),
    pedagogyMode: pedagogyModeSchema.optional(),
    languageCode: languageCodeSchema.optional(),
  })
  .strict();
export type SubjectCreateInput = z.infer<typeof subjectCreateSchema>;

export const subjectUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    status: subjectStatusSchema.optional(),
    pedagogyMode: pedagogyModeSchema.optional(),
    languageCode: languageCodeSchema.nullable().optional(),
  })
  .strict();
export type SubjectUpdateInput = z.infer<typeof subjectUpdateSchema>;

export const subjectIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type SubjectIdParam = z.infer<typeof subjectIdParamSchema>;

export const subjectSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  name: z.string(),
  rawInput: z.string().nullable().optional(),
  status: subjectStatusSchema,
  curriculumStatus: subjectCurriculumStatusSchema.optional(),
  pedagogyMode: pedagogyModeSchema,
  languageCode: languageCodeSchema.nullable().optional(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
  urgencyBoostUntil: z.union([isoDateField, z.null()]).optional(),
  urgencyBoostReason: z.string().nullable().optional(),
});
export type Subject = z.infer<typeof subjectSchema>;

// Subject name resolution — validate/resolve user input before creating subject

export const subjectResolveInputSchema = z
  .object({
    rawInput: z.string().min(1).max(200),
  })
  .strict();
export type SubjectResolveInput = z.infer<typeof subjectResolveInputSchema>;

export const subjectResolveStatusSchema = z.enum([
  'direct_match',
  'corrected',
  'resolved',
  'ambiguous',
  'no_match',
]);
export type SubjectResolveStatus = z.infer<typeof subjectResolveStatusSchema>;

export const subjectStructureTypeSchema = z.enum([
  'broad',
  'narrow',
  'focused_book',
]);
export type SubjectStructureType = z.infer<typeof subjectStructureTypeSchema>;

export const subjectSuggestionSchema = z.object({
  name: z.string(),
  description: z.string(),
  focus: z.string().optional(),
});
export type SubjectSuggestion = z.infer<typeof subjectSuggestionSchema>;

export const subjectResolveResultSchema = z.object({
  status: subjectResolveStatusSchema,
  resolvedName: z.string().nullable(),
  focus: z.string().nullable().optional(),
  focusDescription: z.string().nullable().optional(),
  suggestions: z.array(subjectSuggestionSchema),
  displayMessage: z.string(),
  isLanguageLearning: z.boolean().optional(),
  detectedLanguageCode: languageCodeSchema.nullable().optional(),
  detectedLanguageName: z.string().nullable().optional(),
});
export type SubjectResolveResult = z.infer<typeof subjectResolveResultSchema>;

// Curriculum schemas

export const curriculumTopicSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  sortOrder: z.number().int(),
  relevance: topicRelevanceSchema,
  estimatedMinutes: z.number().int().min(5).max(240),
  bookId: z.string().uuid(),
  chapter: z.string().nullable().optional(),
  skipped: z.boolean(),
  source: curriculumTopicSourceSchema.optional(),
  cefrLevel: cefrLevelSchema.nullable().optional(),
  cefrSublevel: z.string().nullable().optional(),
  targetWordCount: z.number().int().nullable().optional(),
  targetChunkCount: z.number().int().nullable().optional(),
  sourceChildProfileId: z.string().uuid().nullable().optional(),
  createdAt: isoDateField.optional(),
});
export type CurriculumTopic = z.infer<typeof curriculumTopicSchema>;

export const curriculumSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  version: z.number().int(),
  topics: z.array(curriculumTopicSchema),
  generatedAt: isoDateField,
});
export type Curriculum = z.infer<typeof curriculumSchema>;

export const bookProgressStatusSchema = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'REVIEW_DUE',
]);
export type BookProgressStatus = z.infer<typeof bookProgressStatusSchema>;

export const curriculumBookSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  sortOrder: z.number().int(),
  topicsGenerated: z.boolean(),
  status: bookProgressStatusSchema.optional(),
  topicCount: z.number().int().optional(),
  completedTopicCount: z.number().int().optional(),
  masteredTopicCount: z.number().int().optional(),
  masteredAt: isoDateField.nullable().optional(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type CurriculumBook = z.infer<typeof curriculumBookSchema>;

export const topicConnectionSchema = z.object({
  id: z.string().uuid(),
  topicAId: z.string().uuid(),
  topicBId: z.string().uuid(),
});
export type TopicConnection = z.infer<typeof topicConnectionSchema>;

export const bookWithTopicsSchema = z.object({
  book: curriculumBookSchema,
  topics: z.array(curriculumTopicSchema),
  connections: z.array(topicConnectionSchema),
  status: bookProgressStatusSchema,
  completedTopicCount: z.number().int().optional(),
  masteredTopicCount: z.number().int().optional(),
  masteredAt: isoDateField.nullable().optional(),
  completedTopicIds: z.array(z.string().uuid()).optional(),
});
export type BookWithTopics = z.infer<typeof bookWithTopicsSchema>;

export type IncompleteBookGenerationClaimRepairResult =
  | { status: 'not_incomplete' }
  | { status: 'in_progress' }
  | { status: 'repaired'; book: BookWithTopics };

// Curriculum generation input — used by the LLM curriculum generator

export const curriculumInputSchema = z.object({
  subjectName: z.string(),
  interviewSummary: z.string(),
  goals: z.array(z.string()),
  experienceLevel: z.string(),
});
export type CurriculumInput = z.infer<typeof curriculumInputSchema>;

// Generated topic — LLM-generated topic before persistence

const UNSOURCED_PRECISE_FACT_PATTERN =
  /\b(?:1[0-9]{3}|20[0-9]{2})s?\b|\b\d+(?:\.\d+)?\s?%/;

const generatedSourceNeutralDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !UNSOURCED_PRECISE_FACT_PATTERN.test(value), {
    message:
      'Generated curriculum descriptions must not contain precise unsourced dates, years, or statistics.',
  });

export const generatedTopicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: generatedSourceNeutralDescriptionSchema,
  relevance: topicRelevanceSchema,
  estimatedMinutes: z.number().int().min(5).max(240),
  cefrLevel: cefrLevelSchema.optional(),
  cefrSublevel: z.string().optional(),
  targetWordCount: z.number().int().optional(),
  targetChunkCount: z.number().int().optional(),
});
export type GeneratedTopic = z.infer<typeof generatedTopicSchema>;

export const generatedBookSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: generatedSourceNeutralDescriptionSchema,
  emoji: z.string().trim().min(1),
  sortOrder: z.number().int(),
});
export type GeneratedBook = z.infer<typeof generatedBookSchema>;

export const generatedBookTopicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: generatedSourceNeutralDescriptionSchema,
  chapter: z.string().trim().min(1).max(200),
  sortOrder: z.number().int(),
  estimatedMinutes: z.number().int().min(5).max(240),
});
export type GeneratedBookTopic = z.infer<typeof generatedBookTopicSchema>;

export const generatedConnectionSchema = z.object({
  topicA: z.string().trim().min(1).max(200),
  topicB: z.string().trim().min(1).max(200),
});
export type GeneratedConnection = z.infer<typeof generatedConnectionSchema>;

export const MIN_GENERATED_SUBJECT_BOOKS = 5;
export const MAX_GENERATED_SUBJECT_BOOKS = 20;
export const MIN_GENERATED_SUBJECT_TOPICS = 8;
export const MAX_GENERATED_SUBJECT_TOPICS = 15;

// Canonical topic-title normalizer. Used both here (generation-schema dedup)
// and by the API persistence/dedup path (re-exported as `normalizeTopicTitle`
// from services/curriculum.ts). Collapses internal whitespace so "A  B" and
// "A B" dedupe identically across both paths.
export const normalizeGeneratedTopicTitle = (title: string): string =>
  title.trim().toLowerCase().replace(/\s+/g, ' ');

export const bookGenerationResultSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('broad'),
      books: z
        .array(generatedBookSchema)
        .min(MIN_GENERATED_SUBJECT_BOOKS)
        .max(MAX_GENERATED_SUBJECT_BOOKS),
    }),
    z.object({
      type: z.literal('narrow'),
      topics: z
        .array(generatedTopicSchema)
        .min(MIN_GENERATED_SUBJECT_TOPICS)
        .max(MAX_GENERATED_SUBJECT_TOPICS),
    }),
  ])
  .superRefine((value, ctx) => {
    // Siblings must have distinct titles. Mirrors the distinct-title check on
    // bookTopicGenerationResultSchema, one level up (books/topics under a
    // subject). The orphan case — an item that restates the SUBJECT name — is
    // not checkable here because the schema does not know the subject name; it
    // is enforced deterministically in the persistence layer (subject.ts /
    // persistNarrowTopics) via stripOrphanTitles.
    const key = value.type === 'broad' ? 'books' : 'topics';
    const items = value.type === 'broad' ? value.books : value.topics;
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const title = normalizeGeneratedTopicTitle(item.title);
      if (seen.has(title)) {
        ctx.addIssue({
          code: 'custom',
          path: [key, index, 'title'],
          message: `Generated subject ${key} need distinct titles.`,
        });
      }
      seen.add(title);
    });
  });
export type BookGenerationResult = z.infer<typeof bookGenerationResultSchema>;

export const MIN_GENERATED_BOOK_TOPICS = 5;
export const MAX_GENERATED_BOOK_TOPICS = 15;
export const MIN_GENERATED_BOOK_CHAPTERS = 2;

export const bookTopicGenerationResultSchema = z
  .object({
    topics: z
      .array(generatedBookTopicSchema)
      .min(MIN_GENERATED_BOOK_TOPICS)
      .max(MAX_GENERATED_BOOK_TOPICS),
    connections: z.array(generatedConnectionSchema),
  })
  .superRefine((value, ctx) => {
    const chapterCount = new Set(
      value.topics.map((topic) => topic.chapter.trim().toLowerCase()),
    ).size;
    const topicTitles = new Set<string>();
    const sortOrders = new Set<number>();
    const connectionKeys = new Set<string>();

    value.topics.forEach((topic, index) => {
      const title = normalizeGeneratedTopicTitle(topic.title);
      if (topicTitles.has(title)) {
        ctx.addIssue({
          code: 'custom',
          path: ['topics', index, 'title'],
          message: 'Generated book topics need distinct titles.',
        });
      }
      topicTitles.add(title);

      if (sortOrders.has(topic.sortOrder)) {
        ctx.addIssue({
          code: 'custom',
          path: ['topics', index, 'sortOrder'],
          message: 'Generated book topics need distinct sortOrder values.',
        });
      }
      sortOrders.add(topic.sortOrder);
    });

    if (chapterCount < MIN_GENERATED_BOOK_CHAPTERS) {
      ctx.addIssue({
        code: 'custom',
        path: ['topics'],
        message: `Generated books need at least ${MIN_GENERATED_BOOK_CHAPTERS} chapters.`,
      });
    }

    const topicsBySortOrder = [...value.topics].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    for (let index = 1; index < value.topics.length; index += 1) {
      const previous = value.topics[index - 1];
      const current = value.topics[index];
      if (previous && current && current.sortOrder <= previous.sortOrder) {
        ctx.addIssue({
          code: 'custom',
          path: ['topics', index, 'sortOrder'],
          message:
            'Generated book topics need strictly increasing sortOrder values in array order.',
        });
      }
    }

    const chapterPositions = new Map<string, number[]>();
    topicsBySortOrder.forEach((topic, index) => {
      const chapter = normalizeGeneratedTopicTitle(topic.chapter);
      const positions = chapterPositions.get(chapter) ?? [];
      positions.push(index);
      chapterPositions.set(chapter, positions);
    });
    for (const [chapter, positions] of chapterPositions) {
      const min = Math.min(...positions);
      const max = Math.max(...positions);
      if (positions.length !== max - min + 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['topics'],
          message: `Generated chapter "${chapter}" must be contiguous in sortOrder.`,
        });
      }
    }

    value.connections.forEach((connection, index) => {
      const topicA = normalizeGeneratedTopicTitle(connection.topicA);
      const topicB = normalizeGeneratedTopicTitle(connection.topicB);

      if (!topicTitles.has(topicA)) {
        ctx.addIssue({
          code: 'custom',
          path: ['connections', index, 'topicA'],
          message: 'Connection topicA must match a generated topic title.',
        });
      }
      if (!topicTitles.has(topicB)) {
        ctx.addIssue({
          code: 'custom',
          path: ['connections', index, 'topicB'],
          message: 'Connection topicB must match a generated topic title.',
        });
      }
      if (topicA === topicB) {
        ctx.addIssue({
          code: 'custom',
          path: ['connections', index],
          message: 'Connection cannot point a topic at itself.',
        });
      }

      const key = [topicA, topicB].sort().join('::');
      if (connectionKeys.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['connections', index],
          message: 'Duplicate generated topic connection.',
        });
      }
      connectionKeys.add(key);
    });
  });
export type BookTopicGenerationResult = z.infer<
  typeof bookTopicGenerationResultSchema
>;

export const bookSuggestionCategorySchema = z.enum(['related', 'explore']);
export type BookSuggestionCategory = z.infer<
  typeof bookSuggestionCategorySchema
>;

export const bookSuggestionGenerationItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1),
  emoji: z.string().trim().min(1),
  category: bookSuggestionCategorySchema,
});
export type BookSuggestionGenerationItem = z.infer<
  typeof bookSuggestionGenerationItemSchema
>;

export const bookSuggestionGenerationResultSchema = z.object({
  suggestions: z.array(bookSuggestionGenerationItemSchema),
});
export type BookSuggestionGenerationResult = z.infer<
  typeof bookSuggestionGenerationResultSchema
>;

export const bookTopicGenerateInputSchema = z
  .object({
    priorKnowledge: z.string().max(2000).optional(),
    expandExisting: z.boolean().optional(),
  })
  .strict();
export type BookTopicGenerateInput = z.infer<
  typeof bookTopicGenerateInputSchema
>;

export const bookDeleteSchema = z
  .object({
    confirmStartedTopics: z.boolean().optional().default(false),
  })
  .strict();
export type BookDeleteInput = z.infer<typeof bookDeleteSchema>;

export const curriculumTopicPreviewSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  estimatedMinutes: z.number().int().min(5).max(240),
});
export type CurriculumTopicPreview = z.infer<
  typeof curriculumTopicPreviewSchema
>;

export const curriculumTopicAddSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('preview'),
      title: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      mode: z.literal('create'),
      title: z.string().min(1).max(200),
      description: z.string().min(1).max(500),
      estimatedMinutes: z.number().int().min(5).max(240),
    })
    .strict(),
]);
export type CurriculumTopicAddInput = z.infer<typeof curriculumTopicAddSchema>;

export const curriculumTopicAddResponseSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('preview'),
    preview: curriculumTopicPreviewSchema,
  }),
  z.object({
    mode: z.literal('create'),
    topic: curriculumTopicSchema,
  }),
]);
export type CurriculumTopicAddResponse = z.infer<
  typeof curriculumTopicAddResponseSchema
>;

export const sourceAgeBracketSchema = z.enum([
  'eleven_twelve',
  'thirteen_fifteen',
  'sixteen_plus',
]);
export type SourceAgeBracket = z.infer<typeof sourceAgeBracketSchema>;

export const childTopicSnapshotSchema = z.object({
  childProfileId: z.string().uuid(),
  childDisplayName: z.string(),
  subjectName: z.string(),
  subjectLanguage: languageCodeSchema.nullable(),
  bookTitle: z.string(),
  bookAuthor: z.string().nullable(),
  topicTitle: z.string(),
  topicDescription: z.string(),
  topicDescriptionHash: z.string(),
  estimatedMinutes: z.number().int().min(5).max(240),
  sourceAgeBracket: sourceAgeBracketSchema,
});
export type ChildTopicSnapshot = z.infer<typeof childTopicSnapshotSchema>;

export const childTopicSnapshotResponseSchema = z.object({
  snapshot: childTopicSnapshotSchema,
});
export type ChildTopicSnapshotResponse = z.infer<
  typeof childTopicSnapshotResponseSchema
>;

export const cloneFromChildRequestSchema = z
  .object({
    childProfileId: z.string().uuid(),
    topicId: z.string().uuid(),
    forceCopy: z.boolean().optional(),
    requestId: z.string().uuid(),
  })
  .strict();
export type CloneFromChildRequest = z.infer<typeof cloneFromChildRequestSchema>;

export const cloneTopicStateSchema = z.enum([
  'unstarted',
  'in_progress',
  'completed',
]);
export type CloneTopicState = z.infer<typeof cloneTopicStateSchema>;

export const cloneCreatedIdsSchema = z.object({
  topicId: z.string().uuid().optional(),
  bookId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
});
export type CloneCreatedIds = z.infer<typeof cloneCreatedIdsSchema>;

export const cloneFromChildResponseSchema = z.object({
  topicId: z.string().uuid(),
  subjectId: z.string().uuid(),
  alreadyExisted: z.boolean(),
  descriptionDivergent: z.boolean(),
  descriptionRefreshed: z.boolean(),
  topicState: cloneTopicStateSchema,
  createdIds: cloneCreatedIdsSchema,
});
export type CloneFromChildResponse = z.infer<
  typeof cloneFromChildResponseSchema
>;

export const undoCloneFromChildRequestSchema = z
  .object({
    createdIds: cloneCreatedIdsSchema,
  })
  .strict();
export type UndoCloneFromChildRequest = z.infer<
  typeof undoCloneFromChildRequestSchema
>;

export const undoCloneFromChildResponseSchema = z.object({
  deleted: z.object({
    topic: z.boolean(),
  }),
  reason: z.literal('session_started').optional(),
});
export type UndoCloneFromChildResponse = z.infer<
  typeof undoCloneFromChildResponseSchema
>;

// Curriculum interaction schemas

export const topicSkipSchema = z
  .object({
    topicId: z.string().uuid(),
  })
  .strict();
export type TopicSkipInput = z.infer<typeof topicSkipSchema>;

export const topicUnskipSchema = z
  .object({
    topicId: z.string().uuid(),
  })
  .strict();
export type TopicUnskipInput = z.infer<typeof topicUnskipSchema>;

export const curriculumChallengeSchema = z
  .object({
    feedback: z.string().min(1).max(2000),
  })
  .strict();
export type CurriculumChallengeInput = z.infer<
  typeof curriculumChallengeSchema
>;

// --- Performance-driven curriculum adaptation (FR21) ---

export const curriculumAdaptSignalSchema = z.enum([
  'struggling',
  'mastered',
  'too_easy',
  'too_hard',
]);
export type CurriculumAdaptSignal = z.infer<typeof curriculumAdaptSignalSchema>;

export const curriculumAdaptRequestSchema = z
  .object({
    /** Topic that triggered the adaptation */
    topicId: z.string().uuid(),
    /** Performance signal that drives reordering */
    signal: curriculumAdaptSignalSchema,
    /** Optional context for the adaptation audit trail */
    context: z.string().max(500).optional(),
  })
  .strict();
export type CurriculumAdaptRequest = z.infer<
  typeof curriculumAdaptRequestSchema
>;

export const curriculumAdaptResponseSchema = z.object({
  /** Whether the curriculum was actually reordered */
  adapted: z.boolean(),
  /** The reordered topic IDs (new sort order) */
  topicOrder: z.array(z.string().uuid()),
  /** Human-readable explanation of what changed */
  explanation: z.string(),
});
export type CurriculumAdaptResponse = z.infer<
  typeof curriculumAdaptResponseSchema
>;

// --- Subject Classification (Story 10.20) ---

export const subjectClassifyInputSchema = z
  .object({
    text: z.string().min(1).max(5000),
  })
  .strict();
export type SubjectClassifyInput = z.infer<typeof subjectClassifyInputSchema>;

export const subjectClassifyCandidateSchema = z.object({
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  confidence: z.number().min(0).max(1),
});
export type SubjectClassifyCandidate = z.infer<
  typeof subjectClassifyCandidateSchema
>;

export const subjectClassifyResultSchema = z.object({
  candidates: z.array(subjectClassifyCandidateSchema),
  needsConfirmation: z.boolean(),
  suggestedSubjectName: z.string().nullable().optional(),
});
export type SubjectClassifyResult = z.infer<typeof subjectClassifyResultSchema>;

// LLM response shape for the multi-subject classification path.
// Parsed via safeParse; failures fall back to inferSuggestedSubjectName().
const subjectClassifyLlmMatchSchema = z.object({
  subjectName: z.string(),
  confidence: z.number().optional(),
});

export const subjectClassifyLlmResponseSchema = z.object({
  matches: z.array(subjectClassifyLlmMatchSchema).optional().default([]),
  suggestedSubjectName: z.string().nullable().optional(),
});
export type SubjectClassifyLlmResponse = z.infer<
  typeof subjectClassifyLlmResponseSchema
>;

// LLM response shape for the zero-subject suggestion path.
export const subjectSuggestLlmResponseSchema = z.object({
  suggestedSubjectName: z.string(),
});
export type SubjectSuggestLlmResponse = z.infer<
  typeof subjectSuggestLlmResponseSchema
>;

// --- Route response schemas ---

export const subjectResponseSchema = z.object({
  subject: subjectSchema,
});
export type SubjectResponse = z.infer<typeof subjectResponseSchema>;

export const subjectListResponseSchema = z.object({
  subjects: z.array(subjectSchema),
});
export type SubjectListResponse = z.infer<typeof subjectListResponseSchema>;

export const createSubjectWithStructureResponseSchema = z.object({
  subject: subjectSchema,
  structureType: subjectStructureTypeSchema,
  bookId: z.string().uuid().optional(),
  bookTitle: z.string().optional(),
  bookCount: z.number().int().optional(),
  topicCount: z.number().int().optional(),
  suggestionCount: z.number().int().optional(),
  classificationFailed: z.boolean().optional(),
});
export type CreateSubjectWithStructureResponse = z.infer<
  typeof createSubjectWithStructureResponseSchema
>;

// --- Book & Topic Suggestions (Conversation-First Flow) ---

export const bookSuggestionSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string(),
  emoji: z.string().nullable(),
  description: z.string().nullable(),
  category: bookSuggestionCategorySchema.nullable(),
  createdAt: isoDateField,
  pickedAt: z.union([isoDateField, z.null()]),
});
export type BookSuggestion = z.infer<typeof bookSuggestionSchema>;

// Outcome of the inline LLM top-up. Mirrors the FailureReason union in
// `apps/api/src/services/book-suggestion-generation.ts` plus a 'success'
// (LLM ran and inserted) and 'not_needed' (already had ≥4 unpicked).
// 'skipped' is used when the caller did not request top-up.
//
// Surfaces to the picker so the user can be told *why* there are no
// suggestions rather than seeing a silent dead end. Required for the
// AGENTS.md "Silent recovery without escalation is banned" rule.
export const bookSuggestionsTopupOutcomeSchema = z.enum([
  'success',
  'not_needed',
  'skipped',
  'cooldown',
  'lock_loser',
  'language_subject',
  'no_subject',
  'quota',
  'network',
  'parse',
  'timeout',
  'all_filtered',
  'unknown',
]);
export type BookSuggestionsTopupOutcome = z.infer<
  typeof bookSuggestionsTopupOutcomeSchema
>;

export const bookSuggestionsResponseSchema = z.object({
  suggestions: z.array(bookSuggestionSchema),
  curriculumBookCount: z.number().int().nonnegative(),
  topupOutcome: bookSuggestionsTopupOutcomeSchema.optional(),
});
export type BookSuggestionsResponse = z.infer<
  typeof bookSuggestionsResponseSchema
>;

export const bookSuggestionsArrayResponseSchema = z.array(bookSuggestionSchema);
export type BookSuggestionsArrayResponse = z.infer<
  typeof bookSuggestionsArrayResponseSchema
>;

export const topicSuggestionSchema = z.object({
  id: z.string().uuid(),
  bookId: z.string().uuid(),
  title: z.string(),
  createdAt: isoDateField,
  usedAt: z.union([isoDateField, z.null()]),
});
export type TopicSuggestion = z.infer<typeof topicSuggestionSchema>;

export const topicSuggestionsResponseSchema = z.array(topicSuggestionSchema);
export type TopicSuggestionsResponse = z.infer<
  typeof topicSuggestionsResponseSchema
>;

// --- Curriculum route response schemas ---

export const getCurriculumResponseSchema = z.object({
  curriculum: curriculumSchema.nullable(),
});
export type GetCurriculumResponse = z.infer<typeof getCurriculumResponseSchema>;

export const topicSkipResponseSchema = z.object({
  message: z.string(),
  topicId: z.string().uuid(),
});
export type TopicSkipResponse = z.infer<typeof topicSkipResponseSchema>;

export const topicUnskipResponseSchema = z.object({
  message: z.string(),
  topicId: z.string().uuid(),
});
export type TopicUnskipResponse = z.infer<typeof topicUnskipResponseSchema>;

export const challengeCurriculumResponseSchema = z.object({
  curriculum: curriculumSchema,
});
export type ChallengeCurriculumResponse = z.infer<
  typeof challengeCurriculumResponseSchema
>;

export const explainTopicResponseSchema = z.object({
  explanation: z.string(),
});
export type ExplainTopicResponse = z.infer<typeof explainTopicResponseSchema>;

// --- Book route response schemas ---

/** GET /library/books — all books grouped by subject */
export const getAllProfileBooksResponseSchema = z.object({
  subjects: z.array(
    z.object({
      subjectId: z.string().uuid(),
      subjectName: z.string(),
      books: z.array(curriculumBookSchema),
    }),
  ),
});
export type GetAllProfileBooksResponse = z.infer<
  typeof getAllProfileBooksResponseSchema
>;

/** GET /subjects/:subjectId/books */
export const getBooksResponseSchema = z.object({
  books: z.array(curriculumBookSchema),
});
export type GetBooksResponse = z.infer<typeof getBooksResponseSchema>;

/** DELETE /subjects/:subjectId/books/:bookId */
export const deleteBookResponseSchema = z.object({
  deleted: z.literal(true),
  bookId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicCount: z.number().int().nonnegative(),
  startedTopicCount: z.number().int().nonnegative(),
});
export type DeleteBookResponse = z.infer<typeof deleteBookResponseSchema>;

/** DELETE /subjects/:id */
export const deleteSubjectResponseSchema = z.object({
  deleted: z.literal(true),
  subjectId: z.string().uuid(),
});
export type DeleteSubjectResponse = z.infer<typeof deleteSubjectResponseSchema>;

/** GET /subjects/:subjectId/books/:bookId/sessions — one session entry */
export const bookSessionSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  topicTitle: z.string(),
  chapter: z.string().nullable(),
  exchangeCount: z.number().int().min(0),
  createdAt: isoDateField,
});
export type BookSession = z.infer<typeof bookSessionSchema>;

/** GET /subjects/:subjectId/books/:bookId/sessions */
export const getBookSessionsResponseSchema = z.object({
  sessions: z.array(bookSessionSchema),
});
export type GetBookSessionsResponse = z.infer<
  typeof getBookSessionsResponseSchema
>;

/** GET /subjects/:subjectId/sessions — one session entry */
export const subjectSessionSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  topicTitle: z.string().nullable(),
  bookId: z.string().uuid().nullable(),
  bookTitle: z.string().nullable(),
  chapter: z.string().nullable(),
  sessionType: z.string(),
  durationSeconds: z.number().int().nullable(),
  createdAt: isoDateField,
});
export type SubjectSession = z.infer<typeof subjectSessionSchema>;

/** GET /subjects/:subjectId/sessions */
export const getSubjectSessionsResponseSchema = z.object({
  sessions: z.array(subjectSessionSchema),
});
export type GetSubjectSessionsResponse = z.infer<
  typeof getSubjectSessionsResponseSchema
>;

/** PATCH /subjects/:subjectId/books/:bookId/topics/:topicId/move */
export const moveTopicResponseSchema = z.object({
  moved: z.literal(true),
  topicId: z.string().uuid(),
  targetBookId: z.string().uuid(),
});
export type MoveTopicResponse = z.infer<typeof moveTopicResponseSchema>;
