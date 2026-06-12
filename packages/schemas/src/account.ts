import { z } from 'zod';
import { isoDateField } from './common.ts';
import { profileSchema } from './profiles.ts';
import { consentStatusSchema, consentTypeSchema } from './consent.ts';
import { learningProfileSchema } from './learning-profiles.ts';

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

/**
 * Per-table row schemas. Today they are all aliases of `dataExportRowSchema`;
 * PRs that author a stricter schema for, e.g., `subjects` should replace
 * the alias here.
 */
export const dataExportSubjectRowSchema = dataExportRowSchema;
export const dataExportCurriculumRowSchema = dataExportRowSchema;
export const dataExportCurriculumTopicRowSchema = dataExportRowSchema;
export const dataExportLearningSessionRowSchema = dataExportRowSchema;
export const dataExportSessionEventRowSchema = dataExportRowSchema;
export const dataExportSessionSummaryRowSchema = dataExportRowSchema;
export const dataExportRetentionCardRowSchema = dataExportRowSchema;
export const dataExportAssessmentRowSchema = dataExportRowSchema;
export const dataExportXpLedgerRowSchema = dataExportRowSchema;
export const dataExportStreakRowSchema = dataExportRowSchema;
export const dataExportNotificationPreferenceRowSchema = dataExportRowSchema;
export const dataExportLearningModeRowSchema = dataExportRowSchema;
export const dataExportTeachingPreferenceRowSchema = dataExportRowSchema;
export const dataExportParkingLotItemRowSchema = dataExportRowSchema;
export const dataExportSessionEmbeddingRowSchema = dataExportRowSchema;
export const dataExportSubscriptionRowSchema = dataExportRowSchema;
export const dataExportQuotaPoolRowSchema = dataExportRowSchema;
export const dataExportTopUpCreditRowSchema = dataExportRowSchema;
export const dataExportNeedsDeepeningTopicRowSchema = dataExportRowSchema;
export const dataExportFamilyLinkRowSchema = dataExportRowSchema;
export const dataExportMentorActivityLedgerRowSchema = dataExportRowSchema;

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
  profiles: z.array(profileSchema),
  consentStates: z.array(dataExportConsentSchema),
  // GDPR Article 15 — all personal data.
  // [BUG-206] Each table is `dataExportRowSchema` (centralised passthrough)
  // instead of the previous inline `z.record(z.string(), z.unknown())`.
  // Per-table aliases above let future PRs tighten one table at a time.
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
