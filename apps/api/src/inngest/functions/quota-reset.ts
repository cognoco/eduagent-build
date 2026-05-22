// @inngest-admin: cross-profile
// ---------------------------------------------------------------------------
// Quota Reset — Sprint 9 Phase 2 + Dual-Cap daily reset
// Daily cron: reset daily counters for all pools, plus monthly quota for
// subscriptions whose billing cycle has elapsed.
//
// [CR-2026-05-19-C7] Both resets run inside ONE `db.transaction()` so they
// observe a consistent snapshot of `used_today`. Previously each step opened
// its own connection — if the cycle-reset side raced ahead it would zero
// `used_today` first, and `resetDailyQuotas`' `WHERE used_today > 0` filter
// then undercounted by exactly the rows that had simultaneously hit their
// billing cycle. Daily-first ordering captures every >0 row before the cycle
// reset clears the column for the cycle-expired subset.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';

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

    // Single Inngest step so the transaction does not span step boundaries
    // (Inngest may retry individual steps independently). Within the step we
    // open ONE transaction and run both resets to give them a consistent
    // snapshot.
    const { dailyResetCount, monthlyResetCount } = await step.run(
      'reset-daily-and-cycles',
      async () => {
        const db = getStepDatabase();
        return db.transaction(async (tx) => {
          // Order matters: daily first captures every `used_today > 0` row
          // BEFORE the cycle reset zeroes that column for cycle-expired pools.
          const dailyCount = await resetDailyQuotas(
            tx as unknown as Database,
            now,
          );
          const monthlyCount = await resetExpiredQuotaCycles(
            tx as unknown as Database,
            now,
          );
          return {
            dailyResetCount: dailyCount,
            monthlyResetCount: monthlyCount,
          };
        });
      },
    );

    return {
      status: 'completed',
      dailyResetCount,
      monthlyResetCount,
      timestamp: now.toISOString(),
    };
  },
);
