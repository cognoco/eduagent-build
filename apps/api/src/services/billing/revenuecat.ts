// ---------------------------------------------------------------------------
// Billing — RevenueCat webhook helpers (Epic 9)
// isRevenuecatEventProcessed, updateSubscriptionFromRevenuecatWebhook,
// activateSubscriptionFromRevenuecat
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import { subscriptions, quotaPools, type Database } from '@eduagent/database';
import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';
import { getTierConfig, isValidTransition } from '../subscription';
import { captureException } from '../sentry';
import { mapSubscriptionRow, type SubscriptionRow } from './types';
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
  eventTimestampMs?: number
): Promise<boolean> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.accountId, accountId),
  });
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
 */
export async function updateSubscriptionFromRevenuecatWebhook(
  db: Database,
  accountId: string,
  updates: RevenuecatWebhookUpdate & {
    eventId: string;
    eventTimestampMs?: number;
  }
): Promise<SubscriptionRow | null> {
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.accountId, accountId),
  });

  if (!existing) return null;

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
      console.error(
        `[billing] Invalid subscription transition: ${existing.status} -> ${updates.status} (sub: ${existing.id})`
      );
      captureException(
        new Error(
          `Invalid subscription transition: ${existing.status} -> ${updates.status}`
        ),
        {
          extra: {
            subscriptionId: existing.id,
            fromStatus: existing.status,
            toStatus: updates.status,
          },
        }
      );
      return mapSubscriptionRow(existing);
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

  const [updated] = await db
    .update(subscriptions)
    .set(setValues)
    .where(eq(subscriptions.id, existing.id))
    .returning();

  return mapSubscriptionRow(updated!);
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
  }
): Promise<SubscriptionRow> {
  const existing = await getSubscriptionByAccountId(db, accountId);

  const tierConfig = getTierConfig(tier);
  const isTrial = options?.isTrial ?? false;
  const trialEndsAt = options?.trialEndsAt;

  // BD-03: enforce trialEndsAt when isTrial is true
  if (isTrial && !trialEndsAt) {
    console.error(
      `[billing] trialEndsAt is required when isTrial is true (account: ${accountId})`
    );
    captureException(
      new Error(
        'Trial activation missing trialEndsAt — falling back to non-trial'
      ),
      { extra: { accountId, tier, eventId } }
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

    const now = new Date();
    const cycleResetAt = new Date(now);
    cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

    await db.insert(quotaPools).values({
      subscriptionId: subRow!.id,
      monthlyLimit: tierConfig.monthlyQuota,
      usedThisMonth: 0,
      dailyLimit: tierConfig.dailyLimit,
      usedToday: 0,
      cycleResetAt,
    });

    return mapSubscriptionRow(subRow!);
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
    tierConfig.dailyLimit
  );

  return mapSubscriptionRow(updated!);
}
