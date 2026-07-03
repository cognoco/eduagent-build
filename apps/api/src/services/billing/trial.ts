// ---------------------------------------------------------------------------
// Billing — Trial expiry, soft-landing, bulk cron helpers, date-range queries
// ---------------------------------------------------------------------------

import { sql } from 'drizzle-orm';
import {
  quotaPools,
  profileQuotaUsage,
  type Database,
} from '@eduagent/database';
// NOTE: PgTransaction → Database cast pattern used below.
// See feedback_drizzle_transaction_cast.md.

import { type SubscriptionRow } from './types';

// Re-export shared type so callers of this module can use it
export type { SubscriptionRow };

/**
 * Resets the daily question counter for ALL quota pools.
 * Called by the daily Inngest cron at 01:00 UTC.
 *
 * [CR-2026-05-19-C7] Accepts a `db | tx` so quota-reset can wrap both this
 * call and `resetExpiredQuotaCycles` in a single ACID transaction. Running
 * the two helpers in separate connections caused the daily reset row count
 * to be undercounted whenever a cycle boundary coincided with the cron tick:
 * if `resetExpiredQuotaCycles` raced ahead it zeroed `used_today` first, and
 * `resetDailyQuotas`' `usedToday > 0` filter then missed those rows.
 */
export async function resetDailyQuotas(
  db: Database,
  now: Date,
): Promise<number> {
  const poolResult = await db
    .update(quotaPools)
    .set({
      usedToday: 0,
      updatedAt: now,
    })
    .where(sql`${quotaPools.usedToday} > 0`)
    .returning();

  const profileResult = await db
    .update(profileQuotaUsage)
    .set({
      usedToday: 0,
      updatedAt: now,
    })
    .where(sql`${profileQuotaUsage.usedToday} > 0`)
    .returning();

  return poolResult.length + profileResult.length;
}
