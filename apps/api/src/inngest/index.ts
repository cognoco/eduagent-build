import { inngest } from './client';
import { consentReminder } from './functions/consent-reminders';
import { scheduledDeletion } from './functions/account-deletion';
import { sessionCompleted } from './functions/session-completed';
import { reviewReminder } from './functions/review-reminder';
import { trialExpiry } from './functions/trial-expiry';
import { paymentRetry } from './functions/payment-retry';
import { quotaReset } from './functions/quota-reset';
import { topupExpiryReminder } from './functions/topup-expiry-reminder';
import { subjectAutoArchive } from './functions/subject-auto-archive';

export {
  inngest,
  consentReminder,
  scheduledDeletion,
  sessionCompleted,
  reviewReminder,
  trialExpiry,
  paymentRetry,
  quotaReset,
  topupExpiryReminder,
  subjectAutoArchive,
};

// All Inngest functions to register with the serve handler
export const functions = [
  consentReminder,
  scheduledDeletion,
  sessionCompleted,
  reviewReminder,
  trialExpiry,
  paymentRetry,
  quotaReset,
  topupExpiryReminder,
  subjectAutoArchive,
];
