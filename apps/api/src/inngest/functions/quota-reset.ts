// ---------------------------------------------------------------------------
// Quota Reset — Sprint 9 Phase 2
// Daily cron: reset monthly quota for subscriptions whose billing cycle reset.
// ---------------------------------------------------------------------------

import { lte } from 'drizzle-orm';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { quotaPools, subscriptions } from '@eduagent/database';
import { eq } from 'drizzle-orm';
import { getTierConfig } from '../../services/subscription';

export const quotaReset = inngest.createFunction(
  { id: 'quota-reset', name: 'Reset monthly quotas on billing cycle' },
  { cron: '0 1 * * *' }, // Daily at 01:00 UTC (after trial-expiry at midnight)
  async ({ step }) => {
    const now = new Date();

    const resetCount = await step.run('reset-expired-cycles', async () => {
      const db = getStepDatabase();

      // Find quota pools where cycleResetAt <= now (billing cycle has elapsed)
      const dueForReset = await db.query.quotaPools.findMany({
        where: lte(quotaPools.cycleResetAt, now),
      });

      let count = 0;
      const nextReset = new Date(now);
      nextReset.setMonth(nextReset.getMonth() + 1);

      for (const pool of dueForReset) {
        // Look up the subscription to get the correct tier quota
        const sub = await db.query.subscriptions.findFirst({
          where: eq(subscriptions.id, pool.subscriptionId),
        });

        const tierConfig = getTierConfig(
          (sub?.tier as 'free' | 'plus' | 'family' | 'pro') ?? 'free'
        );

        await db
          .update(quotaPools)
          .set({
            usedThisMonth: 0,
            monthlyLimit: tierConfig.monthlyQuota,
            cycleResetAt: nextReset,
            updatedAt: now,
          })
          .where(eq(quotaPools.id, pool.id));

        count++;
      }

      return count;
    });

    return {
      status: 'completed',
      resetCount,
      timestamp: now.toISOString(),
    };
  }
);
