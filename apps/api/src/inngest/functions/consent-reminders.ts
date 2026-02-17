import { inngest } from '../client';
import { createDatabase } from '@eduagent/database';
import { getConsentStatus } from '../../services/consent';
import {
  sendEmail,
  formatConsentReminderEmail,
} from '../../services/notifications';

/**
 * Returns a Database instance for use within Inngest step functions.
 *
 * TODO: Inject DATABASE_URL via Inngest middleware when wiring Neon (Layer 2).
 * See account-deletion.ts for rationale.
 */
function getStepDatabase() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not configured');
  return createDatabase(url);
}

export const consentReminder = inngest.createFunction(
  { id: 'consent-reminder', name: 'Send consent reminder' },
  { event: 'app/consent.requested' },
  async ({ event, step }) => {
    const { profileId, parentEmail, consentType: _consentType } = event.data;

    // Day 7 reminder
    await step.sleep('wait-7-days', '7d');
    await step.run('send-day-7-reminder', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (status === 'CONSENTED' || status === 'WITHDRAWN') return;
      await sendEmail(
        formatConsentReminderEmail(parentEmail, 'your child', 23)
      );
    });

    // Day 14 reminder
    await step.sleep('wait-7-more-days', '7d');
    await step.run('send-day-14-reminder', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (status === 'CONSENTED' || status === 'WITHDRAWN') return;
      await sendEmail(
        formatConsentReminderEmail(parentEmail, 'your child', 16)
      );
    });

    // Day 25 final warning
    await step.sleep('wait-11-more-days', '11d');
    await step.run('send-day-25-warning', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (status === 'CONSENTED' || status === 'WITHDRAWN') return;
      await sendEmail({
        to: parentEmail,
        subject: "Final warning: your child's EduAgent account will be removed",
        body: `Without your consent, your child's account and data will be automatically removed in 5 days.`,
        type: 'consent_warning',
      });
    });

    // Day 30 auto-delete
    await step.sleep('wait-5-more-days', '5d');
    await step.run('auto-delete-account', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (status === 'CONSENTED') return;
      // TODO: Delete account and all data via deletion orchestrator
      console.log(`Auto-deleting account for profile ${profileId}`);
    });
  }
);
