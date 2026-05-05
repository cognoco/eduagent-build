import { z } from 'zod';
import {
  cefrLevelSchema,
  languageCodeSchema,
  pedagogyModeSchema,
} from './language.ts';

// neon-serverless returns raw Date objects; neon-http returns ISO strings.
// Accept either so response schemas don't break when a service forgets to map.
// See `project_drizzle_date_objects.md` memory entry.
const isoDateField = z.union([
  z.string().datetime(),
  z.date().transform((d) => d.toISOString()),
]);

// Enums

export const subjectStatusSchema = z.enum(['active', 'paused', 'archived']);
export type SubjectStatus = z.infer<typeof subjectStatusSchema>;

export const topicRelevanceSchema = z.enum([
  'core',
  'recommended',
  'contemporary',
  'emerging',
]);
export type TopicRelevance = z.infer<typeof topicRelevanceSchema>;

export const curriculumTopicSourceSchema = z.enum(['generated', 'user']);
export type CurriculumTopicSource = z.infer<typeof curriculumTopicSourceSchema>;

// Subject schemas

export const subjectCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  rawInput: z.string().trim().min(1).max(200).optional(),
  focus: z.string().trim().min(1).max(200).optional(),
  focusDescription: z.string().trim().min(1).max(500).optional(),
  pedagogyMode: pedagogyModeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
});
export type SubjectCreateInput = z.infer<typeof subjectCreateSchema>;

export const subjectUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  status: subjectStatusSchema.optional(),
  pedagogyMode: pedagogyModeSchema.optional(),
  languageCode: languageCodeSchema.nullable().optional(),
});
export type SubjectUpdateInput = z.infer<typeof subjectUpdateSchema>;

export const subjectSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  name: z.string(),
  rawInput: z.string().nullable().optional(),
  status: subjectStatusSchema,
  pedagogyMode: pedagogyModeSchema,
  languageCode: languageCodeSchema.nullable().optional(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type Subject = z.infer<typeof subjectSchema>;

// Subject name resolution — validate/resolve user input before creating subject

export const subjectResolveInputSchema = z.object({
  rawInput: z.string().min(1).max(200),
});
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
  'COMPLETED',
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
});
export type BookWithTopics = z.infer<typeof bookWithTopicsSchema>;

// Curriculum generation input — used by the LLM curriculum generator

export const curriculumInputSchema = z.object({
  subjectName: z.string(),
  interviewSummary: z.string(),
  goals: z.array(z.string()),
  experienceLevel: z.string(),
});
export type CurriculumInput = z.infer<typeof curriculumInputSchema>;

// Generated topic — LLM-generated topic before persistence

export const generatedTopicSchema = z.object({
  title: z.string(),
  description: z.string(),
  relevance: topicRelevanceSchema,
  estimatedMinutes: z.number().int().min(5).max(240),
  cefrLevel: cefrLevelSchema.optional(),
  cefrSublevel: z.string().optional(),
  targetWordCount: z.number().int().optional(),
  targetChunkCount: z.number().int().optional(),
});
export type GeneratedTopic = z.infer<typeof generatedTopicSchema>;

export const generatedBookSchema = z.object({
  title: z.string(),
  description: z.string(),
  emoji: z.string(),
  sortOrder: z.number().int(),
});
export type GeneratedBook = z.infer<typeof generatedBookSchema>;

export const generatedBookTopicSchema = z.object({
  title: z.string(),
  description: z.string(),
  chapter: z.string(),
  sortOrder: z.number().int(),
  estimatedMinutes: z.number().int().min(5).max(240),
});
export type GeneratedBookTopic = z.infer<typeof generatedBookTopicSchema>;

export const generatedConnectionSchema = z.object({
  topicA: z.string(),
  topicB: z.string(),
});
export type GeneratedConnection = z.infer<typeof generatedConnectionSchema>;

export const bookGenerationResultSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('broad'),
    books: z.array(generatedBookSchema),
  }),
  z.object({
    type: z.literal('narrow'),
    topics: z.array(generatedTopicSchema),
  }),
]);
export type BookGenerationResult = z.infer<typeof bookGenerationResultSchema>;

export const bookTopicGenerationResultSchema = z.object({
  topics: z.array(generatedBookTopicSchema),
  connections: z.array(generatedConnectionSchema),
});
export type BookTopicGenerationResult = z.infer<
  typeof bookTopicGenerationResultSchema
>;

export const bookTopicGenerateInputSchema = z.object({
  priorKnowledge: z.string().max(2000).optional(),
});
export type BookTopicGenerateInput = z.infer<
  typeof bookTopicGenerateInputSchema
>;

export const curriculumTopicPreviewSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  estimatedMinutes: z.number().int().min(5).max(240),
});
export type CurriculumTopicPreview = z.infer<
  typeof curriculumTopicPreviewSchema
>;

export const curriculumTopicAddSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('preview'),
    title: z.string().min(1).max(200),
  }),
  z.object({
    mode: z.literal('create'),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(500),
    estimatedMinutes: z.number().int().min(5).max(240),
  }),
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

// Curriculum interaction schemas

export const topicSkipSchema = z.object({
  topicId: z.string().uuid(),
});
export type TopicSkipInput = z.infer<typeof topicSkipSchema>;

export const topicUnskipSchema = z.object({
  topicId: z.string().uuid(),
});
export type TopicUnskipInput = z.infer<typeof topicUnskipSchema>;

export const curriculumChallengeSchema = z.object({
  feedback: z.string().min(1).max(2000),
});
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

export const curriculumAdaptRequestSchema = z.object({
  /** Topic that triggered the adaptation */
  topicId: z.string().uuid(),
  /** Performance signal that drives reordering */
  signal: curriculumAdaptSignalSchema,
  /** Optional context for the adaptation audit trail */
  context: z.string().max(500).optional(),
});
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

export const subjectClassifyInputSchema = z.object({
  text: z.string().min(1).max(5000),
});
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
  createdAt: isoDateField,
  pickedAt: z.union([isoDateField, z.null()]),
});
export type BookSuggestion = z.infer<typeof bookSuggestionSchema>;

export const bookSuggestionsResponseSchema = z.array(bookSuggestionSchema);
export type BookSuggestionsResponse = z.infer<
  typeof bookSuggestionsResponseSchema
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
    })
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

/** GET /subjects/:subjectId/books/:bookId/sessions — one session entry */
export const bookSessionSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  topicTitle: z.string(),
  chapter: z.string().nullable(),
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
  topicTitle: z.string(),
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
