// ---------------------------------------------------------------------------
// Billing — Metering (hot path)
// decrementQuota, incrementQuota
// ---------------------------------------------------------------------------

import { and, eq, notInArray, sql, type SQL } from 'drizzle-orm';
import {
  profileQuotaUsage,
  quotaPools,
  profiles,
  subscriptions,
  topUpCredits,
  usageEvents,
  type Database,
  findQuotaPool__unscoped,
} from '@eduagent/database';
import { getTierConfig } from '../subscription';
import { captureException } from '../sentry';
import { createLogger } from '../logger';
import { safeSend } from '../safe-non-core';
import { inngest } from '../../inngest/client';
import { getEffectiveAccessForSubscription } from './access';
import {
  provisionProfileQuotaUsage,
  resolveProfileQuotaRole,
  type ProfileQuotaRole,
} from './quota-provision';
import type { SubscriptionTier } from '@eduagent/schemas';

const logger = createLogger();

type QuotaModel = 'per-profile' | 'shared-pool';

async function emitChildQuotaExhaustedEvent(input: {
  subscriptionId: string;
  profileId: string;
  kind: 'daily_exceeded' | 'monthly_exceeded';
  resetsAt: string;
}): Promise<void> {
  await safeSend(
    () =>
      inngest.send({
        name: 'app/billing.profile_quota.exhausted',
        data: {
          subscriptionId: input.subscriptionId,
          profileId: input.profileId,
          kind: input.kind,
          resetsAt: input.resetsAt,
          occurredAt: new Date().toISOString(),
        },
      }),
    'billing.profile_quota.exhausted',
    {
      subscriptionId: input.subscriptionId,
      profileId: input.profileId,
    },
  );
}

/**
 * Emits a structured event on quota ownership mismatch so we can query how
 * often a stale or hostile profileId was sent for a subscription that does
 * not own it. AGENTS.md requires any silent-recovery branch in billing code
 * to emit a structured signal — bare `logger.warn` cannot answer "how often
 * is this firing in the last 24h" from telemetry.
 */
async function emitOwnershipMismatchEvent(input: {
  flow: 'decrement' | 'increment';
  subscriptionId: string;
  profileId: string;
}): Promise<void> {
  // Telemetry must never block billing logic. safeSend escalates dispatch
  // failures via Sentry + structured error log so a transient Inngest outage
  // does not erase the signal entirely.
  await safeSend(
    () =>
      inngest.send({
        // orphan-allow: structured telemetry signal required by AGENTS.md
        // ("silent recovery in billing must emit a structured metric"). The
        // mismatch is handled in-line (the decrement/increment returns
        // profile_mismatch). The event is a dashboard-queryable signal so ops
        // can answer "how often is a stale/hostile profileId sent" — no
        // remediation handler is needed.
        name: 'app/billing.ownership.mismatch',
        data: {
          flow: input.flow,
          subscriptionId: input.subscriptionId,
          profileId: input.profileId,
        },
      }),
    'billing.ownership.mismatch',
    {
      flow: input.flow,
      subscriptionId: input.subscriptionId,
      profileId: input.profileId,
    },
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecrementResult {
  success: boolean;
  source: 'monthly' | 'top_up' | 'none' | 'daily_exceeded' | 'profile_mismatch';
  quotaModel?: QuotaModel;
  remainingMonthly: number;
  remainingTopUp: number;
  remainingDaily: number | null;
  resetsAt?: string;
  profileRole?: ProfileQuotaRole | null;
  monthlyLimit?: number;
  usedThisMonth?: number;
  dailyLimit?: number | null;
  usedToday?: number;
  /**
   * [CR-2026-05-19-C6] Set only when `source === 'top_up'`. Callers (refund
   * path) must thread this back into `incrementQuota` so the refund credits
   * the original top-up batch instead of decrementing the monthly pool,
   * which would inflate monthly quota by 1 per LLM failure.
   */
  topUpCreditId?: string;
}

export type MeteringErrorCode =
  | 'PROFILE_ID_REQUIRED'
  | 'PROFILE_QUOTA_ROW_MISSING';

export class MeteringError extends Error {
  constructor(
    public readonly code: MeteringErrorCode,
    public readonly meta: Record<string, unknown>,
  ) {
    super(`MeteringError(${code})`);
    this.name = 'MeteringError';
  }
}

async function verifyProfileInSubscriptionAccount(
  db: Database,
  subscriptionId: string,
  profileId: string,
): Promise<boolean> {
  const row = await db
    .select({ profileId: profiles.id })
    .from(profiles)
    .innerJoin(subscriptions, eq(subscriptions.accountId, profiles.accountId))
    .where(
      and(eq(subscriptions.id, subscriptionId), eq(profiles.id, profileId)),
    )
    .limit(1);

  return row.length > 0;
}

/**
 * Must be called inside a db.transaction() callback so the usage audit row
 * rolls back atomically with the quota update that caused it.
 */
async function recordUsageEvent(
  db: Pick<Database, 'insert'>,
  subscriptionId: string,
  profileId: string,
  delta: 1 | -1,
): Promise<void> {
  await db.insert(usageEvents).values({
    subscriptionId,
    profileId,
    delta,
  });
}

function nextDailyResetAt(now: Date): string {
  const reset = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      1,
      0,
      0,
      0,
    ),
  );
  if (reset <= now) {
    reset.setUTCDate(reset.getUTCDate() + 1);
  }
  return reset.toISOString();
}

function profileQuotaContext(
  row: typeof profileQuotaUsage.$inferSelect,
  source: DecrementResult['source'],
  now: Date,
): Pick<
  DecrementResult,
  | 'profileRole'
  | 'monthlyLimit'
  | 'usedThisMonth'
  | 'dailyLimit'
  | 'usedToday'
  | 'resetsAt'
> {
  return {
    profileRole: row.role,
    monthlyLimit: row.monthlyLimit,
    usedThisMonth: row.usedThisMonth,
    dailyLimit: row.dailyLimit,
    usedToday: row.usedToday,
    resetsAt:
      source === 'daily_exceeded'
        ? nextDailyResetAt(now)
        : row.cycleResetAt.toISOString(),
  };
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
  subscriptionId: string,
  profileId?: string,
): Promise<DecrementResult> {
  const access = await getEffectiveAccessForSubscription(db, subscriptionId);
  if (!access) {
    const result = await decrementPoolQuota(db, subscriptionId, profileId);
    return { ...result, quotaModel: 'shared-pool' };
  }

  const tier = access.effectiveAccessTier;
  if (getTierConfig(tier).quotaModel === 'per-profile') {
    if (!profileId) {
      throw new MeteringError('PROFILE_ID_REQUIRED', {
        subscriptionId,
        tier,
      });
    }
    const result = await decrementProfileQuota(
      db,
      subscriptionId,
      profileId,
      tier,
    );
    return { ...result, quotaModel: 'per-profile' };
  }

  const result = await decrementPoolQuota(db, subscriptionId, profileId);
  return { ...result, quotaModel: 'shared-pool' };
}

async function decrementPoolQuota(
  db: Database,
  subscriptionId: string,
  profileId?: string,
): Promise<DecrementResult> {
  if (profileId) {
    const ownsProfile = await verifyProfileInSubscriptionAccount(
      db,
      subscriptionId,
      profileId,
    );
    if (!ownsProfile) {
      logger.warn('[metering] decrementQuota ownership mismatch', {
        event: 'metering.ownership_mismatch',
        flow: 'decrement',
        subscriptionId,
        profileId,
      });
      await emitOwnershipMismatchEvent({
        flow: 'decrement',
        subscriptionId,
        profileId,
      });
      return {
        success: false,
        source: 'profile_mismatch',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: null,
      };
    }
  }

  // 1. Try monthly quota — atomic: succeeds only if monthly AND daily limits allow.
  // [CR-2026-05-19-M11] The discrimination re-read (why did the UPDATE fail?) is
  // performed INSIDE the same transaction so it sees a consistent snapshot with the
  // UPDATE attempt. A daily-reset cron firing between the UPDATE and an out-of-
  // transaction re-read would flip usedToday back to 0, making the caller fall
  // through to the top-up path even though the user had actually hit the daily cap.
  const monthlyTxResult = await db.transaction(async (tx) => {
    const [updated] = await tx
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
          sql`(${quotaPools.dailyLimit} IS NULL OR ${quotaPools.usedToday} < ${quotaPools.dailyLimit})`,
        ),
      )
      .returning();
    if (updated && profileId) {
      await recordUsageEvent(tx, subscriptionId, profileId, 1);
    }
    if (updated) {
      return { updated, pool: null } as const;
    }
    // UPDATE failed — read the pool inside this same transaction so the
    // discrimination sees the same snapshot (no cron race window).
    // safe-caller: metering hot-path — subscriptionId sourced from the profile's own subscription row, already verified at middleware
    const failPool = await findQuotaPool__unscoped(
      tx as unknown as Database,
      subscriptionId,
    );
    return { updated: null, pool: failPool } as const;
  });

  if (monthlyTxResult.updated) {
    const monthlyUpdated = monthlyTxResult.updated;
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

  // Atomic update failed — use the pool snapshot read inside the same transaction.
  const pool = monthlyTxResult.pool;

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
  const topUpResult = await db.transaction(async (tx) => {
    let updatedTopUp: typeof topUpCredits.$inferSelect | undefined;
    const contendedTopUpIds: string[] = [];
    while (!updatedTopUp) {
      const topUpConditions: SQL[] = [
        eq(topUpCredits.subscriptionId, subscriptionId),
        sql`${topUpCredits.remaining} > 0`,
        sql`${topUpCredits.expiresAt} > ${now}`,
      ];
      if (contendedTopUpIds.length > 0) {
        topUpConditions.push(notInArray(topUpCredits.id, contendedTopUpIds));
      }
      const topUp = await tx.query.topUpCredits.findFirst({
        where: and(...topUpConditions),
        orderBy: sql`${topUpCredits.purchasedAt} ASC, ${topUpCredits.id} ASC`,
      });

      if (!topUp) return null;
      if (contendedTopUpIds.includes(topUp.id)) return null;

      // Atomic: only succeeds if remaining > 0 (concurrent request may have consumed it).
      [updatedTopUp] = await tx
        .update(topUpCredits)
        .set({
          remaining: sql`${topUpCredits.remaining} - 1`,
        })
        .where(
          and(
            eq(topUpCredits.id, topUp.id),
            sql`${topUpCredits.remaining} > 0`,
          ),
        )
        .returning();

      if (!updatedTopUp) {
        contendedTopUpIds.push(topUp.id);
      }
    }

    // [S-2 / BUG-627] Atomically increment usedToday WITH a daily-limit
    // guard. The previous unguarded UPDATE allowed two concurrent top-up
    // consumers to both pass the line-91 snapshot check at usedToday=
    // dailyLimit-1, both decrement a top-up credit, then both add +1 to
    // usedToday — ending at dailyLimit+1 and silently bypassing the cap.
    const [updatedPool] = await tx
      .update(quotaPools)
      .set({
        usedToday: sql`${quotaPools.usedToday} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(quotaPools.subscriptionId, subscriptionId),
          sql`(${quotaPools.dailyLimit} IS NULL OR ${quotaPools.usedToday} < ${quotaPools.dailyLimit})`,
        ),
      )
      .returning();

    if (!updatedPool) {
      // Daily cap was reached between the snapshot check and this UPDATE
      // (concurrent top-up race). Roll back the top-up decrement so the
      // user is not charged for a request that did not go through.
      await tx
        .update(topUpCredits)
        .set({ remaining: sql`${topUpCredits.remaining} + 1` })
        .where(eq(topUpCredits.id, updatedTopUp.id));

      return {
        success: false,
        source: 'daily_exceeded' as const,
        remainingMonthly: Math.max(0, pool.monthlyLimit - pool.usedThisMonth),
        remainingTopUp: 0,
        remainingDaily: 0,
      };
    }

    if (profileId) {
      await recordUsageEvent(tx, subscriptionId, profileId, 1);
    }

    return {
      success: true,
      source: 'top_up' as const,
      remainingMonthly: 0,
      remainingTopUp: updatedTopUp.remaining,
      remainingDaily:
        updatedPool.dailyLimit !== null
          ? updatedPool.dailyLimit - updatedPool.usedToday
          : null,
      topUpCreditId: updatedTopUp.id,
    };
  });

  if (topUpResult) {
    return topUpResult;
  }

  // A concurrent request can consume the last daily slot after the monthly
  // failure snapshot but before/while we lose a contended top-up decrement.
  // Re-read once so callers see the real hard-stop reason instead of a generic
  // "none" exhaustion classification.
  const latestPool = await findQuotaPool__unscoped(db, subscriptionId);
  if (
    latestPool &&
    latestPool.dailyLimit !== null &&
    latestPool.usedToday >= latestPool.dailyLimit
  ) {
    return {
      success: false,
      source: 'daily_exceeded',
      remainingMonthly: Math.max(
        0,
        latestPool.monthlyLimit - latestPool.usedThisMonth,
      ),
      remainingTopUp: 0,
      remainingDaily: 0,
    };
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

async function decrementProfileQuota(
  db: Database,
  subscriptionId: string,
  profileId: string,
  tier: SubscriptionTier,
): Promise<DecrementResult> {
  const ownsProfile = await verifyProfileInSubscriptionAccount(
    db,
    subscriptionId,
    profileId,
  );
  if (!ownsProfile) {
    logger.warn('[metering] decrementQuota ownership mismatch', {
      event: 'metering.ownership_mismatch',
      flow: 'decrement',
      subscriptionId,
      profileId,
    });
    await emitOwnershipMismatchEvent({
      flow: 'decrement',
      subscriptionId,
      profileId,
    });
    return {
      success: false,
      source: 'profile_mismatch',
      remainingMonthly: 0,
      remainingTopUp: 0,
      remainingDaily: null,
      profileRole: null,
    };
  }

  const result = await db.transaction(async (tx) =>
    attemptProfileDecrementInTx(
      tx as unknown as Database,
      subscriptionId,
      profileId,
      tier,
      true,
    ),
  );

  if (
    result.profileRole === 'child' &&
    result.resetsAt &&
    (result.source === 'daily_exceeded' || result.source === 'none')
  ) {
    await emitChildQuotaExhaustedEvent({
      subscriptionId,
      profileId,
      kind:
        result.source === 'daily_exceeded'
          ? 'daily_exceeded'
          : 'monthly_exceeded',
      resetsAt: result.resetsAt,
    });
  }

  return result;
}

async function clampProfileQuotaLimits(
  db: Database,
  subscriptionId: string,
  profileId: string,
  tier: SubscriptionTier,
): Promise<void> {
  const row = await db.query.profileQuotaUsage.findFirst({
    where: and(
      eq(profileQuotaUsage.subscriptionId, subscriptionId),
      eq(profileQuotaUsage.profileId, profileId),
    ),
  });
  if (!row) return;

  const config = getTierConfig(tier);
  if (config.quotaModel !== 'per-profile') return;
  const monthlyLimit =
    row.role === 'owner' ? config.ownerMonthlyQuota : config.childMonthlyQuota;
  const dailyLimit =
    row.role === 'owner' ? config.ownerDailyQuota : config.childDailyQuota;
  if (monthlyLimit === null) return;
  if (row.monthlyLimit === monthlyLimit && row.dailyLimit === dailyLimit) {
    return;
  }

  await db
    .update(profileQuotaUsage)
    .set({ monthlyLimit, dailyLimit, updatedAt: new Date() })
    .where(eq(profileQuotaUsage.id, row.id));
}

async function consumeOwnerTopUpCredit(
  db: Database,
  input: {
    subscriptionId: string;
    profileId: string;
    row: typeof profileQuotaUsage.$inferSelect;
    now: Date;
  },
): Promise<DecrementResult | null> {
  let updatedTopUp: typeof topUpCredits.$inferSelect | undefined;
  const contendedTopUpIds: string[] = [];
  while (!updatedTopUp) {
    const topUpConditions: SQL[] = [
      eq(topUpCredits.subscriptionId, input.subscriptionId),
      eq(topUpCredits.profileId, input.profileId),
      sql`${topUpCredits.remaining} > 0`,
      sql`${topUpCredits.expiresAt} > ${input.now}`,
    ];
    if (contendedTopUpIds.length > 0) {
      topUpConditions.push(notInArray(topUpCredits.id, contendedTopUpIds));
    }

    const topUp = await db.query.topUpCredits.findFirst({
      where: and(...topUpConditions),
      orderBy: sql`${topUpCredits.purchasedAt} ASC, ${topUpCredits.id} ASC`,
    });
    if (!topUp) return null;
    if (contendedTopUpIds.includes(topUp.id)) return null;

    [updatedTopUp] = await db
      .update(topUpCredits)
      .set({ remaining: sql`${topUpCredits.remaining} - 1` })
      .where(
        and(
          eq(topUpCredits.id, topUp.id),
          eq(topUpCredits.profileId, input.profileId),
          sql`${topUpCredits.remaining} > 0`,
        ),
      )
      .returning();

    if (!updatedTopUp) {
      contendedTopUpIds.push(topUp.id);
    }
  }

  const [updatedRow] = await db
    .update(profileQuotaUsage)
    .set({
      usedToday: sql`${profileQuotaUsage.usedToday} + 1`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(profileQuotaUsage.subscriptionId, input.subscriptionId),
        eq(profileQuotaUsage.profileId, input.profileId),
        sql`(${profileQuotaUsage.dailyLimit} IS NULL OR ${profileQuotaUsage.usedToday} < ${profileQuotaUsage.dailyLimit})`,
      ),
    )
    .returning();

  if (!updatedRow) {
    await db
      .update(topUpCredits)
      .set({ remaining: sql`${topUpCredits.remaining} + 1` })
      .where(eq(topUpCredits.id, updatedTopUp.id));

    return {
      success: false,
      source: 'daily_exceeded',
      remainingMonthly: Math.max(
        0,
        input.row.monthlyLimit - input.row.usedThisMonth,
      ),
      remainingTopUp: 0,
      remainingDaily: 0,
      ...profileQuotaContext(input.row, 'daily_exceeded', input.now),
    };
  }

  await recordUsageEvent(db, input.subscriptionId, input.profileId, 1);
  return {
    success: true,
    source: 'top_up',
    remainingMonthly: 0,
    remainingTopUp: updatedTopUp.remaining,
    remainingDaily:
      updatedRow.dailyLimit !== null
        ? updatedRow.dailyLimit - updatedRow.usedToday
        : null,
    topUpCreditId: updatedTopUp.id,
    ...profileQuotaContext(updatedRow, 'top_up', input.now),
  };
}

async function attemptProfileDecrementInTx(
  db: Database,
  subscriptionId: string,
  profileId: string,
  tier: SubscriptionTier,
  allowLazyProvision: boolean,
): Promise<DecrementResult> {
  const now = new Date();
  await clampProfileQuotaLimits(db, subscriptionId, profileId, tier);

  const [updated] = await db
    .update(profileQuotaUsage)
    .set({
      usedThisMonth: sql`${profileQuotaUsage.usedThisMonth} + 1`,
      usedToday: sql`${profileQuotaUsage.usedToday} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(profileQuotaUsage.subscriptionId, subscriptionId),
        eq(profileQuotaUsage.profileId, profileId),
        sql`${profileQuotaUsage.usedThisMonth} < ${profileQuotaUsage.monthlyLimit}`,
        sql`(${profileQuotaUsage.dailyLimit} IS NULL OR ${profileQuotaUsage.usedToday} < ${profileQuotaUsage.dailyLimit})`,
      ),
    )
    .returning();

  if (updated) {
    await recordUsageEvent(db, subscriptionId, profileId, 1);
    return {
      success: true,
      source: 'monthly',
      remainingMonthly: updated.monthlyLimit - updated.usedThisMonth,
      remainingTopUp: 0,
      remainingDaily:
        updated.dailyLimit !== null
          ? updated.dailyLimit - updated.usedToday
          : null,
      ...profileQuotaContext(updated, 'monthly', now),
    };
  }

  const snapshot = await db.query.profileQuotaUsage.findFirst({
    where: and(
      eq(profileQuotaUsage.subscriptionId, subscriptionId),
      eq(profileQuotaUsage.profileId, profileId),
    ),
  });

  if (!snapshot) {
    if (!allowLazyProvision) {
      throw new MeteringError('PROFILE_QUOTA_ROW_MISSING', {
        subscriptionId,
        profileId,
      });
    }
    const role = await resolveProfileQuotaRole(db, subscriptionId, profileId);
    if (!role) {
      return {
        success: false,
        source: 'profile_mismatch',
        remainingMonthly: 0,
        remainingTopUp: 0,
        remainingDaily: null,
        profileRole: null,
      };
    }
    await provisionProfileQuotaUsage(db, subscriptionId, profileId, role, {
      tier,
      now,
      emitLazyProvisioned: true,
    });
    return attemptProfileDecrementInTx(
      db,
      subscriptionId,
      profileId,
      tier,
      false,
    );
  }

  if (
    snapshot.dailyLimit !== null &&
    snapshot.usedToday >= snapshot.dailyLimit
  ) {
    return {
      success: false,
      source: 'daily_exceeded',
      remainingMonthly: Math.max(
        0,
        snapshot.monthlyLimit - snapshot.usedThisMonth,
      ),
      remainingTopUp: 0,
      remainingDaily: 0,
      ...profileQuotaContext(snapshot, 'daily_exceeded', now),
    };
  }

  const config = getTierConfig(tier);
  if (
    snapshot.role === 'owner' &&
    snapshot.usedThisMonth >= snapshot.monthlyLimit &&
    config.topUpAmount > 0
  ) {
    const topUpResult = await consumeOwnerTopUpCredit(db, {
      subscriptionId,
      profileId,
      row: snapshot,
      now,
    });
    if (topUpResult) return topUpResult;
  }

  return {
    success: false,
    source: 'none',
    remainingMonthly: Math.max(
      0,
      snapshot.monthlyLimit - snapshot.usedThisMonth,
    ),
    remainingTopUp: 0,
    remainingDaily:
      snapshot.dailyLimit !== null
        ? Math.max(0, snapshot.dailyLimit - snapshot.usedToday)
        : null,
    ...profileQuotaContext(snapshot, 'none', now),
  };
}

// ---------------------------------------------------------------------------
// incrementQuota
// ---------------------------------------------------------------------------

/**
 * Refunds 1 exchange back to the quota pool.
 * Used when an LLM call fails after decrement — avoids charging for failed work.
 *
 * [CR-2026-05-19-C6] Refunds route to the SAME pool that the original
 * decrement consumed from:
 *   - source = 'monthly' (default for back-compat): decrement usedThisMonth
 *     and usedToday.
 *   - source = 'top_up': increment the original topUpCredits row's remaining
 *     by 1, and decrement usedToday only. Without this routing every LLM
 *     failure on a top-up consumption inflates the monthly quota by 1.
 *
 * Callers SHOULD pass `source` (and `topUpCreditId` when source is 'top_up')
 * from the original `DecrementResult`. When omitted, falls back to the
 * legacy monthly-pool refund.
 */
export interface IncrementResult {
  success: boolean;
  reason?: 'profile_mismatch' | 'topup_credit_not_found';
}

export interface IncrementQuotaOptions {
  source?: 'monthly' | 'top_up';
  topUpCreditId?: string;
  quotaModel?: QuotaModel;
}

export async function incrementQuota(
  db: Database,
  subscriptionId: string,
  profileId?: string,
  options?: IncrementQuotaOptions,
): Promise<IncrementResult> {
  if (options?.quotaModel === 'per-profile') {
    if (!profileId) {
      throw new MeteringError('PROFILE_ID_REQUIRED', {
        subscriptionId,
        quotaModel: options.quotaModel,
      });
    }
    return incrementProfileQuota(db, subscriptionId, profileId, options);
  }

  if (options?.quotaModel === 'shared-pool') {
    return incrementPoolQuota(db, subscriptionId, profileId, options);
  }

  const access = await getEffectiveAccessForSubscription(db, subscriptionId);
  if (
    access &&
    getTierConfig(access.effectiveAccessTier).quotaModel === 'per-profile'
  ) {
    if (!profileId) {
      throw new MeteringError('PROFILE_ID_REQUIRED', {
        subscriptionId,
        tier: access.effectiveAccessTier,
      });
    }
    return incrementProfileQuota(db, subscriptionId, profileId, options);
  }

  return incrementPoolQuota(db, subscriptionId, profileId, options);
}

async function incrementPoolQuota(
  db: Database,
  subscriptionId: string,
  profileId?: string,
  options?: IncrementQuotaOptions,
): Promise<IncrementResult> {
  if (profileId) {
    const ownsProfile = await verifyProfileInSubscriptionAccount(
      db,
      subscriptionId,
      profileId,
    );
    if (!ownsProfile) {
      logger.warn('[metering] incrementQuota ownership mismatch', {
        event: 'metering.ownership_mismatch',
        flow: 'increment',
        subscriptionId,
        profileId,
      });
      await emitOwnershipMismatchEvent({
        flow: 'increment',
        subscriptionId,
        profileId,
      });
      return { success: false, reason: 'profile_mismatch' };
    }
  }

  const source = options?.source ?? 'monthly';

  await db.transaction(async (tx) => {
    if (source === 'top_up' && options?.topUpCreditId) {
      // [CR-2026-05-19-C6] Refund the original top-up batch, not monthly.
      // Daily counter still rolls back because the decrement consumed a
      // daily slot regardless of which pool funded the request.
      await tx
        .update(topUpCredits)
        .set({
          remaining: sql`${topUpCredits.remaining} + 1`,
        })
        .where(eq(topUpCredits.id, options.topUpCreditId));

      await tx
        .update(quotaPools)
        .set({
          usedToday: sql`GREATEST(${quotaPools.usedToday} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(quotaPools.subscriptionId, subscriptionId));
    } else {
      // Monthly refund (legacy path): decrement both usedThisMonth and
      // usedToday. GREATEST guard prevents underflow if counters are
      // already at 0 (e.g. a duplicate refund).
      if (source === 'top_up') {
        // Source was top_up but we lost the credit id — log so we can detect
        // callers that didn't thread the id through. We still refund the
        // monthly pool as a fallback so the user isn't silently overcharged.
        logger.warn(
          '[metering] incrementQuota top_up refund missing topUpCreditId — falling back to monthly refund',
          {
            event: 'metering.refund.missing_topup_id',
            subscriptionId,
            profileId,
          },
        );
      }
      await tx
        .update(quotaPools)
        .set({
          usedThisMonth: sql`GREATEST(${quotaPools.usedThisMonth} - 1, 0)`,
          usedToday: sql`GREATEST(${quotaPools.usedToday} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(quotaPools.subscriptionId, subscriptionId));
    }
    if (profileId) {
      await recordUsageEvent(tx, subscriptionId, profileId, -1);
    }
  });
  return { success: true };
}

async function incrementProfileQuota(
  db: Database,
  subscriptionId: string,
  profileId: string,
  options?: IncrementQuotaOptions,
): Promise<IncrementResult> {
  const ownsProfile = await verifyProfileInSubscriptionAccount(
    db,
    subscriptionId,
    profileId,
  );
  if (!ownsProfile) {
    logger.warn('[metering] incrementQuota ownership mismatch', {
      event: 'metering.ownership_mismatch',
      flow: 'increment',
      subscriptionId,
      profileId,
    });
    await emitOwnershipMismatchEvent({
      flow: 'increment',
      subscriptionId,
      profileId,
    });
    return { success: false, reason: 'profile_mismatch' };
  }

  const source = options?.source ?? 'monthly';

  const txResult = await db.transaction(
    async (tx): Promise<IncrementResult> => {
      if (source === 'top_up' && options?.topUpCreditId) {
        const refundedCredits = await tx
          .update(topUpCredits)
          .set({ remaining: sql`${topUpCredits.remaining} + 1` })
          .where(
            and(
              eq(topUpCredits.id, options.topUpCreditId),
              eq(topUpCredits.subscriptionId, subscriptionId),
              eq(topUpCredits.profileId, profileId),
            ),
          )
          .returning({ id: topUpCredits.id });

        // Billing-integrity guard: if the credit UPDATE matched no row (the
        // topUpCreditId does not belong to this subscription+profile), do NOT
        // proceed to decrement the daily slot — that would silently refund a
        // daily slot without refunding the credit the caller asked for. Escalate
        // instead (CLAUDE.md: silent recovery in billing must be observable).
        if (refundedCredits.length === 0) {
          logger.error('[metering] top_up refund matched no credit row', {
            event: 'metering.refund.topup_credit_not_found',
            subscriptionId,
            profileId,
            topUpCreditId: options.topUpCreditId,
          });
          captureException(
            new Error('top_up quota refund matched no top_up_credits row'),
            {
              profileId,
              tags: { surface: 'metering', reason: 'topup_credit_not_found' },
              extra: { subscriptionId, topUpCreditId: options.topUpCreditId },
            },
          );
          return { success: false, reason: 'topup_credit_not_found' };
        }

        await tx
          .update(profileQuotaUsage)
          .set({
            usedToday: sql`GREATEST(${profileQuotaUsage.usedToday} - 1, 0)`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(profileQuotaUsage.subscriptionId, subscriptionId),
              eq(profileQuotaUsage.profileId, profileId),
            ),
          );
      } else {
        if (source === 'top_up') {
          logger.warn(
            '[metering] incrementQuota top_up refund missing topUpCreditId - falling back to monthly refund',
            {
              event: 'metering.refund.missing_topup_id',
              subscriptionId,
              profileId,
            },
          );
        }
        await tx
          .update(profileQuotaUsage)
          .set({
            usedThisMonth: sql`GREATEST(${profileQuotaUsage.usedThisMonth} - 1, 0)`,
            usedToday: sql`GREATEST(${profileQuotaUsage.usedToday} - 1, 0)`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(profileQuotaUsage.subscriptionId, subscriptionId),
              eq(profileQuotaUsage.profileId, profileId),
            ),
          );
      }

      await recordUsageEvent(tx, subscriptionId, profileId, -1);
      return { success: true };
    },
  );

  return txResult;
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
 * The escalation is mandatory per AGENTS.md "Silent Recovery Without
 * Escalation is Banned" — bare console.warn would not let us measure how
 * often customers are silently overcharged.
 */
export async function safeRefundQuota(
  db: Database,
  subscriptionId: string,
  context: {
    route: string;
    profileId?: string;
    sessionId?: string;
    /**
     * [CR-2026-05-19-C6] Set from the original `DecrementResult.source` so
     * the refund credits the correct pool (top-up vs monthly). Omit for
     * legacy callers — they fall back to a monthly refund.
     */
    source?: 'monthly' | 'top_up';
    /** Set from the original decrement so refunds don't drift if tier state changes mid-request. */
    quotaModel?: QuotaModel;
    /** Required when source === 'top_up'. From `DecrementResult.topUpCreditId`. */
    topUpCreditId?: string;
  },
): Promise<{ refunded: boolean }> {
  try {
    const result = await incrementQuota(db, subscriptionId, context.profileId, {
      source: context.source,
      quotaModel: context.quotaModel,
      topUpCreditId: context.topUpCreditId,
    });
    if (!result.success) {
      // Structured non-error path: a profile/subscription mismatch is a caller
      // bug or a stale request, not an unexpected runtime failure. Log it but
      // do NOT escalate to Sentry — that path is reserved for genuine outages
      // (DB down, transaction failure) where customers risk silent overcharge.
      logger.warn('[metering] Quota refund skipped — profile mismatch', {
        subscriptionId,
        profileId: context.profileId,
        route: context.route,
        sessionId: context.sessionId,
        reason: result.reason,
      });
      return { refunded: false };
    }
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
