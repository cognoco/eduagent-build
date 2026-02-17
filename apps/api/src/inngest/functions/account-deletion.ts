import { inngest } from '../client';
import { isDeletionCancelled, executeDeletion } from '../../services/deletion';

export const scheduledDeletion = inngest.createFunction(
  {
    id: 'scheduled-account-deletion',
    name: 'Process scheduled account deletion',
  },
  { event: 'app/account.deletion-scheduled' },
  async ({ event, step }) => {
    const { accountId, profileIds: _profileIds } = event.data;

    // Wait 7-day grace period
    await step.sleep('grace-period', '7d');

    // Check if deletion was cancelled
    const cancelled = await step.run('check-cancellation', async () => {
      return isDeletionCancelled(accountId);
    });

    if (cancelled) {
      return { status: 'cancelled' };
    }

    // Permanently delete all data
    await step.run('delete-account-data', async () => {
      await executeDeletion(accountId);
    });

    return { status: 'deleted', accountId };
  }
);
