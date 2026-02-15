import { inngest } from './client';
import { consentReminder } from './functions/consent-reminders';
import { scheduledDeletion } from './functions/account-deletion';
import { sessionCompleted } from './functions/session-completed';

export { inngest, consentReminder, scheduledDeletion, sessionCompleted };

// All Inngest functions to register with the serve handler
export const functions = [consentReminder, scheduledDeletion, sessionCompleted];
