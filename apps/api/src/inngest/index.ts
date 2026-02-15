import { inngest } from './client';
import { consentReminder } from './functions/consent-reminders';
import { scheduledDeletion } from './functions/account-deletion';

export { inngest, consentReminder, scheduledDeletion };

// All Inngest functions to register with the serve handler
export const functions = [consentReminder, scheduledDeletion];
