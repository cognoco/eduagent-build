import { inngest } from './client';
import { consentReminder } from './functions/consent-reminders';
import { scheduledDeletion } from './functions/account-deletion';
import { sessionCompleted } from './functions/session-completed';
import { reviewReminder } from './functions/review-reminder';

export {
  inngest,
  consentReminder,
  scheduledDeletion,
  sessionCompleted,
  reviewReminder,
};

// All Inngest functions to register with the serve handler
export const functions = [
  consentReminder,
  scheduledDeletion,
  sessionCompleted,
  reviewReminder,
];
