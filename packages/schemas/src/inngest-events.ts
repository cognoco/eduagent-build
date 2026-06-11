import { z } from 'zod';
import { isoDateField } from './common.ts';
import { childCapNotificationKindSchema } from './notifications.ts';

export const filingTimedOutEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  sessionType: z.string().nullable(),
  timeoutMs: z.number().int().positive(),
  timestamp: isoDateField,
});
export type FilingTimedOutEvent = z.infer<typeof filingTimedOutEventSchema>;

// PII egress: No `sessionTranscript` field: Inngest persists
// event payloads in its third-party event store, so a minor's transcript
// must never ride in the event. The consumer (freeform-filing) rehydrates
// the transcript from the DB by sessionId, scoped by profileId.
export const filingRetryEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  sessionMode: z.enum(['freeform', 'homework']),
});
export type FilingRetryEvent = z.infer<typeof filingRetryEventSchema>;

export const sessionAutoFileRequestedEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  requestedAt: isoDateField,
  reason: z.enum([
    'freeform_session_closed',
    'user_requested',
    'retry',
    'restore',
  ]),
  dispatchId: z.string().min(1).max(128),
});
export type SessionAutoFileRequestedEvent = z.infer<
  typeof sessionAutoFileRequestedEventSchema
>;

export const filingRetryCompletedEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  timestamp: isoDateField,
});
export type FilingRetryCompletedEvent = z.infer<
  typeof filingRetryCompletedEventSchema
>;

export const filingResolvedEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  resolution: z.enum([
    'late_completion',
    'retry_succeeded',
    'unrecoverable',
    'recovered',
    'recovered_after_window',
  ]),
  timestamp: isoDateField,
});
export type FilingResolvedEvent = z.infer<typeof filingResolvedEventSchema>;

export const subjectCurriculumPrewarmRequestedEventSchema = z.object({
  version: z.literal(1),
  subjectId: z.string().uuid(),
  profileId: z.string().uuid(),
  bookId: z.string().uuid(),
  timestamp: isoDateField,
});
export type SubjectCurriculumPrewarmRequestedEvent = z.infer<
  typeof subjectCurriculumPrewarmRequestedEventSchema
>;

export const subjectCurriculumRetryRequestedEventSchema = z.object({
  version: z.literal(1),
  subjectId: z.string().uuid(),
  profileId: z.string().uuid(),
  bookId: z.string().uuid(),
  timestamp: isoDateField,
});
export type SubjectCurriculumRetryRequestedEvent = z.infer<
  typeof subjectCurriculumRetryRequestedEventSchema
>;

export const orphanPersistFailedEventSchema = z.object({
  profileId: z.string().uuid(),
  draftId: z.string().uuid(),
  route: z.string(),
  reason: z.string().nullable(),
  // Callers must scrub PII before constructing this message — raw transcript
  // fragments, image URLs with tokens, or retried message bodies must not be
  // included. Cap prevents unbounded payloads in Inngest observability sinks.
  error: z.string().max(2000),
});
export type OrphanPersistFailedEvent = z.infer<
  typeof orphanPersistFailedEventSchema
>;

export const appNotificationSuppressedEventSchema = z.object({
  profileId: z.string().uuid(),
  notificationType: z.enum(['daily_reminder', 'review_reminder']),
  reason: z.string(),
  timestamp: isoDateField,
});
export type AppNotificationSuppressedEvent = z.infer<
  typeof appNotificationSuppressedEventSchema
>;

export const billingProfileQuotaExhaustedEventSchema = z.object({
  subscriptionId: z.string().min(1),
  profileId: z.string().min(1),
  kind: childCapNotificationKindSchema,
  resetsAt: isoDateField,
  occurredAt: isoDateField,
});
export type BillingProfileQuotaExhaustedEvent = z.infer<
  typeof billingProfileQuotaExhaustedEventSchema
>;

export const reviewCalibrationRequestedEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  topicId: z.string().uuid(),
  learnerMessage: z.string().min(1),
  topicTitle: z.string().min(1),
  timestamp: isoDateField,
});
export type ReviewCalibrationRequestedEvent = z.infer<
  typeof reviewCalibrationRequestedEventSchema
>;

// PII egress: No raw `learnerMessage` / `topicTitle` fields: Inngest
// persists event payloads in its third-party event store. The payload
// carries an opaque reference (`learnerMessageEventId`, the session_events
// row id of the learner's probe answer); the consumer (topic-probe-extract)
// rehydrates the message content and the topic title from the DB, scoped by
// profileId. Legacy in-flight events with the raw-text shape fail safeParse
// and are skipped by the consumer.
export const topicProbeRequestedEventSchema = z.object({
  version: z.literal(1),
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid(),
  learnerMessageEventId: z.string().uuid(),
  timestamp: isoDateField,
});
export type TopicProbeRequestedEvent = z.infer<
  typeof topicProbeRequestedEventSchema
>;

export const streakRecordEventSchema = z.object({
  profileId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type StreakRecordEvent = z.infer<typeof streakRecordEventSchema>;

// ---------------------------------------------------------------------------
// Retention SLO monitoring events (BUG-991 / BUG-992 / BUG-993 / BUG-994)
// ---------------------------------------------------------------------------

/** BUG-991 — emitted when LLM summary generation fails for a session. */
export const sessionSummaryFailedEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  sessionSummaryId: z.string().uuid().nullable(),
  // [SC-03] isoDateField — neon-serverless may return raw Date; union handles both.
  timestamp: isoDateField,
});
export type SessionSummaryFailedEvent = z.infer<
  typeof sessionSummaryFailedEventSchema
>;

/** BUG-992 — emitted on successful transcript purge (failure rate = 1 - success rate). */
export const sessionTranscriptPurgedEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  sessionSummaryId: z.string().uuid().nullable(),
  eventsDeleted: z.number().int().nonnegative(),
  embeddingRowsReplaced: z.number().int().nonnegative(),
  // [SC-03] isoDateField — neon-serverless may return raw Date; union handles both.
  purgedAt: isoDateField.optional(),
});
export type SessionTranscriptPurgedEvent = z.infer<
  typeof sessionTranscriptPurgedEventSchema
>;

/** BUG-993 — emitted when sessions are past day-37 without llmSummary/learnerRecap. */
export const sessionPurgeDelayedEventSchema = z.object({
  delayedCount: z.number().int().positive(),
  sessionIds: z.array(z.string().uuid()),
  missingPreconditionCount: z.number().int().nonnegative(),
  // [SC-03] isoDateField — neon-serverless may return raw Date; union handles both.
  timestamp: isoDateField,
});
export type SessionPurgeDelayedEvent = z.infer<
  typeof sessionPurgeDelayedEventSchema
>;

/** BUG-994 — emitted when reconciliation cron requeues sessions for summary work. */
export const summaryReconciliationRequeuedEventSchema = z.object({
  queryARequeued: z.number().int().nonnegative(),
  queryBRequeued: z.number().int().nonnegative(),
  queryCRequeued: z.number().int().nonnegative(),
  totalRequeued: z.number().int().positive(),
  // [SC-03] isoDateField — neon-serverless may return raw Date; union handles both.
  timestamp: isoDateField,
});
export type SummaryReconciliationRequeuedEvent = z.infer<
  typeof summaryReconciliationRequeuedEventSchema
>;

// ---------------------------------------------------------------------------
// Ask-classification observability events (CCR-PR126-NEW-2)
// ---------------------------------------------------------------------------

// [CR-2026-05-21-175 / BUG-580] These payloads previously had every field
// optional, so a misconfigured sender could deliver an empty payload and
// the observability handler would happily log 'unknown' for every
// dimension — defeating the purpose of the observe terminus. The senders
// in ask-silent-classify.ts ALWAYS supply the fields below for the
// success + skipped paths, so requiring them here is the correct
// contract. The failure path may legitimately send the event with no
// sessionId / exchangeCount when the input payload was malformed before
// classification ran (see ask-silent-classify.ts:69-78), so those two
// stay optional on the failed schema — only error is required there.
export const classificationCompletedEventSchema = z.object({
  sessionId: z.string(),
  exchangeCount: z.number(),
  subjectId: z.string(),
  subjectName: z.string(),
  confidence: z.number(),
});
export type ClassificationCompletedEvent = z.infer<
  typeof classificationCompletedEventSchema
>;

export const classificationSkippedEventSchema = z.object({
  sessionId: z.string(),
  exchangeCount: z.number(),
  reason: z.string(),
  topConfidence: z.number(),
});
export type ClassificationSkippedEvent = z.infer<
  typeof classificationSkippedEventSchema
>;

export const classificationFailedEventSchema = z.object({
  sessionId: z.string().optional(),
  exchangeCount: z.number().optional(),
  // Callers must scrub PII before constructing this message — raw transcript
  // fragments, image URLs with tokens, or retried message bodies must not be
  // included. Cap prevents unbounded payloads in Inngest observability sinks.
  error: z.string().min(1).max(2000),
});
export type ClassificationFailedEvent = z.infer<
  typeof classificationFailedEventSchema
>;

// ---------------------------------------------------------------------------
// Summary / Learner-Recap events (#428, #429)
// ---------------------------------------------------------------------------

export const summaryEventPayloadSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  timestamp: isoDateField,
  subjectId: z.string().uuid().nullable().optional(),
  topicId: z.string().uuid().nullable().optional(),
  sessionSummaryId: z.string().uuid().optional(),
});
export type SummaryEventPayload = z.infer<typeof summaryEventPayloadSchema>;

// ---------------------------------------------------------------------------
// Book pre-generation event (#426)
// ---------------------------------------------------------------------------

export const bookTopicsGeneratedEventSchema = z.object({
  subjectId: z.string().uuid(),
  bookId: z.string().uuid(),
  profileId: z.string().uuid(),
  timestamp: isoDateField,
});
export type BookTopicsGeneratedEvent = z.infer<
  typeof bookTopicsGeneratedEventSchema
>;

// ---------------------------------------------------------------------------
// Session-completed observability events (Bug-369)
// ---------------------------------------------------------------------------

/** Emitted on successful LLM summary generation. */
export const sessionSummaryGeneratedEventSchema = z.object({
  profileId: z.string(),
  sessionId: z.string(),
  sessionSummaryId: z.string().nullable().optional(),
  sessionState: z.string().optional(),
  topicsCount: z.number().optional(),
  narrativeLength: z.number().optional(),
  // [SC-03] isoDateField — neon-serverless may return raw Date; union handles both.
  timestamp: isoDateField,
});
export type SessionSummaryGeneratedEvent = z.infer<
  typeof sessionSummaryGeneratedEventSchema
>;

/** Emitted when >=1 soft step fails during session completion. */
export const sessionCompletedWithErrorsEventSchema = z.object({
  sessionId: z.string(),
  profileId: z.string(),
  failedSteps: z.array(
    z.object({
      step: z.string(),
      error: z.string().nullable(),
    }),
  ),
  // [SC-03] isoDateField — neon-serverless may return raw Date; union handles both.
  timestamp: isoDateField,
});
export type SessionCompletedWithErrorsEvent = z.infer<
  typeof sessionCompletedWithErrorsEventSchema
>;

// ---------------------------------------------------------------------------
// Filing auto-retry observability event (Bug-369)
// ---------------------------------------------------------------------------

/** Emitted each time the filing-timed-out observer claims a retry slot. */
export const filingAutoRetryAttemptedEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  attemptNumber: z.number().int().positive(),
  // [SC-03] isoDateField — neon-serverless may return raw Date; union handles both.
  timestamp: isoDateField,
});
export type FilingAutoRetryAttemptedEvent = z.infer<
  typeof filingAutoRetryAttemptedEventSchema
>;

// ---------------------------------------------------------------------------
// Summary-reconciliation scan observability event (Bug-369)
// ---------------------------------------------------------------------------

/** Emitted at the start of each summary-reconciliation cron run. */
export const summaryReconciliationScannedEventSchema = z.object({
  queryACount: z.number().int().nonnegative(),
  queryBCount: z.number().int().nonnegative(),
  queryCCount: z.number().int().nonnegative(),
  totalScanned: z.number().int().nonnegative(),
  // [SC-03] isoDateField — neon-serverless may return raw Date; union handles both.
  timestamp: isoDateField,
});
export type SummaryReconciliationScannedEvent = z.infer<
  typeof summaryReconciliationScannedEventSchema
>;
