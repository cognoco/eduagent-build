// ---------------------------------------------------------------------------
// Billing — RevenueCat webhook helpers (Epic 9)
// isRevenuecatEventProcessed, updateSubscriptionFromRevenuecatWebhook,
// activateSubscriptionFromRevenuecat
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import {
  subscriptions,
  quotaPools,
  type Database,
  createAccountRepository,
} from '@eduagent/database';
import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';
import { getTierConfig, isValidTransition } from '../subscription';
import { captureException } from '../sentry';
import { createLogger } from '../logger';
import { mapSubscriptionRow, type SubscriptionRow } from './types';

const logger = createLogger();
import {
  updateQuotaPoolLimit,
  getSubscriptionByAccountId,
} from './subscription-core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevenuecatWebhookUpdate {
  tier?: SubscriptionTier;
  status?: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelledAt?: string | null;
  trialEndsAt?: string | null;
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
): Promise<SubscriptionRow | null> {
  return db.transaction(async (tx) => {
    // Known Drizzle pattern: PgTransaction → Database cast (see feedback_drizzle_transaction_cast.md)
    const txDb = tx as unknown as Database;
    const repo = createAccountRepository(txDb, accountId);
    const existing = await repo.subscriptions.findFirst();

    if (!existing) return null;

    // [CR-2026-05-19-M11] Idempotency check INSIDE the transaction so the read is
    // coherent with the write. Two concurrent calls with the same eventId will
    // serialize here; the second will see the already-stamped eventId and return
    // early without a second write.
    if (existing.lastRevenuecatEventId === updates.eventId) {
      return mapSubscriptionRow(existing);
    }
    if (
      updates.eventTimestampMs != null &&
      existing.lastRevenuecatEventTimestampMs != null
    ) {
      const lastTs = Number(existing.lastRevenuecatEventTimestampMs);
      if (!Number.isNaN(lastTs) && updates.eventTimestampMs < lastTs) {
        // Stale retry — event is older than the last persisted event.
        return mapSubscriptionRow(existing);
      }
    }

    const setValues: Partial<typeof subscriptions.$inferInsert> = {
      lastRevenuecatEventId: updates.eventId,
      updatedAt: new Date(),
    };

    if (updates.eventTimestampMs != null) {
      setValues.lastRevenuecatEventTimestampMs = String(
        updates.eventTimestampMs,
      );
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
      setValues.currentPeriodEnd = new Date(updates.currentPeriodEnd);
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

    const [updated] = await tx
      .update(subscriptions)
      .set(setValues)
      .where(eq(subscriptions.id, existing.id))
      .returning();

    if (!updated) throw new Error('Subscription update did not return a row');
    return mapSubscriptionRow(updated);
  });
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
    // Create new subscription + quota pool
    const [subRow] = await db
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

    if (!subRow) throw new Error('Subscription insert did not return a row');

    const now = new Date();
    const cycleResetAt = new Date(now);
    cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

    await db.insert(quotaPools).values({
      subscriptionId: subRow.id,
      monthlyLimit: tierConfig.monthlyQuota,
      usedThisMonth: 0,
      dailyLimit: tierConfig.dailyLimit,
      usedToday: 0,
      cycleResetAt,
    });

    return mapSubscriptionRow(subRow);
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

  const [updated] = await db
    .update(subscriptions)
    .set(setValues)
    .where(eq(subscriptions.id, existing.id))
    .returning();

  // Update quota pool limit to match the new tier
  await updateQuotaPoolLimit(
    db,
    existing.id,
    tierConfig.monthlyQuota,
    tierConfig.dailyLimit,
  );

  if (!updated)
    throw new Error('Subscription update (revenuecat) did not return a row');
  return mapSubscriptionRow(updated);
}
