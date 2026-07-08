// ---------------------------------------------------------------------------
// Billing — Top-up credit management (Story 5.3)
// ---------------------------------------------------------------------------

import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { topUpCredits, type Database } from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';
import { getTierConfig } from '../subscription';
import { safeSend } from '../safe-non-core';
import { inngest } from '../../inngest/client';

// [WI-1239 / 779-strip] purchaseTopUpCredits (legacy — read the `subscriptions`
// table via findSubscriptionById__unscoped, since deleted), isTopUpAlreadyGranted,
// and countTopUpPurchasesSinceCycleStart were removed — dead, superseded by
// purchaseTopUpCreditsV2 (billing-v2/top-up-v2.ts) and its own idempotency
// check. getTopUpCreditsRemaining / findExpiringTopUpCredits below are kept:
// neutral (topUpCredits by subscriptionId only), and live.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TopUpCreditRow {
  id: string;
  subscriptionId: string;
  profileId: string | null;
  amount: number;
  remaining: number;
  purchasedAt: string;
  expiresAt: string;
  revenuecatTransactionId: string | null;
  createdAt: string;
}

export interface TopUpCreditsReattributedEventData {
  subscriptionId: string;
  accountId: string;
  previousTier: SubscriptionTier;
  newTier: SubscriptionTier;
  previousModel: 'per-profile' | 'shared-pool';
  newModel: 'per-profile' | 'shared-pool';
  reattributedCount: number;
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function mapTopUpCreditRow(
  row: typeof topUpCredits.$inferSelect,
): TopUpCreditRow {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    profileId: row.profileId,
    amount: row.amount,
    remaining: row.remaining,
    purchasedAt: row.purchasedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revenuecatTransactionId: row.revenuecatTransactionId,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Aggregates total remaining credits across all unexpired top-up packs
 * for a subscription.
 */
export async function getTopUpCreditsRemaining(
  db: Database,
  subscriptionId: string,
  now: Date = new Date(),
  profileId?: string,
): Promise<number> {
  const filters = [
    eq(topUpCredits.subscriptionId, subscriptionId),
    sql`${topUpCredits.remaining} > 0`,
    sql`${topUpCredits.expiresAt} > ${now}`,
  ];
  if (profileId) {
    filters.push(eq(topUpCredits.profileId, profileId));
  }

  // scope-allow: account-level top-up total; optional profileId narrows per-profile callers.
  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM(${topUpCredits.remaining}), 0)::int`,
    })
    .from(topUpCredits)
    .where(and(...filters));

  return result[0]?.total ?? 0;
}

/**
 * Finds top-up credit packs expiring within a date range.
 * Used by the Inngest top-up expiry reminder function.
 */
export async function findExpiringTopUpCredits(
  db: Database,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<TopUpCreditRow[]> {
  const rows = await db.query.topUpCredits.findMany({
    where: and(
      sql`${topUpCredits.remaining} > 0`,
      gte(topUpCredits.expiresAt, rangeStart),
      lte(topUpCredits.expiresAt, rangeEnd),
    ),
  });
  return rows.map(mapTopUpCreditRow);
}

// ---------------------------------------------------------------------------
// [WI-1239 / 779-strip] Top-up pricing + re-attribution metric
// ---------------------------------------------------------------------------
// Relocated from the legacy tier.ts (whose remaining surface is dead in
// production) — these are live: emitTopUpCreditsReattributedMetric is called
// directly by both v2 webhook handlers, and getTopUpPriceCents by
// routes/billing.ts. Kept alongside the rest of the top-up domain logic.

/**
 * Returns the top-up price in EUR cents for a given tier.
 * Free tier cannot purchase top-ups (returns null).
 */
export function getTopUpPriceCents(tier: SubscriptionTier): number | null {
  const config = getTierConfig(tier);
  if (config.topUpPrice === 0) {
    return null;
  }
  return config.topUpPrice * 100;
}

/**
 * Pure builder — single source of truth for the
 * `app/billing.topup_credits.reattributed` payload so the Stripe path and
 * the RevenueCat webhook path emit an identical schema under the single
 * event name. Exported for the schema-coherence assertion in
 * tier.integration.test.ts.
 */
export function buildTopUpCreditsReattributedEventData(params: {
  subscriptionId: string;
  accountId: string;
  previousTier: SubscriptionTier;
  newTier: SubscriptionTier;
  reattributedCount: number;
  occurredAt: Date;
}): TopUpCreditsReattributedEventData {
  return {
    subscriptionId: params.subscriptionId,
    accountId: params.accountId,
    previousTier: params.previousTier,
    newTier: params.newTier,
    previousModel: getTierConfig(params.previousTier).quotaModel,
    newModel: getTierConfig(params.newTier).quotaModel,
    reattributedCount: params.reattributedCount,
    occurredAt: params.occurredAt.toISOString(),
  };
}

/**
 * Emits the queryable re-attribution metric (silent-recovery-banned rule).
 * Both tier-change paths call this — a dispatch failure must never break
 * the tier change, so it routes through safeSend.
 */
export async function emitTopUpCreditsReattributedMetric(params: {
  subscriptionId: string;
  accountId: string;
  previousTier: SubscriptionTier;
  newTier: SubscriptionTier;
  reattributedCount: number;
  occurredAt: Date;
}): Promise<void> {
  const data = buildTopUpCreditsReattributedEventData(params);
  await safeSend(
    () =>
      inngest.send({
        // orphan-allow: structured telemetry required by AGENTS.md
        // ("silent recovery in billing must emit a structured metric").
        // The re-attribution is handled in-line. This event is a
        // dashboard-queryable signal so ops can audit credit migration.
        name: 'app/billing.topup_credits.reattributed',
        data,
      }),
    'billing.topup_credits.reattributed',
    {
      subscriptionId: data.subscriptionId,
      reattributedCount: data.reattributedCount,
    },
  );
}
