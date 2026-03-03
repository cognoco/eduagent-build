import { z } from 'zod';
import { chatExchangeSchema } from './common.js';

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

// Assessment response (API-facing, lightweight)

export const assessmentSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  verificationDepth: verificationDepthSchema,
  status: assessmentStatusSchema,
  masteryScore: z.number().min(0).max(1).nullable(),
  createdAt: z.string().datetime(),
});
export type Assessment = z.infer<typeof assessmentSchema>;

// Assessment record — full DB-mapped type with all fields

export const assessmentRecordSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  verificationDepth: verificationDepthSchema,
  status: assessmentStatusSchema,
  masteryScore: z.number().min(0).max(1).nullable(),
  qualityRating: z.number().int().min(0).max(5).nullable(),
  exchangeHistory: z.array(chatExchangeSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AssessmentRecord = z.infer<typeof assessmentRecordSchema>;

// Quick check context — input for generating comprehension questions

export const quickCheckContextSchema = z.object({
  topicTitle: z.string(),
  topicDescription: z.string(),
  recentExchanges: z.array(chatExchangeSchema),
});
export type QuickCheckContext = z.infer<typeof quickCheckContextSchema>;

// Quick check result — generated comprehension questions

export const quickCheckResultSchema = z.object({
  questions: z.array(z.string()),
  checkType: z.literal('concept_boundary'),
});
export type QuickCheckResult = z.infer<typeof quickCheckResultSchema>;

// Assessment context — input for evaluating an assessment answer

export const assessmentContextSchema = z.object({
  topicTitle: z.string(),
  topicDescription: z.string(),
  currentDepth: verificationDepthSchema,
  exchangeHistory: z.array(chatExchangeSchema),
});
export type AssessmentContext = z.infer<typeof assessmentContextSchema>;

// Assessment evaluation — result of evaluating a learner's answer

export const assessmentEvaluationSchema = z.object({
  feedback: z.string(),
  passed: z.boolean(),
  shouldEscalateDepth: z.boolean(),
  nextDepth: verificationDepthSchema.optional(),
  masteryScore: z.number().min(0).max(1),
  qualityRating: z.number().int().min(0).max(5),
});
export type AssessmentEvaluation = z.infer<typeof assessmentEvaluationSchema>;

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

// Verification type — standard, evaluate (Devil's Advocate), teach_back (Feynman)

export const verificationTypeSchema = z.enum([
  'standard',
  'evaluate',
  'teach_back',
]);
export type VerificationType = z.infer<typeof verificationTypeSchema>;

// Analogy domain preference (FR134-137)

export const analogyDomainSchema = z.enum([
  'cooking',
  'sports',
  'building',
  'music',
  'nature',
  'gaming',
]);
export type AnalogyDomain = z.infer<typeof analogyDomainSchema>;

export const analogyDomainUpdateSchema = z.object({
  analogyDomain: analogyDomainSchema.nullable(),
});
export type AnalogyDomainUpdateInput = z.infer<
  typeof analogyDomainUpdateSchema
>;

// EVALUATE assessment — hidden LLM output for Devil's Advocate challenges (FR128-133)

export const evaluateAssessmentSchema = z.object({
  challengePassed: z.boolean(),
  flawIdentified: z.string().optional(),
  quality: z.number().int().min(0).max(5),
});
export type EvaluateAssessment = z.infer<typeof evaluateAssessmentSchema>;

// TEACH_BACK assessment — hidden LLM output for Feynman technique (FR138-143)

export const teachBackAssessmentSchema = z.object({
  completeness: z.number().min(0).max(5),
  accuracy: z.number().min(0).max(5),
  clarity: z.number().min(0).max(5),
  overallQuality: z.number().min(0).max(5),
  weakestArea: z.enum(['completeness', 'accuracy', 'clarity']),
  gapIdentified: z.string().nullable(),
});
export type TeachBackAssessment = z.infer<typeof teachBackAssessmentSchema>;

// Retention card response

export const retentionCardSchema = z.object({
  topicId: z.string().uuid(),
  easeFactor: z.number(),
  intervalDays: z.number().int(),
  repetitions: z.number().int(),
  nextReviewAt: z.string().datetime().nullable(),
  lastReviewedAt: z.string().datetime().nullable(),
  xpStatus: z.enum(['pending', 'verified', 'decayed']),
  failureCount: z.number().int(),
  evaluateDifficultyRung: z.number().int().min(1).max(4).nullable().optional(),
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
  analogyDomain: analogyDomainSchema.nullable().optional(),
});
export type TeachingPreferenceInput = z.infer<typeof teachingPreferenceSchema>;

// Needs deepening status

export const needsDeepeningSchema = z.object({
  topicId: z.string().uuid(),
  status: z.enum(['active', 'resolved']),
  consecutiveSuccessCount: z.number().int(),
});
export type NeedsDeepeningStatus = z.infer<typeof needsDeepeningSchema>;

// Topic stability — FR93: 5+ consecutive successful retrievals = "Stable"

export const topicStabilitySchema = z.object({
  topicId: z.string().uuid(),
  isStable: z.boolean(),
  consecutiveSuccesses: z.number().int(),
});
export type TopicStability = z.infer<typeof topicStabilitySchema>;

// EVALUATE eligibility — FR128-129: strong-retention gating check

export const evaluateEligibilitySchema = z.object({
  eligible: z.boolean(),
  topicId: z.string().uuid(),
  topicTitle: z.string(),
  currentRung: z.number().int().min(1).max(4),
  easeFactor: z.number(),
  repetitions: z.number().int(),
  reason: z.string().optional(),
});
export type EvaluateEligibility = z.infer<typeof evaluateEligibilitySchema>;

// EVALUATE difficulty rung — FR131: difficulty calibration

export const evaluateDifficultyRungSchema = z.number().int().min(1).max(4);
export type EvaluateDifficultyRung = z.infer<
  typeof evaluateDifficultyRungSchema
>;

// EVALUATE failure action — FR133: three-strike escalation

export const evaluateFailureActionSchema = z.object({
  action: z.enum(['reveal_flaw', 'lower_difficulty', 'exit_to_standard']),
  message: z.string(),
  newDifficultyRung: z.number().int().min(1).max(4).optional(),
});
export type EvaluateFailureAction = z.infer<typeof evaluateFailureActionSchema>;
