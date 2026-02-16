import { z } from 'zod';

// Verification depth

export const verificationDepthSchema = z.enum([
  'recall',
  'explain',
  'transfer',
]);
export type VerificationDepth = z.infer<typeof verificationDepthSchema>;

// Assessment status

export const assessmentStatusSchema = z.enum([
  'in_progress',
  'passed',
  'failed',
]);
export type AssessmentStatus = z.infer<typeof assessmentStatusSchema>;

// Assessment response

export const assessmentSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  verificationDepth: verificationDepthSchema,
  status: assessmentStatusSchema,
  masteryScore: z.number().min(0).max(1).nullable(),
  createdAt: z.string().datetime(),
});
export type Assessment = z.infer<typeof assessmentSchema>;

// Assessment answer submission

export const assessmentAnswerSchema = z.object({
  answer: z.string().min(1).max(10000),
});
export type AssessmentAnswerInput = z.infer<typeof assessmentAnswerSchema>;

// Quick check response

export const quickCheckResponseSchema = z.object({
  answer: z.string().min(1).max(5000),
});
export type QuickCheckResponseInput = z.infer<typeof quickCheckResponseSchema>;

// Retention card response

export const retentionCardSchema = z.object({
  topicId: z.string().uuid(),
  easeFactor: z.number(),
  intervalDays: z.number().int(),
  repetitions: z.number().int(),
  nextReviewAt: z.string().datetime().nullable(),
  xpStatus: z.enum(['pending', 'verified', 'decayed']),
  failureCount: z.number().int(),
});
export type RetentionCardResponse = z.infer<typeof retentionCardSchema>;

// Recall test submission

export const recallTestSubmitSchema = z.object({
  topicId: z.string().uuid(),
  answer: z.string().min(1).max(10000),
});
export type RecallTestSubmitInput = z.infer<typeof recallTestSubmitSchema>;

// Relearn topic request

export const relearnTopicSchema = z.object({
  topicId: z.string().uuid(),
  method: z.enum(['same', 'different']),
  preferredMethod: z.string().max(500).optional(), // only when method='different'
});
export type RelearnTopicInput = z.infer<typeof relearnTopicSchema>;

// Teaching method preference

export const teachingMethodSchema = z.enum([
  'visual_diagrams',
  'step_by_step',
  'real_world_examples',
  'practice_problems',
]);
export type TeachingMethod = z.infer<typeof teachingMethodSchema>;

export const teachingPreferenceSchema = z.object({
  subjectId: z.string().uuid(),
  method: teachingMethodSchema,
});
export type TeachingPreferenceInput = z.infer<typeof teachingPreferenceSchema>;

// Needs deepening status

export const needsDeepeningSchema = z.object({
  topicId: z.string().uuid(),
  status: z.enum(['active', 'resolved']),
  consecutiveSuccessCount: z.number().int(),
});
export type NeedsDeepeningStatus = z.infer<typeof needsDeepeningSchema>;
