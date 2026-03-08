import { sql } from 'drizzle-orm';
import { inngest } from '../client';
import {
  getStepDatabase,
  getStepResendApiKey,
  getStepEmailFrom,
} from '../helpers';
import {
  getConsentStatus,
  getProfileConsentState,
} from '../../services/consent';
import {
  sendEmail,
  formatConsentReminderEmail,
  type EmailOptions,
} from '../../services/notifications';

export const consentReminder = inngest.createFunction(
  { id: 'consent-reminder', name: 'Send consent reminder' },
  { event: 'app/consent.requested' },
  async ({ event, step }) => {
    const { profileId } = event.data;

    // Build email options from Inngest middleware-injected env vars
    const emailOpts = (): EmailOptions => ({
      resendApiKey: getStepResendApiKey(),
      emailFrom: getStepEmailFrom(),
    });

    /** Look up parentEmail from the DB (never from event payload — PII). */
    async function lookupParentEmail(): Promise<string | null> {
      const db = getStepDatabase();
      const state = await getProfileConsentState(db, profileId);
      return state?.parentEmail ?? null;
    }

    // Day 7 reminder
    await step.sleep('wait-7-days', '7d');
    await step.run('send-day-7-reminder', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (!status || status === 'CONSENTED' || status === 'WITHDRAWN') return;
      const parentEmail = await lookupParentEmail();
      if (!parentEmail) return;
      await sendEmail(
        formatConsentReminderEmail(parentEmail, 'your child', 23),
        emailOpts()
      );
    });

    // Day 14 reminder
    await step.sleep('wait-7-more-days', '7d');
    await step.run('send-day-14-reminder', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (!status || status === 'CONSENTED' || status === 'WITHDRAWN') return;
      const parentEmail = await lookupParentEmail();
      if (!parentEmail) return;
      await sendEmail(
        formatConsentReminderEmail(parentEmail, 'your child', 16),
        emailOpts()
      );
    });

    // Day 25 final warning
    await step.sleep('wait-11-more-days', '11d');
    await step.run('send-day-25-warning', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (!status || status === 'CONSENTED' || status === 'WITHDRAWN') return;
      const parentEmail = await lookupParentEmail();
      if (!parentEmail) return;
      await sendEmail(
        {
          to: parentEmail,
          subject:
            "Final warning: your child's MentoMate account will be removed",
          body: `Without your consent, your child's account and data will be automatically removed in 5 days.`,
          type: 'consent_warning',
        },
        emailOpts()
      );
    });

    // Day 30 auto-delete — GDPR/COPPA requires deletion if consent not granted
    await step.sleep('wait-5-more-days', '5d');
    await step.run('auto-delete-account', async () => {
      const db = getStepDatabase();
      // Fast guard: bail out if consent was already granted/withdrawn.
      const status = await getConsentStatus(db, profileId);
      if (!status || status === 'CONSENTED' || status === 'WITHDRAWN') return;
      // Atomic delete — only deletes if no CONSENTED/WITHDRAWN consent exists.
      // This eliminates the TOCTOU race where a parent approves consent between
      // the status check above and the delete below.
      // FK cascades remove all child records (subjects, sessions, consent_states, etc.).
      await db.execute(sql`
        DELETE FROM profiles WHERE id = ${profileId}
        AND NOT EXISTS (
          SELECT 1 FROM consent_states
          WHERE consent_states.profile_id = ${profileId}
          AND consent_states.status IN ('CONSENTED', 'WITHDRAWN')
        )
      `);
    });
  }
);
