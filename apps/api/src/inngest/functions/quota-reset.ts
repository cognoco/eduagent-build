// ---------------------------------------------------------------------------
// Quota Reset — Sprint 9 Phase 2 + Dual-Cap daily reset
// Daily cron: reset daily counters for all pools, plus monthly quota for
// subscriptions whose billing cycle has elapsed.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  resetExpiredQuotaCycles,
  resetDailyQuotas,
} from '../../services/billing';

export const quotaReset = inngest.createFunction(
  { id: 'quota-reset', name: 'Reset daily + monthly quotas' },
  { cron: '0 1 * * *' }, // Daily at 01:00 UTC (after trial-expiry at midnight)
  async ({ step }) => {
    const now = new Date();

    // Step 1: Reset daily question counters for ALL quota pools
    const dailyResetCount = await step.run('reset-daily-quotas', async () => {
      const db = getStepDatabase();
      return resetDailyQuotas(db, now);
    });

    // Step 2: Reset monthly quotas for subscriptions whose billing cycle elapsed
    const monthlyResetCount = await step.run(
      'reset-expired-cycles',
      async () => {
        const db = getStepDatabase();
        return resetExpiredQuotaCycles(db, now);
      }
    );

    return {
      status: 'completed',
      dailyResetCount,
      monthlyResetCount,
      timestamp: now.toISOString(),
    };
  }
);
