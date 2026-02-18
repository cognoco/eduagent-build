import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { isDeletionCancelled, executeDeletion } from '../../services/deletion';

export const scheduledDeletion = inngest.createFunction(
  {
    id: 'scheduled-account-deletion',
    name: 'Process scheduled account deletion',
  },
  { event: 'app/account.deletion-scheduled' },
  async ({ event, step }) => {
    const { accountId } = event.data;

    // Wait 7-day grace period
    await step.sleep('grace-period', '7d');

    // Check if deletion was cancelled
    const cancelled = await step.run('check-cancellation', async () => {
      const db = getStepDatabase();
      return isDeletionCancelled(db, accountId);
    });

    if (cancelled) {
      return { status: 'cancelled' };
    }

    // Permanently delete all data
    await step.run('delete-account-data', async () => {
      const db = getStepDatabase();
      await executeDeletion(db, accountId);
    });

    return { status: 'deleted', accountId };
  }
);
