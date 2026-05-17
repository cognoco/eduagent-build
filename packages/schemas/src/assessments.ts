import { z } from 'zod';
import { chatExchangeSchema } from './common.ts';

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
  'borderline',
  'failed_exhausted',
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
  weakAreas: z.array(z.string().min(1).max(120)).max(8).optional(),
});
export type AssessmentEvaluation = z.infer<typeof assessmentEvaluationSchema>;

// Assessment answer submission

export const assessmentAnswerSchema = z.object({
  answer: z.string().min(1).max(10000),
});
export type AssessmentAnswerInput = z.infer<typeof assessmentAnswerSchema>;

// Quick check request — the learner's answer submission (not an HTTP response)

export const quickCheckRequestSchema = z.object({
  answer: z.string().min(1).max(5000),
});
export type QuickCheckRequestInput = z.infer<typeof quickCheckRequestSchema>;

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

export const analogyDomainResponseSchema = z.object({
  analogyDomain: analogyDomainSchema.nullable(),
});
export type AnalogyDomainResponse = z.infer<typeof analogyDomainResponseSchema>;

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
  daysSinceLastReview: z.number().int().min(0).nullable(),
  xpStatus: z.enum(['pending', 'verified', 'decayed']),
  failureCount: z.number().int(),
  evaluateDifficultyRung: z.number().int().min(1).max(4).nullable().optional(),
});
export type RetentionCardResponse = z.infer<typeof retentionCardSchema>;

// Recall test submission

export const recallTestSubmitSchema = z
  .object({
    topicId: z.string().uuid(),
    answer: z.string().max(10000).optional().default(''),
    attemptMode: z.enum(['standard', 'dont_remember']).optional(),
  })
  .refine(
    (value) =>
      value.attemptMode === 'dont_remember' ||
      (value.answer ?? '').trim().length > 0,
    {
      message: 'Answer is required',
      path: ['answer'],
    },
  );
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

// Route response envelopes — one schema per success c.json() call

export const createAssessmentResponseSchema = z.object({
  assessment: assessmentSchema,
});
export type CreateAssessmentResponse = z.infer<
  typeof createAssessmentResponseSchema
>;

export const submitAssessmentAnswerResponseSchema = z.object({
  evaluation: assessmentEvaluationSchema,
  status: assessmentStatusSchema,
});
export type SubmitAssessmentAnswerResponse = z.infer<
  typeof submitAssessmentAnswerResponseSchema
>;

export const getAssessmentResponseSchema = z.object({
  assessment: assessmentRecordSchema,
});
export type GetAssessmentResponse = z.infer<typeof getAssessmentResponseSchema>;

export const quickCheckFeedbackResponseSchema = z.object({
  feedback: z.string(),
  isCorrect: z.boolean(),
});
export type QuickCheckFeedbackResponse = z.infer<
  typeof quickCheckFeedbackResponseSchema
>;

export const declineAssessmentRefreshResponseSchema = z.object({
  ok: z.literal(true),
});
export type DeclineAssessmentRefreshResponse = z.infer<
  typeof declineAssessmentRefreshResponseSchema
>;

// ---------------------------------------------------------------------------
// Retention route response envelopes
// ---------------------------------------------------------------------------

// RetentionCardResponse extended with topic metadata (Library Topics tab)
const retentionCardWithMetaSchema = retentionCardSchema.extend({
  topicTitle: z.string(),
  bookId: z.string(),
});

/** GET /subjects/:subjectId/retention */
export const subjectRetentionResponseSchema = z.object({
  topics: z.array(retentionCardWithMetaSchema),
  reviewDueCount: z.number().int(),
});
export type SubjectRetentionResponse = z.infer<
  typeof subjectRetentionResponseSchema
>;

/** GET /library/retention */
export const libraryRetentionResponseSchema = z.object({
  subjects: z.array(
    z.object({
      subjectId: z.string().uuid(),
      topics: z.array(retentionCardWithMetaSchema),
      reviewDueCount: z.number().int(),
    }),
  ),
});
export type LibraryRetentionResponse = z.infer<
  typeof libraryRetentionResponseSchema
>;

/** GET /topics/:topicId/retention */
export const topicRetentionResponseSchema = z.object({
  card: retentionCardSchema.nullable(),
});
export type TopicRetentionResponse = z.infer<
  typeof topicRetentionResponseSchema
>;

// Recall test result — RemediationSchema is embedded here to avoid circular imports
const recallRemediationSchema = z.object({
  action: z.literal('redirect_to_library'),
  topicId: z.string().uuid(),
  topicTitle: z.string(),
  retentionStatus: z.string(),
  failureCount: z.number().int(),
  cooldownEndsAt: z.string().datetime(),
  options: z.array(z.enum(['review_and_retest', 'relearn_topic'])),
});

export const recallTestResultSchema = z.object({
  passed: z.boolean(),
  masteryScore: z.number(),
  xpChange: z.string(),
  nextReviewAt: z.string().datetime(),
  failureCount: z.number().int(),
  hint: z.string().optional(),
  failureAction: z.enum(['feedback_only', 'redirect_to_library']).optional(),
  remediation: recallRemediationSchema.optional(),
  cooldownActive: z.boolean().optional(),
  cooldownEndsAt: z.string().datetime().optional(),
});
export type RecallTestResult = z.infer<typeof recallTestResultSchema>;

/** POST /retention/recall-test */
export const recallTestResponseSchema = z.object({
  result: recallTestResultSchema,
});
export type RecallTestResponse = z.infer<typeof recallTestResponseSchema>;

/** POST /retention/relearn */
export const relearnResponseSchema = z.object({
  message: z.string(),
  topicId: z.string().uuid(),
  method: z.string(),
  preferredMethod: z.string().optional(),
  sessionId: z.string().uuid().nullable(),
  recap: z.string().nullable(),
});
export type RelearnResponse = z.infer<typeof relearnResponseSchema>;

/** GET /subjects/:subjectId/needs-deepening */
export const needsDeepeningResponseSchema = z.object({
  topics: z.array(needsDeepeningSchema),
  count: z.number().int(),
});
export type NeedsDeepeningResponse = z.infer<
  typeof needsDeepeningResponseSchema
>;

// Teaching preference response shape (GET + PUT share the same envelope)
export const teachingPreferenceResponseDataSchema = z.object({
  subjectId: z.string().uuid(),
  method: z.string(),
  analogyDomain: z.string().nullable().optional(),
  nativeLanguage: z.string().nullable().optional(),
});

/** GET /subjects/:subjectId/teaching-preference
 *  PUT /subjects/:subjectId/teaching-preference */
export const teachingPreferenceEndpointResponseSchema = z.object({
  preference: teachingPreferenceResponseDataSchema.nullable(),
});
export type TeachingPreferenceEndpointResponse = z.infer<
  typeof teachingPreferenceEndpointResponseSchema
>;

/** DELETE /subjects/:subjectId/teaching-preference */
export const deleteTeachingPreferenceResponseSchema = z.object({
  message: z.string(),
});
export type DeleteTeachingPreferenceResponse = z.infer<
  typeof deleteTeachingPreferenceResponseSchema
>;

/** GET /retention/stability */
export const stabilityResponseSchema = z.object({
  topics: z.array(topicStabilitySchema),
});
export type StabilityResponse = z.infer<typeof stabilityResponseSchema>;

export const assessmentEligibleTopicSchema = z.object({
  topicId: z.string().uuid(),
  topicTitle: z.string(),
  topicDescription: z.string(),
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  lastStudiedAt: z.string().datetime(),
});
export type AssessmentEligibleTopic = z.infer<
  typeof assessmentEligibleTopicSchema
>;

/** GET /retention/assessment-eligible */
export const assessmentEligibleTopicsResponseSchema = z.object({
  topics: z.array(assessmentEligibleTopicSchema),
});
export type AssessmentEligibleTopicsResponse = z.infer<
  typeof assessmentEligibleTopicsResponseSchema
>;
