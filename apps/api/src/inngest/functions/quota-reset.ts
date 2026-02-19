// ---------------------------------------------------------------------------
// Quota Reset — Sprint 9 Phase 2
// Daily cron: reset monthly quota for subscriptions whose billing cycle reset.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { resetExpiredQuotaCycles } from '../../services/billing';

export const quotaReset = inngest.createFunction(
  { id: 'quota-reset', name: 'Reset monthly quotas on billing cycle' },
  { cron: '0 1 * * *' }, // Daily at 01:00 UTC (after trial-expiry at midnight)
  async ({ step }) => {
    const now = new Date();

    const resetCount = await step.run('reset-expired-cycles', async () => {
      const db = getStepDatabase();
      return resetExpiredQuotaCycles(db, now);
    });

    return {
      status: 'completed',
      resetCount,
      timestamp: now.toISOString(),
    };
  }
);
