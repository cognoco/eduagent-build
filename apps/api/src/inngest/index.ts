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
import { subjectAutoArchive } from './functions/subject-auto-archive';
import { bookPreGeneration } from './functions/book-pre-generation';
import { recallNudge } from './functions/recall-nudge';
import { recallNudgeSend } from './functions/recall-nudge-send';
import { postSessionSuggestions } from './functions/post-session-suggestions';
import { freeformFilingRetry } from './functions/freeform-filing';
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
import {
  progressBackfillTrigger,
  progressBackfillProfile,
} from './functions/progress-backfill';
import {
  weeklyProgressPushCron,
  weeklyProgressPushGenerate,
} from './functions/weekly-progress-push';
import {
  monthlyReportCron,
  monthlyReportGenerate,
} from './functions/monthly-report-cron';

export {
  inngest,
  consentReminder,
  consentRevocation,
  scheduledDeletion,
  sessionCompleted,
  sessionStaleCleanup,
  trialExpiry,
  quotaReset,
  topupExpiryReminder,
  topupExpiryReminderSend,
  subjectAutoArchive,
  bookPreGeneration,
  recallNudge,
  recallNudgeSend,
  postSessionSuggestions,
  dailySnapshotCron,
  dailySnapshotRefresh,
  progressBackfillTrigger,
  progressBackfillProfile,
  weeklyProgressPushCron,
  weeklyProgressPushGenerate,
  monthlyReportCron,
  monthlyReportGenerate,
  freeformFilingRetry,
  reviewDueScan,
  reviewDueSend,
  dailyReminderScan,
  dailyReminderSend,
  askSilentClassify,
  askSilentClassifyOnFailure,
};

// All Inngest functions to register with the serve handler
export const functions = [
  consentReminder,
  consentRevocation,
  scheduledDeletion,
  sessionCompleted,
  sessionStaleCleanup,
  trialExpiry,
  quotaReset,
  topupExpiryReminder,
  topupExpiryReminderSend,
  subjectAutoArchive,
  bookPreGeneration,
  recallNudge,
  recallNudgeSend,
  postSessionSuggestions,
  dailySnapshotCron,
  dailySnapshotRefresh,
  progressBackfillTrigger,
  progressBackfillProfile,
  // [EP15-I1 AR-9] Weekly push split into cron + per-parent handler.
  weeklyProgressPushCron,
  weeklyProgressPushGenerate,
  monthlyReportCron,
  monthlyReportGenerate,
  freeformFilingRetry,
  reviewDueScan,
  reviewDueSend,
  dailyReminderScan,
  dailyReminderSend,
  askSilentClassify,
  askSilentClassifyOnFailure,
];
