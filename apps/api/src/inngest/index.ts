import { inngest } from './client';
import { consentReminder } from './functions/consent-reminders';
import { consentRevocation } from './functions/consent-revocation';
import { scheduledDeletion } from './functions/account-deletion';
import { sessionCompleted } from './functions/session-completed';
import { sessionStaleCleanup } from './functions/session-stale-cleanup';
import { reviewReminder } from './functions/review-reminder';
import { trialExpiry } from './functions/trial-expiry';
import { paymentRetry } from './functions/payment-retry';
import { quotaReset } from './functions/quota-reset';
import { topupExpiryReminder } from './functions/topup-expiry-reminder';
import { subjectAutoArchive } from './functions/subject-auto-archive';
import { bookPreGeneration } from './functions/book-pre-generation';
import { recallNudge } from './functions/recall-nudge';
import { recallNudgeSend } from './functions/recall-nudge-send';

export {
  inngest,
  consentReminder,
  consentRevocation,
  scheduledDeletion,
  sessionCompleted,
  sessionStaleCleanup,
  reviewReminder,
  trialExpiry,
  paymentRetry,
  quotaReset,
  topupExpiryReminder,
  subjectAutoArchive,
  bookPreGeneration,
  recallNudge,
  recallNudgeSend,
};

// All Inngest functions to register with the serve handler
export const functions = [
  consentReminder,
  consentRevocation,
  scheduledDeletion,
  sessionCompleted,
  sessionStaleCleanup,
  reviewReminder,
  trialExpiry,
  paymentRetry,
  quotaReset,
  topupExpiryReminder,
  subjectAutoArchive,
  bookPreGeneration,
  recallNudge,
  recallNudgeSend,
];
