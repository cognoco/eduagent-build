import { inngest } from './client';
import { consentReminder } from './functions/consent-reminders';
import { consentRevocation } from './functions/consent-revocation';
import { scheduledDeletion } from './functions/account-deletion';
import { sessionCompleted } from './functions/session-completed';
import { sessionStaleCleanup } from './functions/session-stale-cleanup';
import { trialExpiry } from './functions/trial-expiry';
import { quotaReset } from './functions/quota-reset';
import { topupExpiryReminder } from './functions/topup-expiry-reminder';
import { topupExpiryReminderSend } from './functions/topup-expiry-reminder-send';
import { billingTrialSubscriptionFailed } from './functions/billing-trial-subscription-failed';
import { trialExpiryFailureObserve } from './functions/trial-expiry-failure-observe';
import { paymentFailedObserve } from './functions/payment-failed-observe';
import { exchangeEmptyReplyFallback } from './functions/exchange-empty-reply-fallback';
import {
  askClassificationCompletedObserve,
  askClassificationSkippedObserve,
  askClassificationFailedObserve,
} from './functions/ask-classification-observe';
import { subjectAutoArchive } from './functions/subject-auto-archive';
import { bookPreGeneration } from './functions/book-pre-generation';
import { recallNudge } from './functions/recall-nudge';
import { recallNudgeSend } from './functions/recall-nudge-send';
import { postSessionSuggestions } from './functions/post-session-suggestions';
import { freeformFilingRetry } from './functions/freeform-filing';
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
import { feedbackDeliveryFailed } from './functions/feedback-delivery-failed';
import { orphanPersistFailed } from './functions/orphan-persist-failed';
import { interviewPersistCurriculum } from './functions/interview-persist-curriculum';
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
} from './functions/transcript-purge-cron';
import { memoryFactsBackfill } from './functions/memory-facts-backfill';
import { memoryFactsEmbedBackfill } from './functions/memory-facts-embed-backfill';

export {
  inngest,
  feedbackDeliveryFailed,
  consentReminder,
  consentRevocation,
  scheduledDeletion,
  sessionCompleted,
  sessionStaleCleanup,
  trialExpiry,
  quotaReset,
  topupExpiryReminder,
  topupExpiryReminderSend,
  billingTrialSubscriptionFailed,
  trialExpiryFailureObserve,
  paymentFailedObserve,
  exchangeEmptyReplyFallback,
  askClassificationCompletedObserve,
  askClassificationSkippedObserve,
  askClassificationFailedObserve,
  subjectAutoArchive,
  bookPreGeneration,
  recallNudge,
  recallNudgeSend,
  postSessionSuggestions,
  dailySnapshotCron,
  dailySnapshotRefresh,
  weeklyProgressPushCron,
  weeklyProgressPushGenerate,
  monthlyReportCron,
  monthlyReportGenerate,
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
  orphanPersistFailed,
  interviewPersistCurriculum,
  notificationSuppressedObserve,
  sessionSummaryCreate,
  sessionSummaryRegenerate,
  learnerRecapRegenerate,
  summaryReconciliationCron,
  transcriptPurgeCron,
  transcriptPurgeHandler,
  memoryFactsBackfill,
  memoryFactsEmbedBackfill,
};

// All Inngest functions to register with the serve handler
export const functions = [
  feedbackDeliveryFailed,
  consentReminder,
  consentRevocation,
  scheduledDeletion,
  sessionCompleted,
  sessionStaleCleanup,
  trialExpiry,
  quotaReset,
  topupExpiryReminder,
  topupExpiryReminderSend,
  billingTrialSubscriptionFailed,
  trialExpiryFailureObserve,
  paymentFailedObserve,
  exchangeEmptyReplyFallback,
  askClassificationCompletedObserve,
  askClassificationSkippedObserve,
  askClassificationFailedObserve,
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
  orphanPersistFailed,
  interviewPersistCurriculum,
  notificationSuppressedObserve,
  sessionSummaryCreate,
  sessionSummaryRegenerate,
  learnerRecapRegenerate,
  summaryReconciliationCron,
  transcriptPurgeCron,
  transcriptPurgeHandler,
  memoryFactsBackfill,
  memoryFactsEmbedBackfill,
];
