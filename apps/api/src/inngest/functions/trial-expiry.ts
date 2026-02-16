import { inngest } from '../client';

export const trialExpiry = inngest.createFunction(
  { id: 'trial-expiry-check', name: 'Check and process trial expirations' },
  { cron: '0 0 * * *' }, // Daily at midnight
  async ({ step }) => {
    await step.run('check-expiring-trials', async () => {
      // TODO: Query trials expiring today/tomorrow, send notifications
      console.log('Checking trial expirations');
    });

    await step.run('process-expired-trials', async () => {
      // TODO: Downgrade expired trials to free tier
      console.log('Processing expired trials');
    });

    return { status: 'completed' };
  }
);
