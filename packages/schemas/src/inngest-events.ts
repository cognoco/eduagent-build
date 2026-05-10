import { z } from 'zod';

export const filingTimedOutEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  sessionType: z.string().nullable(),
  timeoutMs: z.number().int().positive(),
  timestamp: z.string().datetime(),
});
export type FilingTimedOutEvent = z.infer<typeof filingTimedOutEventSchema>;

export const filingRetryEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  sessionMode: z.enum(['freeform', 'homework']),
  sessionTranscript: z.string().optional(),
});
export type FilingRetryEvent = z.infer<typeof filingRetryEventSchema>;

export const filingRetryCompletedEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  timestamp: z.string().datetime(),
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
  timestamp: z.string().datetime(),
});
export type FilingResolvedEvent = z.infer<typeof filingResolvedEventSchema>;

export const subjectCurriculumPrewarmRequestedEventSchema = z.object({
  version: z.literal(1),
  subjectId: z.string().uuid(),
  profileId: z.string().uuid(),
  bookId: z.string().uuid(),
  timestamp: z.string().datetime(),
});
export type SubjectCurriculumPrewarmRequestedEvent = z.infer<
  typeof subjectCurriculumPrewarmRequestedEventSchema
>;

export const orphanPersistFailedEventSchema = z.object({
  profileId: z.string().uuid(),
  draftId: z.string().uuid(),
  route: z.string(),
  reason: z.string().nullable(),
  error: z.string(),
});
export type OrphanPersistFailedEvent = z.infer<
  typeof orphanPersistFailedEventSchema
>;

export const appNotificationSuppressedEventSchema = z.object({
  profileId: z.string().uuid(),
  notificationType: z.enum(['daily_reminder', 'review_reminder']),
  reason: z.string(),
  timestamp: z.string().datetime(),
});
export type AppNotificationSuppressedEvent = z.infer<
  typeof appNotificationSuppressedEventSchema
>;

export const reviewCalibrationRequestedEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  topicId: z.string().uuid(),
  learnerMessage: z.string().min(1),
  topicTitle: z.string().min(1),
  timestamp: z.string().datetime(),
});
export type ReviewCalibrationRequestedEvent = z.infer<
  typeof reviewCalibrationRequestedEventSchema
>;

export const topicProbeRequestedEventSchema = z.object({
  version: z.literal(1),
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid(),
  learnerMessage: z.string().min(1),
  topicTitle: z.string().min(1),
  timestamp: z.string().datetime(),
});
export type TopicProbeRequestedEvent = z.infer<
  typeof topicProbeRequestedEventSchema
>;

// ---------------------------------------------------------------------------
// Retention SLO monitoring events (BUG-991 / BUG-992 / BUG-993 / BUG-994)
// ---------------------------------------------------------------------------

/** BUG-991 — emitted when LLM summary generation fails for a session. */
export const sessionSummaryFailedEventSchema = z.object({
  profileId: z.string(),
  sessionId: z.string(),
  sessionSummaryId: z.string().nullable(),
  timestamp: z.string(),
});
export type SessionSummaryFailedEvent = z.infer<
  typeof sessionSummaryFailedEventSchema
>;

/** BUG-992 — emitted on successful transcript purge (failure rate = 1 - success rate). */
export const sessionTranscriptPurgedEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string(),
  sessionSummaryId: z.string().nullable(),
  eventsDeleted: z.number().int().nonnegative(),
  embeddingRowsReplaced: z.number().int().nonnegative(),
  purgedAt: z.string().optional(),
});
export type SessionTranscriptPurgedEvent = z.infer<
  typeof sessionTranscriptPurgedEventSchema
>;

/** BUG-993 — emitted when sessions are past day-37 without llmSummary/learnerRecap. */
export const sessionPurgeDelayedEventSchema = z.object({
  delayedCount: z.number().int().positive(),
  sessionIds: z.array(z.string()),
  missingPreconditionCount: z.number().int().nonnegative(),
  timestamp: z.string(),
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
  timestamp: z.string(),
});
export type SummaryReconciliationRequeuedEvent = z.infer<
  typeof summaryReconciliationRequeuedEventSchema
>;

// ---------------------------------------------------------------------------
// Ask-classification observability events (CCR-PR126-NEW-2)
// ---------------------------------------------------------------------------

export const classificationCompletedEventSchema = z.object({
  sessionId: z.string().optional(),
  exchangeCount: z.number().optional(),
  subjectId: z.string().optional(),
  subjectName: z.string().optional(),
  confidence: z.number().optional(),
});
export type ClassificationCompletedEvent = z.infer<
  typeof classificationCompletedEventSchema
>;

export const classificationSkippedEventSchema = z.object({
  sessionId: z.string().optional(),
  exchangeCount: z.number().optional(),
  reason: z.string().optional(),
  topConfidence: z.number().optional(),
});
export type ClassificationSkippedEvent = z.infer<
  typeof classificationSkippedEventSchema
>;

export const classificationFailedEventSchema = z.object({
  sessionId: z.string().optional(),
  exchangeCount: z.number().optional(),
  error: z.string().optional(),
});
export type ClassificationFailedEvent = z.infer<
  typeof classificationFailedEventSchema
>;
