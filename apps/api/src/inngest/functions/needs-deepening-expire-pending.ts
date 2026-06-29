// @inngest-admin: cross-profile (cron; expirePendingDeepeningRows scans all profiles)
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { expirePendingDeepeningRows } from '../../services/needs-deepening/promotion';

export const needsDeepeningExpirePending = inngest.createFunction(
  {
    id: 'needs-deepening-expire-pending',
    name: 'Expire pending needs-deepening rows',
  },
  { cron: '0 3 * * *' },
  async ({ step }) => {
    const result = await step.run(
      'expire-pending-needs-deepening',
      async () => {
        const db = getStepDatabase();
        return expirePendingDeepeningRows(db, new Date());
      },
    );

    return {
      status: 'completed',
      expiredCount: result.expiredCount,
      expiredIds: result.expiredIds,
    };
  },
);
