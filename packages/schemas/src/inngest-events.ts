import { z } from 'zod';
import { isoDateField } from './common.ts';
import { childCapNotificationKindSchema } from './notifications.ts';
import { subscriptionStatusSchema, subscriptionTierSchema } from './billing.ts';
import { conversationLanguageSchema } from './profiles.ts';

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
// [WI-996] sessionMode defaults to 'freeform' so any in-flight events
// dispatched before sessionMode was added to the payload are not
// dead-lettered on retry: old events omit the field and would throw a
// ZodError without the default.
export const filingRetryEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  sessionMode: z.enum(['freeform', 'homework']).default('freeform'),
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

// PII egress: No `message` / `supportTo` / `metaLines` fields: Inngest
// persists event payloads in its third-party event store, so the user's
// feedback free-text must never ride in the event. The feedback route parks
// the full payload in the first-party `feedback_retry_queue` row and the
// event carries only that row's opaque id; the consumer
// (feedback-delivery-failed) rehydrates the payload by id (scoped by
// profileId) and re-derives the support address from config.
export const feedbackDeliveryFailedEventSchema = z.object({
  retryId: z.string().uuid(),
  // Not always a uuid: the feedback route's profile context can be the
  // literal 'unknown'.
  profileId: z.string().min(1),
  // [WI-1066] Renamed from `userId` to make explicit this is the Clerk user ID
  // (not a profile ID), disambiguating the two identity namespaces in events.
  clerkUserId: z.string().min(1),
});
export type FeedbackDeliveryFailedEvent = z.infer<
  typeof feedbackDeliveryFailedEventSchema
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

// ---------------------------------------------------------------------------
// [BUG-783 / BUG-449] RevenueCat SUBSCRIBER_ALIAS merge event
//
// Dispatched by the RevenueCat webhook handler (legacy + v2) when a
// SUBSCRIBER_ALIAS arrives and the `transferred_from` identity still held an
// active subscription — the revenue-loss scenario. The webhook downgrades the
// from-side row synchronously (BUG-833) and dispatches this event so the
// billing-alias-merge worker reconciles the surviving (transferred_to)
// identity using the PRE-DOWNGRADE snapshot captured here. The snapshot is
// authoritative: by worker-run time the from-side row has already been forced
// to free/expired, so the worker cannot re-read the original entitlement.
//
// Reconciliation is "best of both, user-favorable, never refund":
//   - subscription: keep the more valuable tier (free<plus<family<pro),
//     tiebreak by latest currentPeriodEnd; never downgrade the survivor.
//   - top-up credits: target ends with MAX(from, to) remaining, not the sum
//     (summing invites abuse via deliberate re-aliasing).
// ---------------------------------------------------------------------------
export const billingAliasReceivedEventSchema = z.object({
  /** RevenueCat event id — the idempotency key for the merge. */
  eventId: z.string().min(1),
  /** Clerk user id the entitlement was transferred FROM (downgraded side). */
  fromAppUserId: z.string().min(1),
  /** Clerk user id the entitlement was transferred TO (surviving side). */
  toAppUserId: z.string().min(1),
  /** Internal account id of the from-side (resolved at dispatch time). */
  fromAccountId: z.string().min(1),
  /** Subscription id of the from-side (pre-downgrade). */
  fromSubscriptionId: z.string().min(1),
  /**
   * Pre-downgrade snapshot of the from-side entitlement. Captured before the
   * synchronous BUG-833 downgrade so the worker can reconcile the survivor.
   */
  fromSnapshot: z.object({
    tier: subscriptionTierSchema,
    status: subscriptionStatusSchema,
    currentPeriodEnd: isoDateField.nullable(),
    trialEndsAt: isoDateField.nullable(),
    /** Remaining (unexpired) top-up credits on the from-side at alias time. */
    topUpRemaining: z.number().int().nonnegative(),
  }),
  timestamp: isoDateField,
});
export type BillingAliasReceivedEvent = z.infer<
  typeof billingAliasReceivedEventSchema
>;

// ---------------------------------------------------------------------------
// S5 visibility contract events
// ---------------------------------------------------------------------------

// PII egress: supportership revocation/graduation events carry opaque ids and
// timestamps only. Display names are resolved from first-party DB when notices
// render, never serialized into Inngest's third-party event store.
export const supportershipUnlinkedEventSchema = z.object({
  supportershipId: z.string().uuid(),
  contractId: z.string().uuid().optional(),
  supporteePersonId: z.string().uuid(),
  supporterPersonId: z.string().uuid(),
  revokedAt: isoDateField,
});
export type SupportershipUnlinkedEvent = z.infer<
  typeof supportershipUnlinkedEventSchema
>;

export const personGraduatedEventSchema = z.object({
  personId: z.string().uuid(),
  occurredAt: isoDateField,
});
export type PersonGraduatedEvent = z.infer<typeof personGraduatedEventSchema>;

// PII egress: No raw `learnerMessage` / `topicTitle` fields: Inngest persists
// event payloads in its third-party event store. The payload carries an opaque
// reference (`learnerMessageEventId`, the session_events row id of the
// learner's calibration answer); the consumer (review-calibration-grade)
// rehydrates the message content and the topic title from the DB, scoped by
// profileId. Legacy in-flight events with the raw-text shape fail safeParse and
// are skipped by the consumer. (WI-620 — same leak class as WI-577's
// topic-probe site, converted to reference-and-rehydrate.)
export const reviewCalibrationRequestedEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  topicId: z.string().uuid(),
  learnerMessageEventId: z.string().uuid(),
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

// PII egress: No raw `reply` / `precedingLearnerMessage` text. Inngest persists
// event payloads in its third-party event store, so the tutor reply under review
// and the learner's preceding message must never ride in the event. The payload
// carries opaque `session_events` row references — `replyEventId` (the
// ai_response row) and the nullable `precedingLearnerMessageEventId` (the
// immediately-preceding user_message row, null when the reply opens the
// exchange). The consumer (judge-suitability) rehydrates both texts from the DB,
// scoped by profileId, inside ONE step closure and returns only the non-PII
// verdict projection. (MMT-ADR-0016 §2 data minimization — same
// reference-and-rehydrate class as WI-620's review-calibration site.)
export const suitabilityJudgeRequestedEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  /** session_events row id of the tutor reply under review (eventType ai_response). */
  replyEventId: z.string().uuid(),
  /**
   * session_events row id of the immediately-preceding learner message, or null
   * when the reply opens the exchange. The data-minimization cap (§2): at most
   * one preceding turn.
   */
  precedingLearnerMessageEventId: z.string().uuid().nullable(),
  /** Coarse age band — frames age-appropriateness without a birth year. */
  ageBracket: z.enum(['child', 'adolescent', 'adult']),
  /** Tutor model vendor — the judge must not share it (§2 vendor-independence). */
  tutorVendor: z.string().min(1),
  /** Tutor model id — recorded on the verdict metric for per-model calibration. */
  tutorModel: z.string().min(1),
  /** Exchange flow label — recorded on the verdict metric. */
  flow: z.string().min(1),
  /** Optional tutor-prose language hint so the judge reads the exchange correctly. */
  conversationLanguage: conversationLanguageSchema.optional(),
  timestamp: isoDateField,
});
export type SuitabilityJudgeRequestedEvent = z.infer<
  typeof suitabilityJudgeRequestedEventSchema
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

// ---------------------------------------------------------------------------
// Cron fan-out event schemas — [WI-985] typed event data for parse-at-boundary
// ---------------------------------------------------------------------------

/** Fan-out payload fired by monthlyReportCron → monthlyReportGenerate. */
export const monthlyReportGenerateEventSchema = z.object({
  parentId: z.string().uuid(),
  childId: z.string().uuid(),
});
export type MonthlyReportGenerateEvent = z.infer<
  typeof monthlyReportGenerateEventSchema
>;

/** Fan-out payload fired by dailySnapshotCron → dailySnapshotRefresh. */
export const snapshotRefreshEventSchema = z.object({
  profileId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type SnapshotRefreshEvent = z.infer<typeof snapshotRefreshEventSchema>;

// ---------------------------------------------------------------------------
// app/session.completed — trigger event schema
//
// Models BOTH dispatch shapes:
//   (a) Primary path (session-filing-dispatch.ts) — sends all fields.
//   (b) Auto-close path (session-stale-cleanup.ts) — omits mode,
//       escalationRungs, exchangeCount, qualityRating; always sends
//       summaryStatus='auto_closed' + reason='silence_timeout'.
//
// safeParse at consumers (session-completed.ts, progress-summary.ts) throws
// NonRetriableError on parse failure so malformed payloads dead-letter
// immediately instead of silently coercing values.
//
// PII egress: no transcript content — payload carries only opaque ids,
// numeric scalars, and timestamps. Inngest persists event payloads in its
// third-party event store; transcripts are rehydrated from first-party DB.
// ---------------------------------------------------------------------------
export const sessionCompletedEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  topicId: z.string().uuid().nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  sessionType: z.string().nullable().optional(),
  verificationType: z.string().nullable().optional(),
  /** Present on primary path; absent on auto_closed (stale-cleanup) path. */
  mode: z.string().optional(),
  /** Topic ids for interleaved sessions — UUIDs in production; kept as
   *  z.string() (not .uuid()) for backward compatibility with in-flight events
   *  and unit-test fixtures that use short string identifiers. */
  interleavedTopicIds: z.array(z.string()).optional(),
  /** Present on primary path; absent on auto_closed path. */
  escalationRungs: z.array(z.number().int()).optional(),
  /** May be absent on auto_closed path; re-read from DB by consumer when null. */
  exchangeCount: z.number().int().nonnegative().optional(),
  /** qualityRating — must be a number when present. Highest-risk field:
   *  a non-numeric value (e.g. string 'bad') would silently corrupt SM-2
   *  scheduling. The business-logic clamp to [0, 5] lives in the consumer
   *  (vocabulary service); the schema gate enforces the type only. */
  qualityRating: z.number().optional(),
  summaryStatus: z.enum([
    'pending',
    'submitted',
    'accepted',
    'skipped',
    'auto_closed',
  ]),
  /** reason — controls isUnattended flag; must be a string when present. */
  reason: z.string().optional(),
  // isoDateField — neon-serverless may return raw Date; union handles both.
  // Optional: auto-closed path sends timestamp but some legacy in-flight events
  // may omit it; consumers fall back to new Date() when absent.
  timestamp: isoDateField.optional(),
});
export type SessionCompletedEvent = z.infer<typeof sessionCompletedEventSchema>;

// ---------------------------------------------------------------------------
// app/billing.subscription_store_teardown_requested — store-provider teardown
// after a v2 whole-org GDPR erasure (WI-885).
//
// Dispatched by the scheduled-deletion workflow AFTER the DB erasure commits,
// carrying the Stripe/RevenueCat identifiers pre-read before the subscription
// rows were deleted. The consumer (billing-subscription-store-teardown) cancels
// the Stripe subscription and deletes the RevenueCat customer. The per-target
// schema lives here (not in apps/api) so the producer (the deletion-v2 service
// that maps DB rows) and the consumer (the inngest function that safeParses the
// payload) share ONE source of truth — without a services → inngest import and
// matching the convention that all event payloads live in @eduagent/schemas.
//
// PII egress: opaque provider identifiers + tier/status scalars only; no names
// or transcript content. planTier/status are loose strings (not the billing
// enums) because the payload only forwards them for observability — the teardown
// worker keys solely on the Stripe/RevenueCat identifiers.
// ---------------------------------------------------------------------------
export const subscriptionStoreTeardownTargetSchema = z.object({
  subscriptionId: z.string().min(1),
  planTier: z.string().min(1),
  status: z.string().min(1),
  stripe: z.object({
    customerId: z.string().min(1).nullable(),
    subscriptionId: z.string().min(1).nullable(),
  }),
  revenueCat: z.object({
    originalAppUserId: z.string().min(1).nullable(),
    storeProductId: z.string().min(1).nullable(),
    storePlatform: z.string().min(1).nullable(),
  }),
});
export type SubscriptionStoreTeardownTarget = z.infer<
  typeof subscriptionStoreTeardownTargetSchema
>;

export const subscriptionStoreTeardownRequestedDataSchema = z.object({
  accountId: z.string().min(1),
  identityVersion: z.literal('v2'),
  reason: z.literal('whole_org_erasure'),
  requestedAt: z.string().min(1),
  subscriptions: z.array(subscriptionStoreTeardownTargetSchema).min(1),
});
export type SubscriptionStoreTeardownRequestedData = z.infer<
  typeof subscriptionStoreTeardownRequestedDataSchema
>;
