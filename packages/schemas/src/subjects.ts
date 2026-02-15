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
  status: subjectStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Subject = z.infer<typeof subjectSchema>;

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

// Curriculum interaction schemas

export const topicSkipSchema = z.object({
  topicId: z.string().uuid(),
});
export type TopicSkipInput = z.infer<typeof topicSkipSchema>;

export const curriculumChallengeSchema = z.object({
  feedback: z.string().min(1).max(2000),
});
export type CurriculumChallengeInput = z.infer<
  typeof curriculumChallengeSchema
>;
