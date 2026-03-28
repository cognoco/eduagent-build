import { z } from 'zod';

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

// Subject schemas

export const subjectCreateSchema = z.object({
  name: z.string().min(1).max(200),
  rawInput: z.string().min(1).max(200).optional(),
});
export type SubjectCreateInput = z.infer<typeof subjectCreateSchema>;

export const subjectUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: subjectStatusSchema.optional(),
});
export type SubjectUpdateInput = z.infer<typeof subjectUpdateSchema>;

export const subjectSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  name: z.string(),
  rawInput: z.string().nullable().optional(),
  status: subjectStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
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

export const subjectSuggestionSchema = z.object({
  name: z.string(),
  description: z.string(),
});
export type SubjectSuggestion = z.infer<typeof subjectSuggestionSchema>;

export const subjectResolveResultSchema = z.object({
  status: subjectResolveStatusSchema,
  resolvedName: z.string().nullable(),
  suggestions: z.array(subjectSuggestionSchema),
  displayMessage: z.string(),
});
export type SubjectResolveResult = z.infer<typeof subjectResolveResultSchema>;

// Curriculum schemas

export const curriculumTopicSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  sortOrder: z.number().int(),
  relevance: topicRelevanceSchema,
  estimatedMinutes: z.number().int(),
  skipped: z.boolean(),
});
export type CurriculumTopic = z.infer<typeof curriculumTopicSchema>;

export const curriculumSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  version: z.number().int(),
  topics: z.array(curriculumTopicSchema),
  generatedAt: z.string().datetime(),
});
export type Curriculum = z.infer<typeof curriculumSchema>;

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
  estimatedMinutes: z.number().int(),
});
export type GeneratedTopic = z.infer<typeof generatedTopicSchema>;

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
