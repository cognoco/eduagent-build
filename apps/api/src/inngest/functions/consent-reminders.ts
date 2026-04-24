import { inngest } from '../client';
import {
  getStepDatabase,
  getStepResendApiKey,
  getStepEmailFrom,
  getStepAppUrl,
} from '../helpers';
import { eq, desc } from 'drizzle-orm';
import { consentStates } from '@eduagent/database';
import {
  getConsentStatus,
  getProfileConsentState,
} from '../../services/consent';
import {
  sendEmail,
  formatConsentReminderEmail,
  type EmailOptions,
} from '../../services/notifications';
import { deleteProfileIfNoConsent } from '../../services/deletion';

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

    /** Look up parentEmail and consentToken from the DB (never from event payload — PII). */
    async function lookupConsentDetails(): Promise<{
      parentEmail: string | null;
      consentToken: string | null;
    }> {
      const db = getStepDatabase();
      const state = await getProfileConsentState(db, profileId);
      if (!state?.parentEmail) return { parentEmail: null, consentToken: null };

      // Fetch the live token separately — getProfileConsentState intentionally
      // omits it to keep the return surface minimal. We need it here so every
      // reminder email contains a direct action link [UX-DE-H9].
      const row = await db.query.consentStates.findFirst({
        where: eq(consentStates.profileId, profileId),
        orderBy: desc(consentStates.requestedAt),
        columns: { consentToken: true },
      });
      return {
        parentEmail: state.parentEmail,
        consentToken: row?.consentToken ?? null,
      };
    }

    /** Builds the direct consent page URL from a token. */
    function buildTokenUrl(token: string): string {
      return `${getStepAppUrl()}/v1/consent-page?token=${token}`;
    }

    // Day 7 reminder
    await step.sleep('wait-7-days', '7d');
    await step.run('send-day-7-reminder', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (!status || status === 'CONSENTED' || status === 'WITHDRAWN') return;
      const { parentEmail, consentToken } = await lookupConsentDetails();
      if (!parentEmail || !consentToken) return;
      await sendEmail(
        formatConsentReminderEmail(
          parentEmail,
          'your child',
          23,
          buildTokenUrl(consentToken)
        ),
        emailOpts()
      );
    });

    // Day 14 reminder
    await step.sleep('wait-7-more-days', '7d');
    await step.run('send-day-14-reminder', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (!status || status === 'CONSENTED' || status === 'WITHDRAWN') return;
      const { parentEmail, consentToken } = await lookupConsentDetails();
      if (!parentEmail || !consentToken) return;
      await sendEmail(
        formatConsentReminderEmail(
          parentEmail,
          'your child',
          16,
          buildTokenUrl(consentToken)
        ),
        emailOpts()
      );
    });

    // Day 25 final warning
    await step.sleep('wait-11-more-days', '11d');
    await step.run('send-day-25-warning', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, profileId);
      if (!status || status === 'CONSENTED' || status === 'WITHDRAWN') return;
      const { parentEmail } = await lookupConsentDetails();
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

    // Day 30 auto-delete — GDPR requires deletion if consent not granted
    await step.sleep('wait-5-more-days', '5d');
    await step.run('auto-delete-account', async () => {
      const db = getStepDatabase();
      // Fast guard: bail out if consent was already granted/withdrawn.
      const status = await getConsentStatus(db, profileId);
      if (!status || status === 'CONSENTED' || status === 'WITHDRAWN') return;
      // CI-11: Use service function instead of raw SQL.
      // Atomic delete — only deletes if no CONSENTED/WITHDRAWN consent exists.
      // This eliminates the TOCTOU race where a parent approves consent between
      // the status check above and the delete below.
      // FK cascades remove all child records (subjects, sessions, consent_states, etc.).
      await deleteProfileIfNoConsent(db, profileId);
    });
  }
);
