// ---------------------------------------------------------------------------
// Billing — Metering (hot path)
// decrementQuota, incrementQuota
// ---------------------------------------------------------------------------

import { and, eq, sql } from 'drizzle-orm';
import {
  quotaPools,
  topUpCredits,
  type Database,
  findQuotaPool,
} from '@eduagent/database';
import { captureException } from '../sentry';
import { createLogger } from '../logger';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecrementResult {
  success: boolean;
  source: 'monthly' | 'top_up' | 'none' | 'daily_exceeded';
  remainingMonthly: number;
  remainingTopUp: number;
  remainingDaily: number | null;
}

// ---------------------------------------------------------------------------
// decrementQuota
// ---------------------------------------------------------------------------

/**
 * Decrements the quota pool by 1 exchange.
 *
 * Strategy:
 * 1. Try monthly quota first (atomic WHERE guard prevents TOCTOU race)
 *    — also enforces daily limit when set (free tier: 10/day)
 * 2. If monthly exhausted but daily OK, consume from oldest unexpired top-up (FIFO)
 * 3. If daily limit hit, return { source: 'daily_exceeded' } immediately
 * 4. If both exhausted, return { success: false }
 *
 * All UPDATEs use SQL WHERE guards so concurrent requests cannot over-decrement.
 */
export async function decrementQuota(
  db: Database,
  subscriptionId: string
): Promise<DecrementResult> {
  // 1. Try monthly quota — atomic: succeeds only if monthly AND daily limits allow
  const [monthlyUpdated] = await db
    .update(quotaPools)
    .set({
      usedThisMonth: sql`${quotaPools.usedThisMonth} + 1`,
      usedToday: sql`${quotaPools.usedToday} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(quotaPools.subscriptionId, subscriptionId),
        sql`${quotaPools.usedThisMonth} < ${quotaPools.monthlyLimit}`,
        sql`(${quotaPools.dailyLimit} IS NULL OR ${quotaPools.usedToday} < ${quotaPools.dailyLimit})`
      )
    )
    .returning();

  if (monthlyUpdated) {
    return {
      success: true,
      source: 'monthly',
      remainingMonthly:
        monthlyUpdated.monthlyLimit - monthlyUpdated.usedThisMonth,
      remainingTopUp: 0,
      remainingDaily:
        monthlyUpdated.dailyLimit !== null
          ? monthlyUpdated.dailyLimit - monthlyUpdated.usedToday
          : null,
    };
  }

  // Atomic update failed — determine why (daily vs monthly)
  const pool = await findQuotaPool(db, subscriptionId);

  if (!pool) {
    return {
      success: false,
      source: 'none',
      remainingMonthly: 0,
      remainingTopUp: 0,
      remainingDaily: null,
    };
  }

  // Daily limit hit — hard stop, cannot use even top-ups
  if (pool.dailyLimit !== null && pool.usedToday >= pool.dailyLimit) {
    return {
      success: false,
      source: 'daily_exceeded',
      remainingMonthly: Math.max(0, pool.monthlyLimit - pool.usedThisMonth),
      remainingTopUp: 0,
      remainingDaily: 0,
    };
  }

  // 2. Monthly exhausted, daily OK — fall back to top-up credits (FIFO)
  const now = new Date();
  const topUp = await db.query.topUpCredits.findFirst({
    where: sql`${topUpCredits.subscriptionId} = ${subscriptionId}
      AND ${topUpCredits.remaining} > 0
      AND ${topUpCredits.expiresAt} > ${now}`,
    orderBy: sql`${topUpCredits.purchasedAt} ASC`,
  });

  if (topUp) {
    // Atomic: only succeeds if remaining > 0 (concurrent request may have consumed it)
    const [updatedTopUp] = await db
      .update(topUpCredits)
      .set({
        remaining: sql`${topUpCredits.remaining} - 1`,
      })
      .where(
        and(eq(topUpCredits.id, topUp.id), sql`${topUpCredits.remaining} > 0`)
      )
      .returning();

    if (updatedTopUp) {
      // [S-2 / BUG-627] Atomically increment usedToday WITH a daily-limit
      // guard. The previous unguarded UPDATE allowed two concurrent top-up
      // consumers to both pass the line-91 snapshot check at usedToday=
      // dailyLimit-1, both decrement a top-up credit, then both add +1 to
      // usedToday — ending at dailyLimit+1 and silently bypassing the cap.
      const [updatedPool] = await db
        .update(quotaPools)
        .set({
          usedToday: sql`${quotaPools.usedToday} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(quotaPools.subscriptionId, subscriptionId),
            sql`(${quotaPools.dailyLimit} IS NULL OR ${quotaPools.usedToday} < ${quotaPools.dailyLimit})`
          )
        )
        .returning();

      if (!updatedPool) {
        // Daily cap was reached between the snapshot check and this UPDATE
        // (concurrent top-up race). Roll back the top-up decrement so the
        // user is not charged for a request that did not go through.
        await db
          .update(topUpCredits)
          .set({ remaining: sql`${topUpCredits.remaining} + 1` })
          .where(eq(topUpCredits.id, updatedTopUp.id));

        return {
          success: false,
          source: 'daily_exceeded',
          remainingMonthly: Math.max(0, pool.monthlyLimit - pool.usedThisMonth),
          remainingTopUp: 0,
          remainingDaily: 0,
        };
      }

      return {
        success: true,
        source: 'top_up',
        remainingMonthly: 0,
        remainingTopUp: updatedTopUp.remaining,
        remainingDaily:
          updatedPool.dailyLimit !== null
            ? updatedPool.dailyLimit - updatedPool.usedToday
            : null,
      };
    }
  }

  // 3. Both exhausted or no top-ups available
  return {
    success: false,
    source: 'none',
    remainingMonthly: 0,
    remainingTopUp: 0,
    remainingDaily:
      pool.dailyLimit !== null
        ? Math.max(0, pool.dailyLimit - pool.usedToday)
        : null,
  };
}

// ---------------------------------------------------------------------------
// incrementQuota
// ---------------------------------------------------------------------------

/**
 * Refunds 1 exchange back to the quota pool.
 * Used when an LLM call fails after decrement — avoids charging for failed work.
 *
 * Refunds always go to the monthly pool (simpler, avoids FIFO complications).
 * Also refunds the daily counter to keep both in sync.
 */
export async function incrementQuota(
  db: Database,
  subscriptionId: string
): Promise<void> {
  await db
    .update(quotaPools)
    .set({
      usedThisMonth: sql`GREATEST(${quotaPools.usedThisMonth} - 1, 0)`,
      usedToday: sql`GREATEST(${quotaPools.usedToday} - 1, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(quotaPools.subscriptionId, subscriptionId));
}

// ---------------------------------------------------------------------------
// safeRefundQuota
// ---------------------------------------------------------------------------

/**
 * [BUG-661 / A-21] Best-effort wrapper around incrementQuota for the LLM
 * failure-refund path. The route already decremented the quota before the LLM
 * call; if the LLM throws and the refund itself also throws, the user is
 * silently charged for a failed exchange.
 *
 * This wrapper:
 *  - Never throws (the caller is already in an error path)
 *  - Logs the failure with the originating context
 *  - Escalates to Sentry so we can query how often refunds fail in prod
 *
 * The escalation is mandatory per CLAUDE.md "Silent Recovery Without
 * Escalation is Banned" — bare console.warn would not let us measure how
 * often customers are silently overcharged.
 */
export async function safeRefundQuota(
  db: Database,
  subscriptionId: string,
  context: { route: string; profileId?: string; sessionId?: string }
): Promise<{ refunded: boolean }> {
  try {
    await incrementQuota(db, subscriptionId);
    return { refunded: true };
  } catch (refundErr) {
    logger.error('[metering] Quota refund failed — user may be overcharged', {
      subscriptionId,
      route: context.route,
      sessionId: context.sessionId,
      error: refundErr instanceof Error ? refundErr.message : String(refundErr),
    });
    captureException(refundErr, {
      profileId: context.profileId,
      extra: {
        context: 'metering.refund.failed',
        route: context.route,
        subscriptionId,
        sessionId: context.sessionId,
      },
    });
    return { refunded: false };
  }
}
