import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { getConsentStatus } from '../../services/consent';
import { deleteProfile } from '../../services/deletion';
import {
  sendEmail,
  formatConsentReminderEmail,
} from '../../services/notifications';

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
      if (!status || status === 'CONSENTED' || status === 'WITHDRAWN') return;
      await sendEmail(
        formatConsentReminderEmail(parentEmail, 'your child', 23)
      );
    });

    // Day 14 reminder
    await step.sleep('wait-7-more-days', '7d');
    await step.run('send-day-14-reminder', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (!status || status === 'CONSENTED' || status === 'WITHDRAWN') return;
      await sendEmail(
        formatConsentReminderEmail(parentEmail, 'your child', 16)
      );
    });

    // Day 25 final warning
    await step.sleep('wait-11-more-days', '11d');
    await step.run('send-day-25-warning', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (!status || status === 'CONSENTED' || status === 'WITHDRAWN') return;
      await sendEmail({
        to: parentEmail,
        subject: "Final warning: your child's EduAgent account will be removed",
        body: `Without your consent, your child's account and data will be automatically removed in 5 days.`,
        type: 'consent_warning',
      });
    });

    // Day 30 auto-delete — GDPR/COPPA requires deletion if consent not granted
    await step.sleep('wait-5-more-days', '5d');
    await step.run('auto-delete-account', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (!status || status === 'CONSENTED' || status === 'WITHDRAWN') return;
      // Consent not granted (PENDING) — delete the profile.
      // FK cascades remove all child records (subjects, sessions, consent_states, etc.).
      await deleteProfile(db, profileId);
    });
  }
);
