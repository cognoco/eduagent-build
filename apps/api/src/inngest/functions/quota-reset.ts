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
import { resetDailyQuotas } from '../../services/billing';
import { resetExpiredQuotaCyclesV2 } from '../../services/billing/billing-v2';

export const quotaReset = inngest.createFunction(
  { id: 'quota-reset', name: 'Reset daily + monthly quotas' },
  { cron: '0 1 * * *' }, // Daily at 01:00 UTC (after trial-expiry at midnight)
  async ({ step }) => {
    // Single Inngest step so the transaction does not span step boundaries
    // (Inngest may retry individual steps independently). Within the step we
    // open ONE transaction and run both resets to give them a consistent
    // snapshot.
    //
    // [CR-2026-05-21-032] `now` is computed INSIDE step.run so Inngest memoises
    // it with the step's cached result. On retry the replayed cached value is
    // used, preventing a later wall-clock from picking up cycles that expired
    // between attempts. Mirror of the BUG-189 pattern in transcript-purge-cron.ts.
    const { dailyResetCount, monthlyResetCount, timestamp } = await step.run(
      'reset-daily-and-cycles',
      async () => {
        const now = new Date();
        const db = getStepDatabase();
        return db.transaction(async (tx) => {
          // Order matters: daily first captures every `used_today > 0` row
          // BEFORE the cycle reset zeroes that column for cycle-expired pools.
          const dailyCount = await resetDailyQuotas(
            tx as unknown as Database,
            now,
          );
          // [WI-810] flag-on routes to the v2 quota-cycle reset (joins the v2
          // `subscription` table); the legacy resetExpiredQuotaCycles joins the
          // `subscriptions` table dropped at the cutover (WI-805) and would
          // FK/500 at the #8 atomic IDENTITY_V2_ENABLED flag-flip. flag-off is
          // byte-identical. resetDailyQuotas (above) only touches quota_pools /
          // profile_quota_usage — no subscriptions read — so it needs no v2 twin.
          const monthlyCount = await resetExpiredQuotaCyclesV2(
            tx as unknown as Database,
            now,
          );
          return {
            dailyResetCount: dailyCount,
            monthlyResetCount: monthlyCount,
            timestamp: now.toISOString(),
          };
        });
      },
    );

    return {
      status: 'completed',
      dailyResetCount,
      monthlyResetCount,
      timestamp,
    };
  },
);
