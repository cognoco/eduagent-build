// ---------------------------------------------------------------------------
// Billing — RevenueCat webhook helpers (Epic 9)
// isRevenuecatEventProcessed, updateSubscriptionFromRevenuecatWebhook,
// activateSubscriptionFromRevenuecat
// ---------------------------------------------------------------------------

import { eq, and, isNull, ne, or, sql } from 'drizzle-orm';
import {
  subscriptions,
  quotaPools,
  type Database,
  createAccountRepository,
  lockSubscriptionByAccountId__unscoped,
} from '@eduagent/database';
import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';
import { getTierConfig, isValidTransition } from '../subscription';
import { captureException } from '../sentry';
import { createLogger } from '../logger';
import {
  mapSubscriptionRow,
  type AppliedSubscriptionRow,
  type SubscriptionRow,
} from './types';
import { reconcileQuotaStateForSubscription } from './quota-reconcile';
import {
  reattributeTopUpCreditsOnModelChange,
  emitTopUpCreditsReattributedMetric,
} from './tier';

const logger = createLogger();
import { getSubscriptionByAccountId } from './subscription-core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevenuecatWebhookUpdate {
  tier?: SubscriptionTier;
  status?: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string | null;
  cancelledAt?: string | null;
  trialEndsAt?: string | null;
}

export interface RevenuecatQuotaUpdate {
  monthlyQuota: number;
  dailyLimit: number | null;
}

// ---------------------------------------------------------------------------
// isRevenuecatEventProcessed
// ---------------------------------------------------------------------------

/**
 * Checks whether a RevenueCat event should be skipped.
 * BD-01: Uses timestamp-based ordering instead of last-event-ID-only check.
 * An event is considered "already processed" when:
 *   (a) its event ID matches the last-processed ID (exact duplicate), OR
 *   (b) its timestamp is older than the last-processed timestamp (stale retry).
 * This prevents older webhook retries from overwriting current subscription state.
 */
export async function isRevenuecatEventProcessed(
  db: Database,
  accountId: string,
  eventId: string,
  eventTimestampMs?: number,
): Promise<boolean> {
  const repo = createAccountRepository(db, accountId);
  const sub = await repo.subscriptions.findFirst();
  if (!sub) return false;

  // Exact duplicate — same event ID
  if (sub.lastRevenuecatEventId === eventId) return true;

  // BD-01: Stale retry — event timestamp is older than last processed
  // Column is text; coerce to number for numeric comparison (NaN-safe)
  if (eventTimestampMs != null && sub.lastRevenuecatEventTimestampMs != null) {
    const lastTs = Number(sub.lastRevenuecatEventTimestampMs);
    if (!Number.isNaN(lastTs) && eventTimestampMs < lastTs) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// updateSubscriptionFromRevenuecatWebhook
// ---------------------------------------------------------------------------

/**
 * Updates a subscription from a RevenueCat webhook event.
 * Writes `lastRevenuecatEventId` and `lastRevenuecatEventTimestampMs` for
 * timestamp-based idempotency (BD-01).
 *
 * [CR-2026-05-19-M11] The idempotency read and the write are wrapped in a single
 * `db.transaction()` so two concurrent deliveries of the same event ID cannot both
 * see "not processed" and both proceed. The partial unique index on
 * (accountId, lastRevenuecatEventId) provides the storage-layer guarantee; the
 * transaction ensures the read coherence.
 */
export async function updateSubscriptionFromRevenuecatWebhook(
  db: Database,
  accountId: string,
  updates: RevenuecatWebhookUpdate & {
    eventId: string;
    eventTimestampMs?: number;
  },
): Promise<AppliedSubscriptionRow | null> {
  return db.transaction(async (tx) => {
    const updated = await applySubscriptionUpdateFromRevenuecat(
      tx as unknown as Database,
      accountId,
      updates,
    );
    if (updated && updated.webhookApplied !== false) {
      await reconcileQuotaStateForSubscription(
        tx as unknown as Database,
        updated.id,
      );
    }
    return updated;
  });
}

export async function updateSubscriptionAndQuotaFromRevenuecatWebhook(
  db: Database,
  accountId: string,
  updates: RevenuecatWebhookUpdate & {
    eventId: string;
    eventTimestampMs?: number;
  },
  _quota: RevenuecatQuotaUpdate,
): Promise<AppliedSubscriptionRow | null> {
  let reattributedCount = 0;
  let previousTier: SubscriptionTier | undefined;
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    // [F-124] Lock-and-read the previous tier INSIDE the transaction
    // (SELECT … FOR UPDATE) so the tier-change detection and the credit
    // re-attribution below are serialized against concurrent webhooks for
    // the same account. A plain in-transaction read under READ COMMITTED is
    // not enough: two concurrent transactions can both read the same
    // previousTier before either commits (Codex P1 on PR #897). The row lock
    // is held until commit; the second transaction blocks here and then sees
    // the first one's committed tier. The eventId dedup inside
    // applySubscriptionUpdateFromRevenuecat only gates duplicate deliveries
    // of the SAME event — it does not serialize two different events.
    // safe-caller: RevenueCat webhook handler — accountId already validated by the caller
    const existing = await lockSubscriptionByAccountId__unscoped(
      txDb,
      accountId,
    );
    previousTier = existing?.tier;

    const updated = await applySubscriptionUpdateFromRevenuecat(
      txDb,
      accountId,
      updates,
    );

    if (updated && updated.webhookApplied !== false) {
      await reconcileQuotaStateForSubscription(txDb, updated.id);

      // [F-124] Re-attribute top-up credits when the quota model changes.
      // Only fires when the webhook actually changed the tier.
      if (previousTier && updates.tier && previousTier !== updates.tier) {
        reattributedCount = await reattributeTopUpCreditsOnModelChange(
          txDb,
          updated.id,
          accountId,
          previousTier,
          updates.tier,
        );
      }
    }

    return updated;
  });

  // Emit queryable metric if credits were re-attributed (silent-recovery-banned
  // rule). Same event name + payload schema as the Stripe path — single source
  // of truth in emitTopUpCreditsReattributedMetric (tier.ts).
  if (reattributedCount > 0 && previousTier && updates.tier && result) {
    await emitTopUpCreditsReattributedMetric({
      subscriptionId: result.id,
      accountId,
      previousTier,
      newTier: updates.tier,
      reattributedCount,
      occurredAt: now,
    });
  }

  return result;
}

async function applySubscriptionUpdateFromRevenuecat(
  db: Database,
  accountId: string,
  updates: RevenuecatWebhookUpdate & {
    eventId: string;
    eventTimestampMs?: number;
  },
): Promise<AppliedSubscriptionRow | null> {
  const repo = createAccountRepository(db, accountId);
  const existing = await repo.subscriptions.findFirst();

  if (!existing) return null;

  // [CR-2026-05-19-M11] Idempotency check INSIDE the transaction so the read is
  // coherent with the write. Two concurrent calls with the same eventId will
  // serialize here; the second will see the already-stamped eventId and return
  // early without a second write.
  if (existing.lastRevenuecatEventId === updates.eventId) {
    return { ...mapSubscriptionRow(existing), webhookApplied: false };
  }
  if (
    updates.eventTimestampMs != null &&
    existing.lastRevenuecatEventTimestampMs != null
  ) {
    const lastTs = Number(existing.lastRevenuecatEventTimestampMs);
    if (!Number.isNaN(lastTs) && updates.eventTimestampMs < lastTs) {
      // Stale retry — event is older than the last persisted event.
      return { ...mapSubscriptionRow(existing), webhookApplied: false };
    }
  }

  const setValues: Partial<typeof subscriptions.$inferInsert> = {
    lastRevenuecatEventId: updates.eventId,
    updatedAt: new Date(),
  };

  if (updates.eventTimestampMs != null) {
    setValues.lastRevenuecatEventTimestampMs = String(updates.eventTimestampMs);
  }

  if (updates.tier !== undefined) {
    setValues.tier = updates.tier;
  }
  if (updates.status !== undefined && updates.status !== existing.status) {
    if (!isValidTransition(existing.status, updates.status)) {
      // [BUG-447] Throw so callers (handleRenewal, handleProductChange) do NOT
      // proceed to updateQuotaPoolLimit. Returning the existing row silently
      // caused quota pool to reflect newTier while subscription.tier stayed
      // at oldTier — divergent billing state. Throwing surfaces the problem
      // immediately and prevents the downstream quota update from firing.
      const transitionErr = new Error(
        `Invalid subscription transition: ${existing.status} -> ${updates.status}`,
      );
      logger.error('Invalid subscription transition — aborting update', {
        from: existing.status,
        to: updates.status,
        subscriptionId: existing.id,
        tag: 'billing.invalid_transition',
      });
      captureException(transitionErr, {
        extra: {
          subscriptionId: existing.id,
          fromStatus: existing.status,
          toStatus: updates.status,
          tag: 'billing.invalid_transition',
        },
      });
      throw transitionErr;
    }
    setValues.status = updates.status;
  }
  if (updates.currentPeriodStart !== undefined) {
    setValues.currentPeriodStart = new Date(updates.currentPeriodStart);
  }
  if (updates.currentPeriodEnd !== undefined) {
    setValues.currentPeriodEnd = updates.currentPeriodEnd
      ? new Date(updates.currentPeriodEnd)
      : null;
  }
  if (updates.cancelledAt !== undefined) {
    setValues.cancelledAt = updates.cancelledAt
      ? new Date(updates.cancelledAt)
      : null;
  }
  if (updates.trialEndsAt !== undefined) {
    setValues.trialEndsAt = updates.trialEndsAt
      ? new Date(updates.trialEndsAt)
      : null;
  }

  // [CR-2026-05-19-M3] SITE 4: SQL-level status guard in WHERE clause.
  // If a status transition was validated above, include
  // `AND status = existing.status` in the WHERE so the UPDATE is rejected
  // (0 rows returned) if the row was concurrently mutated to a different
  // status between our SELECT and this UPDATE — even within a transaction
  // (e.g. a savepoint rollback + retry scenario). The JS throw above handles
  // the semantics; this guard closes the storage-layer gap.
  //
  // Concurrent-delivery defense: under READ COMMITTED two transactions can
  // both see lastRevenuecatEventId !== updates.eventId at SELECT time and
  // both proceed to UPDATE the same row (last-writer-wins). Adding the
  // event-ID predicate makes the second UPDATE re-evaluate against the
  // post-commit row and return 0 rows, so we can detect the duplicate and
  // return the existing snapshot instead of double-writing.
  const whereParts = [eq(subscriptions.id, existing.id)];
  if (updates.status !== undefined && updates.status !== existing.status) {
    whereParts.push(eq(subscriptions.status, existing.status));
  }
  const eventIdPredicate = or(
    isNull(subscriptions.lastRevenuecatEventId),
    ne(subscriptions.lastRevenuecatEventId, updates.eventId),
  );
  if (eventIdPredicate) whereParts.push(eventIdPredicate);
  if (updates.eventTimestampMs != null) {
    const eventTimestampPredicate = or(
      isNull(subscriptions.lastRevenuecatEventTimestampMs),
      sql`(${subscriptions.lastRevenuecatEventTimestampMs})::bigint <= ${updates.eventTimestampMs}`,
    );
    if (eventTimestampPredicate) whereParts.push(eventTimestampPredicate);
  }

  const [updated] = await db
    .update(subscriptions)
    .set(setValues)
    .where(and(...whereParts))
    .returning();

  if (!updated) {
    // 0 rows returned most likely means a concurrent delivery already
    // stamped this eventId. Re-read and confirm before short-circuiting.
    const recheck = await repo.subscriptions.findFirst();
    if (recheck && recheck.lastRevenuecatEventId === updates.eventId) {
      return { ...mapSubscriptionRow(recheck), webhookApplied: false };
    }
    if (
      recheck &&
      updates.eventTimestampMs != null &&
      recheck.lastRevenuecatEventTimestampMs != null
    ) {
      const lastTs = Number(recheck.lastRevenuecatEventTimestampMs);
      if (!Number.isNaN(lastTs) && updates.eventTimestampMs < lastTs) {
        return { ...mapSubscriptionRow(recheck), webhookApplied: false };
      }
    }
    throw new Error(
      'Subscription update did not return a row — concurrent status mutation detected or row missing',
    );
  }
  return { ...mapSubscriptionRow(updated), webhookApplied: true };
}

// ---------------------------------------------------------------------------
// activateSubscriptionFromRevenuecat
// ---------------------------------------------------------------------------

/**
 * Activates (or creates) a subscription from a RevenueCat purchase event.
 * Similar to `activateSubscriptionFromCheckout` but keyed by accountId
 * instead of stripeSubscriptionId.
 */
export async function activateSubscriptionFromRevenuecat(
  db: Database,
  accountId: string,
  tier: 'plus' | 'family' | 'pro',
  eventId: string,
  options?: {
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    revenuecatOriginalAppUserId?: string;
    /** When true, sets status to 'trial' and stores trialEndsAt (expiration_at_ms). */
    isTrial?: boolean;
    /** ISO 8601 trial end date. Required when isTrial is true. */
    trialEndsAt?: string;
    /** BD-01: Event timestamp for ordering-based idempotency. */
    eventTimestampMs?: number;
  },
): Promise<SubscriptionRow> {
  const existing = await getSubscriptionByAccountId(db, accountId);

  const tierConfig = getTierConfig(tier);
  const isTrial = options?.isTrial ?? false;
  const trialEndsAt = options?.trialEndsAt;

  // BD-03: enforce trialEndsAt when isTrial is true
  if (isTrial && !trialEndsAt) {
    logger.error('trialEndsAt is required when isTrial is true', {
      accountId,
    });
    captureException(
      new Error(
        'Trial activation missing trialEndsAt — falling back to non-trial',
      ),
      { extra: { accountId, tier, eventId } },
    );
    // Gracefully fall back to non-trial activation rather than crashing the webhook
    return activateSubscriptionFromRevenuecat(db, accountId, tier, eventId, {
      ...options,
      isTrial: false,
    });
  }

  const status = isTrial ? 'trial' : 'active';

  if (!existing) {
    const subRow = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(subscriptions)
        .values({
          accountId,
          tier,
          status,
          lastRevenuecatEventId: eventId,
          lastRevenuecatEventTimestampMs:
            options?.eventTimestampMs != null
              ? String(options.eventTimestampMs)
              : null,
          revenuecatOriginalAppUserId:
            options?.revenuecatOriginalAppUserId ?? null,
          currentPeriodStart: options?.currentPeriodStart
            ? new Date(options.currentPeriodStart)
            : null,
          currentPeriodEnd: options?.currentPeriodEnd
            ? new Date(options.currentPeriodEnd)
            : null,
          trialEndsAt: options?.trialEndsAt
            ? new Date(options.trialEndsAt)
            : null,
        })
        .returning();

      if (!inserted)
        throw new Error('Subscription insert did not return a row');

      const now = new Date();
      const cycleResetAt = new Date(now);
      cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

      await tx.insert(quotaPools).values({
        subscriptionId: inserted.id,
        monthlyLimit: tierConfig.monthlyQuota,
        usedThisMonth: 0,
        dailyLimit: tierConfig.dailyLimit,
        usedToday: 0,
        cycleResetAt,
      });
      await reconcileQuotaStateForSubscription(
        tx as unknown as Database,
        inserted.id,
      );

      return inserted;
    });

    return mapSubscriptionRow(subRow);
  }

  if (existing.lastRevenuecatEventId === eventId) {
    return existing;
  }
  if (
    options?.eventTimestampMs != null &&
    existing.lastRevenuecatEventTimestampMs != null
  ) {
    const lastTs = Number(existing.lastRevenuecatEventTimestampMs);
    if (!Number.isNaN(lastTs) && options.eventTimestampMs < lastTs) {
      return existing;
    }
  }

  // Update existing subscription
  const setValues: Record<string, unknown> = {
    tier,
    status,
    lastRevenuecatEventId: eventId,
    updatedAt: new Date(),
  };

  if (options?.eventTimestampMs != null) {
    setValues.lastRevenuecatEventTimestampMs = String(options.eventTimestampMs);
  }

  if (options?.revenuecatOriginalAppUserId) {
    setValues.revenuecatOriginalAppUserId = options.revenuecatOriginalAppUserId;
  }
  if (options?.currentPeriodStart) {
    setValues.currentPeriodStart = new Date(options.currentPeriodStart);
  }
  if (options?.currentPeriodEnd) {
    setValues.currentPeriodEnd = new Date(options.currentPeriodEnd);
  }
  // BD-02: explicitly clear trialEndsAt on non-trial re-activation
  setValues.trialEndsAt = isTrial && trialEndsAt ? new Date(trialEndsAt) : null;

  // [CR-2026-05-19-M3 / atomicity] Both the subscription update and the quota
  // pool update must be atomic — a process death between the two would leave
  // subscriptions.tier at the new value while the quota pool still carries the
  // old limit (billing leak). Wrap in a transaction so both commit or neither does.
  const updated = await db.transaction(async (tx) => {
    const whereParts = [eq(subscriptions.id, existing.id)];
    const eventIdPredicate = or(
      isNull(subscriptions.lastRevenuecatEventId),
      ne(subscriptions.lastRevenuecatEventId, eventId),
    );
    if (eventIdPredicate) whereParts.push(eventIdPredicate);
    if (options?.eventTimestampMs != null) {
      const eventTimestampPredicate = or(
        isNull(subscriptions.lastRevenuecatEventTimestampMs),
        sql`(${subscriptions.lastRevenuecatEventTimestampMs})::bigint <= ${options.eventTimestampMs}`,
      );
      if (eventTimestampPredicate) whereParts.push(eventTimestampPredicate);
    }

    const [row] = await tx
      .update(subscriptions)
      .set(setValues)
      .where(and(...whereParts))
      .returning();

    if (!row) {
      const latest = await tx.query.subscriptions.findFirst({
        where: eq(subscriptions.accountId, accountId),
      });
      if (latest) return latest;
      throw new Error('Subscription update (revenuecat) did not return a row');
    }

    // Update quota pool limit to match the new tier (inside same tx)
    const [quotaPool] = await tx
      .update(quotaPools)
      .set({
        monthlyLimit: tierConfig.monthlyQuota,
        dailyLimit: tierConfig.dailyLimit,
        updatedAt: new Date(),
      })
      .where(eq(quotaPools.subscriptionId, existing.id))
      .returning({ id: quotaPools.id });

    if (!quotaPool)
      throw new Error('Quota pool update (revenuecat) did not return a row');

    await reconcileQuotaStateForSubscription(
      tx as unknown as Database,
      existing.id,
    );
    return row;
  });

  return mapSubscriptionRow(updated);
}
