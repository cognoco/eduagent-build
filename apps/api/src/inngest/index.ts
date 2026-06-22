import { inngest } from './client';
import { consentReminder } from './functions/consent-reminders';
import { consentRevocation } from './functions/consent-revocation';
import { archiveCleanup } from './functions/archive-cleanup';
import { webhookIdempotencyPurge } from './functions/webhook-idempotency-purge';
import { scheduledDeletion } from './functions/account-deletion';
import { sessionCompleted } from './functions/session-completed';
import { sessionStaleCleanup } from './functions/session-stale-cleanup';
import { trialExpiry } from './functions/trial-expiry';
import { trialNotificationSend } from './functions/trial-notification-send';
import { quotaReset } from './functions/quota-reset';
import { topupExpiryReminder } from './functions/topup-expiry-reminder';
import { topupExpiryReminderSend } from './functions/topup-expiry-reminder-send';
import { billingTrialSubscriptionFailed } from './functions/billing-trial-subscription-failed';
import { trialExpiryFailureObserve } from './functions/trial-expiry-failure-observe';
import { paymentFailedObserve } from './functions/payment-failed-observe';
import { billingAliasMerge } from './functions/billing-alias-merge';
import { exchangeEmptyReplyFallback } from './functions/exchange-empty-reply-fallback';
import {
  askClassificationCompletedObserve,
  askClassificationSkippedObserve,
  askClassificationFailedObserve,
} from './functions/ask-classification-observe';
import {
  askGateDecisionObserve,
  askGateTimeoutObserve,
} from './functions/ask-gate-observe';
import { emailBouncedObserve } from './functions/email-bounced-observe';
import { subjectAutoArchive } from './functions/subject-auto-archive';
import { bookPreGeneration } from './functions/book-pre-generation';
import { recallNudge } from './functions/recall-nudge';
import { recallNudgeSend } from './functions/recall-nudge-send';
import { postSessionSuggestions } from './functions/post-session-suggestions';
import { freeformFilingRetry } from './functions/freeform-filing';
import { autoFileSession } from './functions/auto-file-session';
import { filingCompletedObserve } from './functions/filing-completed-observe';
import { filingTimedOutObserve } from './functions/filing-timed-out-observe';
import { filingStrandedBackfill } from './functions/filing-stranded-backfill';
import { reviewDueScan } from './functions/review-due-scan';
import { reviewDueSend } from './functions/review-due-send';
import { dailyReminderScan } from './functions/daily-reminder-scan';
import { dailyReminderSend } from './functions/daily-reminder-send';
import {
  askSilentClassify,
  askSilentClassifyOnFailure,
} from './functions/ask-silent-classify';
import {
  dailySnapshotCron,
  dailySnapshotRefresh,
} from './functions/daily-snapshot';
// [BUG-698] progress-backfill (one-shot orchestrator + per-profile worker)
// removed 2026-04-28. Both functions were wired to Inngest events that no
// production code path ever sends, creating false confidence that the
// backfill was operational. If a future migration needs to backfill, re-add
// the function alongside its trigger (admin endpoint, cron, or migration
// script) in the same change.
import {
  weeklyProgressPushCron,
  weeklyProgressPushGenerate,
} from './functions/weekly-progress-push';
import {
  monthlyReportCron,
  monthlyReportGenerate,
} from './functions/monthly-report-cron';
import {
  selfProgressReportsBackfill,
  weeklySelfReportCron,
  weeklySelfReportGenerate,
} from './functions/weekly-self-reports';
import { feedbackDeliveryFailed } from './functions/feedback-delivery-failed';
import { challengeRoundFinalizeFailed } from './functions/challenge-round-finalize-failed';
import { orphanPersistFailed } from './functions/orphan-persist-failed';
import { subjectPrewarmCurriculum } from './functions/subject-prewarm-curriculum';
import { subjectRetryCurriculum } from './functions/subject-retry-curriculum';
import { notificationSuppressedObserve } from './functions/notification-suppressed-observe';
import {
  learnerRecapRegenerate,
  sessionSummaryCreate,
  sessionSummaryRegenerate,
} from './functions/summary-regenerate';
import { summaryReconciliationCron } from './functions/summary-reconciliation-cron';
import {
  transcriptPurgeCron,
  transcriptPurgeHandler,
  transcriptPurgeHandlerOnFailure,
} from './functions/transcript-purge-cron';
import { memoryFactsBackfill } from './functions/memory-facts-backfill';
import { memoryFactsEmbedBackfill } from './functions/memory-facts-embed-backfill';
import { reviewCalibrationGrade } from './functions/review-calibration-grade';
import { topicProbeExtract } from './functions/topic-probe-extract';
import { streakRecord } from './functions/streak-record';
import { progressSummaryGeneration } from './functions/progress-summary';
// [BUG-369] Observability terminus handlers for orphan events
import {
  sessionSummaryGeneratedObserve,
  sessionSummaryFailedObserve,
  sessionCompletedWithErrorsObserve,
} from './functions/session-completed-observe';
import {
  summaryReconciliationScannedObserve,
  summaryReconciliationRequeuedObserve,
} from './functions/summary-reconciliation-observe';
import {
  sessionPurgeDelayedObserve,
  sessionTranscriptPurgedObserve,
  sessionTranscriptPurgeSkippedObserve,
} from './functions/transcript-purge-observe';
import {
  sessionFilingResolvedObserve,
  filingAutoRetryAttemptedObserve,
} from './functions/filing-observe';
import { needsDeepeningExpirePending } from './functions/needs-deepening-expire-pending';
import { notifyParentChildCapHit } from './functions/notify-parent-child-cap-hit';
import { accountSecurityNotification } from './functions/account-security-notification';
import { supportershipRevocation } from './functions/supportership-revocation';
import { graduationNarration } from './functions/graduation-narration';

export {
  inngest,
  feedbackDeliveryFailed,
  consentReminder,
  consentRevocation,
  archiveCleanup,
  webhookIdempotencyPurge,
  scheduledDeletion,
  sessionCompleted,
  sessionStaleCleanup,
  trialExpiry,
  trialNotificationSend,
  quotaReset,
  topupExpiryReminder,
  topupExpiryReminderSend,
  billingTrialSubscriptionFailed,
  trialExpiryFailureObserve,
  paymentFailedObserve,
  billingAliasMerge,
  exchangeEmptyReplyFallback,
  askClassificationCompletedObserve,
  askClassificationSkippedObserve,
  askClassificationFailedObserve,
  askGateDecisionObserve,
  askGateTimeoutObserve,
  emailBouncedObserve,
  subjectAutoArchive,
  bookPreGeneration,
  recallNudge,
  recallNudgeSend,
  postSessionSuggestions,
  dailySnapshotCron,
  dailySnapshotRefresh,
  weeklyProgressPushCron,
  weeklyProgressPushGenerate,
  weeklySelfReportCron,
  weeklySelfReportGenerate,
  monthlyReportCron,
  monthlyReportGenerate,
  selfProgressReportsBackfill,
  autoFileSession,
  freeformFilingRetry,
  filingCompletedObserve,
  filingTimedOutObserve,
  filingStrandedBackfill,
  reviewDueScan,
  reviewDueSend,
  dailyReminderScan,
  dailyReminderSend,
  askSilentClassify,
  askSilentClassifyOnFailure,
  challengeRoundFinalizeFailed,
  orphanPersistFailed,
  subjectPrewarmCurriculum,
  subjectRetryCurriculum,
  notificationSuppressedObserve,
  sessionSummaryCreate,
  sessionSummaryRegenerate,
  learnerRecapRegenerate,
  summaryReconciliationCron,
  transcriptPurgeCron,
  transcriptPurgeHandler,
  transcriptPurgeHandlerOnFailure,
  memoryFactsBackfill,
  memoryFactsEmbedBackfill,
  reviewCalibrationGrade,
  topicProbeExtract,
  streakRecord,
  progressSummaryGeneration,
  // [BUG-369] New observability terminus handlers
  sessionSummaryGeneratedObserve,
  sessionSummaryFailedObserve,
  sessionCompletedWithErrorsObserve,
  summaryReconciliationScannedObserve,
  summaryReconciliationRequeuedObserve,
  sessionPurgeDelayedObserve,
  sessionTranscriptPurgedObserve,
  sessionTranscriptPurgeSkippedObserve,
  sessionFilingResolvedObserve,
  filingAutoRetryAttemptedObserve,
  needsDeepeningExpirePending,
  notifyParentChildCapHit,
  accountSecurityNotification,
  supportershipRevocation,
  graduationNarration,
};

// All Inngest functions to register with the serve handler
export const functions = [
  feedbackDeliveryFailed,
  consentReminder,
  consentRevocation,
  archiveCleanup,
  webhookIdempotencyPurge,
  scheduledDeletion,
  sessionCompleted,
  sessionStaleCleanup,
  trialExpiry,
  trialNotificationSend,
  quotaReset,
  topupExpiryReminder,
  topupExpiryReminderSend,
  billingTrialSubscriptionFailed,
  trialExpiryFailureObserve,
  paymentFailedObserve,
  billingAliasMerge,
  exchangeEmptyReplyFallback,
  askClassificationCompletedObserve,
  askClassificationSkippedObserve,
  askClassificationFailedObserve,
  askGateDecisionObserve,
  askGateTimeoutObserve,
  emailBouncedObserve,
  subjectAutoArchive,
  bookPreGeneration,
  recallNudge,
  recallNudgeSend,
  postSessionSuggestions,
  dailySnapshotCron,
  dailySnapshotRefresh,
  // [EP15-I1 AR-9] Weekly push split into cron + per-parent handler.
  weeklyProgressPushCron,
  weeklyProgressPushGenerate,
  monthlyReportCron,
  monthlyReportGenerate,
  weeklySelfReportCron,
  weeklySelfReportGenerate,
  selfProgressReportsBackfill,
  autoFileSession,
  freeformFilingRetry,
  filingCompletedObserve,
  filingTimedOutObserve,
  filingStrandedBackfill,
  reviewDueScan,
  reviewDueSend,
  dailyReminderScan,
  dailyReminderSend,
  askSilentClassify,
  askSilentClassifyOnFailure,
  challengeRoundFinalizeFailed,
  orphanPersistFailed,
  subjectPrewarmCurriculum,
  subjectRetryCurriculum,
  notificationSuppressedObserve,
  sessionSummaryCreate,
  sessionSummaryRegenerate,
  learnerRecapRegenerate,
  summaryReconciliationCron,
  transcriptPurgeCron,
  transcriptPurgeHandler,
  transcriptPurgeHandlerOnFailure,
  memoryFactsBackfill,
  memoryFactsEmbedBackfill,
  reviewCalibrationGrade,
  topicProbeExtract,
  streakRecord,
  progressSummaryGeneration,
  // [BUG-369] New observability terminus handlers
  sessionSummaryGeneratedObserve,
  sessionSummaryFailedObserve,
  sessionCompletedWithErrorsObserve,
  summaryReconciliationScannedObserve,
  summaryReconciliationRequeuedObserve,
  sessionPurgeDelayedObserve,
  sessionTranscriptPurgedObserve,
  sessionTranscriptPurgeSkippedObserve,
  sessionFilingResolvedObserve,
  filingAutoRetryAttemptedObserve,
  needsDeepeningExpirePending,
  notifyParentChildCapHit,
  accountSecurityNotification,
  supportershipRevocation,
  graduationNarration,
];
