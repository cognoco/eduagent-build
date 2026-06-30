import { z } from 'zod';
import { isoDateField } from './common.ts';
import { publicProfileSchema } from './profiles.ts';
import { consentStatusSchema, consentTypeSchema } from './consent.ts';
import { learningProfileSchema } from './learning-profiles.ts';
import { subscriptionTierSchema, subscriptionStatusSchema } from './billing.ts';

/**
 * [BUG-206] Narrowed export row shape.
 *
 * The 18 GDPR-export tables in `dataExportSchema` were previously typed as
 * `z.record(z.string(), z.unknown())`, which made it impossible to centralise
 * the contract for future tightening — every table was an inline ad-hoc
 * schema. We do not have hand-written zod schemas for every table (the
 * canonical row types live in `@eduagent/database` as Drizzle inferred
 * types), and spelling out 18 full schemas here would push churn into
 * ~25 downstream call sites without bounded value.
 *
 * Compromise: every export row goes through `dataExportRowSchema` — same
 * runtime shape as before, but centrally defined so a future PR can tighten
 * one table at a time by replacing its per-table alias below.
 */
export const dataExportRowSchema = z.record(z.string(), z.unknown());
export type DataExportRow = z.infer<typeof dataExportRowSchema>;

// ---------------------------------------------------------------------------
// [WI-978] Tightened per-table export row schemas.
//
// Highest-sensitivity tables (subscriptions, assessments) are given real
// z.object schemas matching the Drizzle column types.
// ---------------------------------------------------------------------------

/**
 * [WI-978] Subscriptions export row — billing-sensitive table tightened.
 * Matches the `subscriptions` Drizzle table columns. Optional fields mirror
 * nullable/absent DB columns (Stripe / RevenueCat fields may be absent for
 * IAP-only or free-tier accounts).
 */
export const dataExportSubscriptionRowSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  stripeCustomerId: z.string().nullable(),
  stripeSubscriptionId: z.string().nullable(),
  tier: subscriptionTierSchema,
  status: subscriptionStatusSchema,
  trialEndsAt: isoDateField.nullable(),
  currentPeriodStart: isoDateField.nullable(),
  currentPeriodEnd: isoDateField.nullable(),
  cancelledAt: isoDateField.nullable(),
  lastStripeEventTimestamp: isoDateField.nullable(),
  lastStripeEventId: z.string().nullable(),
  revenuecatOriginalAppUserId: z.string().nullable(),
  lastRevenuecatEventId: z.string().nullable(),
  lastRevenuecatEventTimestampMs: z.string().nullable(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type DataExportSubscriptionRow = z.infer<
  typeof dataExportSubscriptionRowSchema
>;

/**
 * [WI-978] Assessments export row — learning-data-sensitive table tightened.
 * Matches the `assessments` Drizzle table columns. The `exchangeHistory`
 * JSONB column is typed as an unknown array (the full ChatExchange schema
 * lives in db-jsonb.ts — use z.array(z.unknown()) here to avoid a circular
 * dependency through the schema package barrel).
 */
export const dataExportAssessmentRowSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  verificationDepth: z
    .enum(['recall', 'explain', 'transfer'])
    .default('recall'),
  status: z.enum([
    'in_progress',
    'passed',
    'failed',
    'borderline',
    'failed_exhausted',
  ]),
  masteryScore: z.number().nullable(),
  masteryChallengeVerifiedAt: isoDateField.nullable(),
  qualityRating: z.number().int().nullable(),
  exchangeHistory: z.array(z.unknown()).default([]),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type DataExportAssessmentRow = z.infer<
  typeof dataExportAssessmentRowSchema
>;

// ---------------------------------------------------------------------------
// [WI-1097] Tightened per-table export row schemas for the remaining 19 tables.
//
// Each schema mirrors the corresponding Drizzle table columns exactly.
// Conventions (matching WI-978 reference schemas above):
//   - z.string().uuid() for uuid PKs/FKs
//   - isoDateField for timestamp columns; .nullable() when the DB column is nullable
//   - Inline z.enum([...]) for pgEnum columns (values copied from Drizzle schema)
//   - z.number().int() for integer columns; z.number() for numeric/float columns
//   - z.boolean() for boolean columns
//   - z.record(z.string(), z.unknown()) or z.array(z.unknown()) for JSONB columns
//     (avoids circular barrel imports and keeps the schema package leaf-only)
// ---------------------------------------------------------------------------

/**
 * [WI-1097] Subjects export row.
 * Matches the `subjects` Drizzle table (packages/database/src/schema/subjects.ts).
 */
export const dataExportSubjectRowSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  name: z.string(),
  rawInput: z.string().nullable(),
  status: z.enum(['active', 'paused', 'archived']),
  pedagogyMode: z.enum(['socratic', 'four_strands']),
  languageCode: z.string().nullable(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
  urgencyBoostUntil: isoDateField.nullable(),
  urgencyBoostReason: z.string().nullable(),
  bookSuggestionsLastGenerationAttemptedAt: isoDateField.nullable(),
});
export type DataExportSubjectRow = z.infer<typeof dataExportSubjectRowSchema>;

/**
 * [WI-1097] Curricula export row.
 * Matches the `curricula` Drizzle table (packages/database/src/schema/subjects.ts).
 */
export const dataExportCurriculumRowSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  version: z.number().int(),
  generatedAt: isoDateField,
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type DataExportCurriculumRow = z.infer<
  typeof dataExportCurriculumRowSchema
>;

/**
 * [WI-1097] Curriculum topics export row.
 * Matches the `curriculum_topics` Drizzle table (packages/database/src/schema/subjects.ts).
 */
export const dataExportCurriculumTopicRowSchema = z.object({
  id: z.string().uuid(),
  curriculumId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  sortOrder: z.number().int(),
  relevance: z.enum(['core', 'recommended', 'contemporary', 'emerging']),
  source: z.enum(['generated', 'user', 'parent_bridge']),
  estimatedMinutes: z.number().int(),
  bookId: z.string().uuid(),
  chapter: z.string().nullable(),
  skipped: z.boolean(),
  cefrLevel: z.string().nullable(),
  cefrSublevel: z.string().nullable(),
  targetWordCount: z.number().int().nullable(),
  targetChunkCount: z.number().int().nullable(),
  sourceChildProfileId: z.string().uuid().nullable(),
  filedFrom: z.enum(['pre_generated', 'session_filing', 'freeform_filing']),
  sessionId: z.string().uuid().nullable(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type DataExportCurriculumTopicRow = z.infer<
  typeof dataExportCurriculumTopicRowSchema
>;

/**
 * [WI-1097] Learning sessions export row.
 * Matches the `learning_sessions` Drizzle table (packages/database/src/schema/sessions.ts).
 * The `metadata` JSONB column is typed as a nullable record.
 */
export const dataExportLearningSessionRowSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  sessionType: z.enum(['learning', 'homework', 'interleaved']),
  verificationType: z.string().nullable(),
  inputMode: z.string(),
  status: z.enum(['active', 'paused', 'completed', 'auto_closed']),
  escalationRung: z.number().int(),
  exchangeCount: z.number().int(),
  startedAt: isoDateField,
  lastActivityAt: isoDateField,
  endedAt: isoDateField.nullable(),
  durationSeconds: z.number().int().nullable(),
  wallClockSeconds: z.number().int().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  rawInput: z.string().nullable(),
  filedAt: isoDateField.nullable(),
  filingStatus: z
    .enum([
      'filing_pending',
      'filing_failed',
      'filing_recovered',
      'filing_kept_out',
    ])
    .nullable(),
  filingRetryCount: z.number().int(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type DataExportLearningSessionRow = z.infer<
  typeof dataExportLearningSessionRowSchema
>;

/**
 * [WI-1097] Session events export row.
 * Matches the `session_events` Drizzle table (packages/database/src/schema/sessions.ts).
 * JSONB columns (metadata, structuredAssessment) use z.unknown() / z.record().
 */
export const dataExportSessionEventRowSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  eventType: z.enum([
    'user_message',
    'ai_response',
    'system_prompt',
    'quick_action',
    'user_feedback',
    'ocr_correction',
    'understanding_check',
    'session_start',
    'session_end',
    'hint',
    'escalation',
    'flag',
    'check_response',
    'summary_submission',
    'parking_lot_add',
    'homework_problem_started',
    'homework_problem_completed',
    'evaluate_challenge',
    'teach_back_response',
  ]),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  structuredAssessment: z.unknown().nullable(),
  drillCorrect: z.number().int().nullable(),
  drillTotal: z.number().int().nullable(),
  clientId: z.string().nullable(),
  orphanReason: z.string().nullable(),
  createdAt: isoDateField,
});
export type DataExportSessionEventRow = z.infer<
  typeof dataExportSessionEventRowSchema
>;

/**
 * [WI-1097] Session summaries export row.
 * Matches the `session_summaries` Drizzle table (packages/database/src/schema/sessions.ts).
 * The `llmSummary` JSONB column uses z.unknown() (complex LlmSummary type
 * lives in db-jsonb.ts — importing it here would create a circular dep).
 */
export const dataExportSessionSummaryRowSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  content: z.string().nullable(),
  aiFeedback: z.string().nullable(),
  highlight: z.string().nullable(),
  narrative: z.string().nullable(),
  conversationPrompt: z.string().nullable(),
  engagementSignal: z.string().nullable(),
  closingLine: z.string().nullable(),
  learnerRecap: z.string().nullable(),
  nextTopicId: z.string().uuid().nullable(),
  nextTopicReason: z.string().nullable(),
  status: z.enum([
    'pending',
    'submitted',
    'accepted',
    'skipped',
    'auto_closed',
  ]),
  createdAt: isoDateField,
  updatedAt: isoDateField,
  llmSummary: z.unknown().nullable(),
  summaryGeneratedAt: isoDateField.nullable(),
  purgedAt: isoDateField.nullable(),
});
export type DataExportSessionSummaryRow = z.infer<
  typeof dataExportSessionSummaryRowSchema
>;

/**
 * [WI-1097] Retention cards export row.
 * Matches the `retention_cards` Drizzle table (packages/database/src/schema/assessments.ts).
 * `easeFactor` is a numeric(4,2) column — the `numericAsNumber` Drizzle helper
 * returns it as a JS number, so z.number() (not .int()) is correct.
 */
export const dataExportRetentionCardRowSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  topicId: z.string().uuid(),
  easeFactor: z.number(),
  intervalDays: z.number().int(),
  repetitions: z.number().int(),
  lastReviewedAt: isoDateField.nullable(),
  nextReviewAt: isoDateField.nullable(),
  masteredAt: isoDateField.nullable(),
  failureCount: z.number().int(),
  consecutiveSuccesses: z.number().int(),
  xpStatus: z.enum(['pending', 'verified', 'decayed']),
  evaluateDifficultyRung: z.number().int().nullable(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type DataExportRetentionCardRow = z.infer<
  typeof dataExportRetentionCardRowSchema
>;

/**
 * [WI-1097] XP ledger export row.
 * Matches the `xp_ledger` Drizzle table (packages/database/src/schema/progress.ts).
 */
export const dataExportXpLedgerRowSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  topicId: z.string().uuid(),
  subjectId: z.string().uuid(),
  amount: z.number().int(),
  status: z.enum(['pending', 'verified', 'decayed']),
  earnedAt: isoDateField,
  verifiedAt: isoDateField.nullable(),
  createdAt: isoDateField,
  reflectionMultiplierApplied: z.boolean(),
  reflectionAppliedBySessionId: z.string().uuid().nullable(),
});
export type DataExportXpLedgerRow = z.infer<typeof dataExportXpLedgerRowSchema>;

/**
 * [WI-1097] Streaks export row.
 * Matches the `streaks` Drizzle table (packages/database/src/schema/progress.ts).
 * Note: `lastActivityDate` and `gracePeriodStartDate` are stored as TEXT
 * (YYYY-MM-DD format), NOT as timestamps — they use z.string(), not isoDateField.
 */
export const dataExportStreakRowSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  currentStreak: z.number().int(),
  longestStreak: z.number().int(),
  lastActivityDate: z.string().nullable(),
  gracePeriodStartDate: z.string().nullable(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type DataExportStreakRow = z.infer<typeof dataExportStreakRowSchema>;

/**
 * [WI-1097] Notification preferences export row.
 * Matches the `notification_preferences` Drizzle table (packages/database/src/schema/progress.ts).
 */
export const dataExportNotificationPreferenceRowSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  reviewReminders: z.boolean(),
  dailyReminders: z.boolean(),
  weeklyProgressPush: z.boolean(),
  weeklyProgressEmail: z.boolean(),
  monthlyProgressEmail: z.boolean(),
  pushEnabled: z.boolean(),
  maxDailyPush: z.number().int(),
  expoPushToken: z.string().nullable(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type DataExportNotificationPreferenceRow = z.infer<
  typeof dataExportNotificationPreferenceRowSchema
>;

/**
 * [WI-1097] Learning modes export row.
 * Matches the `learning_modes` Drizzle table (packages/database/src/schema/progress.ts).
 */
export const dataExportLearningModeRowSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  medianResponseSeconds: z.number().int().nullable(),
  celebrationLevel: z.enum(['all', 'big_only', 'off']),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type DataExportLearningModeRow = z.infer<
  typeof dataExportLearningModeRowSchema
>;

/**
 * [WI-1097] Teaching preferences export row.
 * Matches the `teaching_preferences` Drizzle table (packages/database/src/schema/assessments.ts).
 */
export const dataExportTeachingPreferenceRowSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  method: z.enum([
    'visual_diagrams',
    'step_by_step',
    'real_world_examples',
    'practice_problems',
  ]),
  analogyDomain: z
    .enum(['cooking', 'sports', 'building', 'music', 'nature', 'gaming'])
    .nullable(),
  nativeLanguage: z.string().nullable(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type DataExportTeachingPreferenceRow = z.infer<
  typeof dataExportTeachingPreferenceRowSchema
>;

/**
 * [WI-1097] Parking lot items export row.
 * Matches the `parking_lot_items` Drizzle table (packages/database/src/schema/sessions.ts).
 */
export const dataExportParkingLotItemRowSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  question: z.string(),
  explored: z.boolean(),
  createdAt: isoDateField,
});
export type DataExportParkingLotItemRow = z.infer<
  typeof dataExportParkingLotItemRowSchema
>;

/**
 * [WI-1097] Session embeddings export row.
 * Matches the `session_embeddings` Drizzle table (packages/database/src/schema/embeddings.ts).
 * The `embedding` column is a pgvector float array — typed as z.array(z.number()).
 */
export const dataExportSessionEmbeddingRowSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  embedding: z.array(z.number()),
  content: z.string(),
  createdAt: isoDateField,
});
export type DataExportSessionEmbeddingRow = z.infer<
  typeof dataExportSessionEmbeddingRowSchema
>;

/**
 * [WI-1097] Quota pools export row.
 * Matches the `quota_pools` Drizzle table (packages/database/src/schema/billing.ts).
 */
export const dataExportQuotaPoolRowSchema = z.object({
  id: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  monthlyLimit: z.number().int(),
  usedThisMonth: z.number().int(),
  dailyLimit: z.number().int().nullable(),
  usedToday: z.number().int(),
  cycleResetAt: isoDateField,
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type DataExportQuotaPoolRow = z.infer<
  typeof dataExportQuotaPoolRowSchema
>;

/**
 * [WI-1097] Top-up credits export row.
 * Matches the `top_up_credits` Drizzle table (packages/database/src/schema/billing.ts).
 * `profileId` is nullable (the column has no NOT NULL constraint).
 */
export const dataExportTopUpCreditRowSchema = z.object({
  id: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  profileId: z.string().uuid().nullable(),
  amount: z.number().int(),
  remaining: z.number().int(),
  purchasedAt: isoDateField,
  expiresAt: isoDateField,
  revenuecatTransactionId: z.string().nullable(),
  createdAt: isoDateField,
});
export type DataExportTopUpCreditRow = z.infer<
  typeof dataExportTopUpCreditRowSchema
>;

/**
 * [WI-1097] Needs-deepening topics export row.
 * Matches the `needs_deepening_topics` Drizzle table (packages/database/src/schema/assessments.ts).
 */
export const dataExportNeedsDeepeningTopicRowSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid(),
  status: z.enum(['active', 'pending_review', 'resolved']),
  consecutiveSuccessCount: z.number().int(),
  source: z.string(),
  concept: z.string().nullable(),
  misconception: z.string().nullable(),
  correction: z.string().nullable(),
  pendingExpiresAt: isoDateField.nullable(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type DataExportNeedsDeepeningTopicRow = z.infer<
  typeof dataExportNeedsDeepeningTopicRowSchema
>;

/**
 * [WI-1097] Family links export row.
 * Matches the `family_links` Drizzle table (packages/database/src/schema/profiles.ts).
 */
export const dataExportFamilyLinkRowSchema = z.object({
  id: z.string().uuid(),
  parentProfileId: z.string().uuid(),
  childProfileId: z.string().uuid(),
  createdAt: isoDateField,
});
export type DataExportFamilyLinkRow = z.infer<
  typeof dataExportFamilyLinkRowSchema
>;

/**
 * [WI-1097] Mentor activity ledger export row.
 * Matches the `mentor_activity_ledger` Drizzle table (packages/database/src/schema/activity-ledger.ts).
 * The `params` JSONB column is typed as a generic record (mirrors $type<Record<string, unknown>>).
 */
export const dataExportMentorActivityLedgerRowSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  actorJob: z.string(),
  kind: z.string(),
  params: z.record(z.string(), z.unknown()),
  createdAt: isoDateField,
  surfacedAt: isoDateField.nullable(),
});
export type DataExportMentorActivityLedgerRow = z.infer<
  typeof dataExportMentorActivityLedgerRowSchema
>;

export const accountDeletionResponseSchema = z.object({
  message: z.string(),
  gracePeriodEnds: isoDateField,
});

export type AccountDeletionResponse = z.infer<
  typeof accountDeletionResponseSchema
>;

export const cancelDeletionResponseSchema = z.object({
  message: z.string(),
});
export type CancelDeletionResponse = z.infer<
  typeof cancelDeletionResponseSchema
>;

export const accountDeletionStatusResponseSchema = z.object({
  scheduled: z.boolean(),
  deletionScheduledAt: isoDateField.nullable(),
  gracePeriodEnds: isoDateField.nullable(),
});

export type AccountDeletionStatusResponse = z.infer<
  typeof accountDeletionStatusResponseSchema
>;

export const accountEmailUpdateRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export type AccountEmailUpdateRequest = z.infer<
  typeof accountEmailUpdateRequestSchema
>;

export const accountEmailUpdateResponseSchema = z.object({
  email: z.string().email(),
});

export type AccountEmailUpdateResponse = z.infer<
  typeof accountEmailUpdateResponseSchema
>;

/**
 * [CRITICAL-2a] Client-triggerable account security events. The mobile client
 * pings the server after a successful Clerk-side credential mutation it
 * performs directly (password add / change) so the server can send an
 * out-of-band security-notification email. `email_changed` is NOT in this set:
 * it is dispatched server-side from `updateAccountEmailFromClerk`, never from a
 * client request, so a caller cannot spoof a "your email changed" alert.
 */
export const accountSecurityEventSchema = z.enum([
  'password_added',
  'password_changed',
]);

export type AccountSecurityEvent = z.infer<typeof accountSecurityEventSchema>;

/**
 * Server-side superset of `accountSecurityEventSchema`: adds `email_changed`,
 * which is dispatched only from the server (`updateAccountEmailFromClerk`) and
 * is never accepted in a client request — so a caller cannot spoof a
 * "your email changed" alert. Drives the security-notification email pipeline.
 */
export const securityNotificationTypeSchema = z.enum([
  'email_changed',
  'password_added',
  'password_changed',
]);

export type SecurityNotificationType = z.infer<
  typeof securityNotificationTypeSchema
>;

export const accountSecurityEventRequestSchema = z.object({
  event: accountSecurityEventSchema,
});

export type AccountSecurityEventRequest = z.infer<
  typeof accountSecurityEventRequestSchema
>;

export const accountSecurityEventResponseSchema = z.object({
  ok: z.literal(true),
});

export type AccountSecurityEventResponse = z.infer<
  typeof accountSecurityEventResponseSchema
>;

export const dataExportConsentSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  consentType: consentTypeSchema,
  status: consentStatusSchema,
  parentEmail: z.string().email().nullable(),
  requestedAt: isoDateField,
  respondedAt: isoDateField.nullable(),
});

export const dataExportSchema = z.object({
  account: z.object({
    email: z.string().email(),
    createdAt: isoDateField,
  }),
  profiles: z.array(publicProfileSchema),
  consentStates: z.array(dataExportConsentSchema),
  // GDPR Article 15 — all personal data.
  // [BUG-206] Each table is `dataExportRowSchema` (centralised passthrough)
  // instead of the previous inline `z.record(z.string(), z.unknown())`.
  // Per-table aliases above let future PRs tighten one table at a time.
  // [WI-1097] All 19 deferred aliases tightened to real z.object schemas.
  subjects: z.array(dataExportSubjectRowSchema).optional(),
  curricula: z.array(dataExportCurriculumRowSchema).optional(),
  curriculumTopics: z.array(dataExportCurriculumTopicRowSchema).optional(),
  learningSessions: z.array(dataExportLearningSessionRowSchema).optional(),
  sessionEvents: z.array(dataExportSessionEventRowSchema).optional(),
  sessionSummaries: z.array(dataExportSessionSummaryRowSchema).optional(),
  retentionCards: z.array(dataExportRetentionCardRowSchema).optional(),
  assessments: z.array(dataExportAssessmentRowSchema).optional(),
  xpLedger: z.array(dataExportXpLedgerRowSchema).optional(),
  streaks: z.array(dataExportStreakRowSchema).optional(),
  notificationPreferences: z
    .array(dataExportNotificationPreferenceRowSchema)
    .optional(),
  learningModes: z.array(dataExportLearningModeRowSchema).optional(),
  teachingPreferences: z
    .array(dataExportTeachingPreferenceRowSchema)
    .optional(),
  parkingLotItems: z.array(dataExportParkingLotItemRowSchema).optional(),
  sessionEmbeddings: z.array(dataExportSessionEmbeddingRowSchema).optional(),
  subscriptions: z.array(dataExportSubscriptionRowSchema).optional(),
  quotaPools: z.array(dataExportQuotaPoolRowSchema).optional(),
  topUpCredits: z.array(dataExportTopUpCreditRowSchema).optional(),
  needsDeepeningTopics: z
    .array(dataExportNeedsDeepeningTopicRowSchema)
    .optional(),
  familyLinks: z.array(dataExportFamilyLinkRowSchema).optional(),
  learningProfiles: z.array(learningProfileSchema).optional(),
  // [WI-679] GDPR Art-15 gap: mentor_activity_ledger was missing from the
  // export — erasure via FK cascade was covered but portability was not.
  mentorActivityLedger: z
    .array(dataExportMentorActivityLedgerRowSchema)
    .optional(),
  exportedAt: isoDateField,
});

export type DataExport = z.infer<typeof dataExportSchema>;
