import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  accountExists,
  isDeletionCancelled,
  executeDeletion,
} from '../../services/deletion';

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

    // [BUG-844] After a 7-day sleep the account may have been removed by an
    // admin or background GC. isDeletionCancelled and executeDeletion below
    // are both safe in that case (the former returns false, the latter is
    // idempotent), but blindly running them would either re-issue a no-op
    // DELETE or report a misleading 'deleted' status. Surface the
    // already-deleted case as its own terminal status so on-call has clear
    // telemetry for grace-period overruns vs. happy-path completions.
    const exists = await step.run('check-account-exists', async () => {
      const db = getStepDatabase();
      return accountExists(db, accountId);
    });

    if (!exists) {
      return { status: 'already_deleted', accountId };
    }

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
