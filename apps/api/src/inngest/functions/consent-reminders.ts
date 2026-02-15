import { inngest } from '../client';

export const consentReminder = inngest.createFunction(
  { id: 'consent-reminder', name: 'Send consent reminder' },
  { event: 'app/consent.requested' },
  async ({ event, step }) => {
    const { profileId, parentEmail, consentType: _consentType } = event.data;

    // Day 7 reminder
    await step.sleep('wait-7-days', '7d');
    await step.run('send-day-7-reminder', async () => {
      // TODO: Send reminder email via email service
      console.log(`Day 7 reminder for ${parentEmail}`);
    });

    // Day 14 reminder
    await step.sleep('wait-7-more-days', '7d');
    await step.run('send-day-14-reminder', async () => {
      // TODO: Send reminder email via email service
      console.log(`Day 14 reminder for ${parentEmail}`);
    });

    // Day 25 final warning
    await step.sleep('wait-11-more-days', '11d');
    await step.run('send-day-25-warning', async () => {
      // TODO: Send final warning email — account will be deleted in 5 days
      console.log(`Day 25 final warning for ${parentEmail}`);
    });

    // Day 30 auto-delete
    await step.sleep('wait-5-more-days', '5d');
    await step.run('auto-delete-account', async () => {
      // TODO: Delete account and all data via deletion orchestrator
      console.log(`Auto-deleting account for profile ${profileId}`);
    });
  }
);
