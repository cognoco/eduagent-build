// ---------------------------------------------------------------------------
// Billing — Top-up credit management (Story 5.3)
// ---------------------------------------------------------------------------

import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import {
  profiles,
  topUpCredits,
  type Database,
  findSubscriptionById__unscoped,
  findTopUpByTransactionId__unscoped,
} from '@eduagent/database';
import { getTierConfig } from '../subscription';

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

  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM(${topUpCredits.remaining}), 0)::int`,
    })
    .from(topUpCredits)
    .where(and(...filters));

  return result[0]?.total ?? 0;
}

/** 12-month expiry constant for top-up credits. */
const TOP_UP_EXPIRY_MONTHS = 12;

/**
 * Checks whether a top-up credit pack with the given RevenueCat transaction ID
 * has already been granted. Used for idempotency on webhook retries.
 */
export async function isTopUpAlreadyGranted(
  db: Database,
  transactionId: string,
): Promise<boolean> {
  // safe-caller: RevenueCat IPN webhook — authenticated by signed IPN payload; no user-facing output
  const existing = await findTopUpByTransactionId__unscoped(db, transactionId);
  return !!existing;
}

/**
 * Creates a top-up credit pack for a subscription.
 * Credits expire 12 months after purchase.
 *
 * Only paid tiers (plus, family, pro) can purchase top-ups.
 * Returns null if the subscription's tier is not eligible.
 *
 * BS-02: Uses INSERT ... ON CONFLICT DO NOTHING on the unique
 * `revenuecatTransactionId` index to prevent double-granting credits
 * from concurrent webhook retries. Returns null when the insert is
 * a no-op (duplicate transaction).
 */
export async function purchaseTopUpCredits(
  db: Database,
  subscriptionId: string,
  amount: number,
  now: Date = new Date(),
  transactionId?: string,
  profileId?: string,
): Promise<TopUpCreditRow | null> {
  // Verify subscription exists and tier is eligible
  // safe-caller: RevenueCat IPN webhook — authenticated by signed IPN payload; subscriptionId from verified payload
  const sub = await findSubscriptionById__unscoped(db, subscriptionId);

  if (!sub || sub.tier === 'free') {
    return null;
  }

  const quotaModel = getTierConfig(sub.tier).quotaModel;
  let buyerProfileId: string | null = profileId ?? null;
  if (quotaModel === 'per-profile') {
    const owner = await db.query.profiles.findFirst({
      where: and(
        eq(profiles.accountId, sub.accountId),
        eq(profiles.isOwner, true),
        isNull(profiles.archivedAt),
      ),
      columns: { id: true },
    });
    if (!owner) return null;
    if (buyerProfileId && buyerProfileId !== owner.id) return null;
    buyerProfileId = owner.id;
  }

  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + TOP_UP_EXPIRY_MONTHS);

  // When transactionId is provided, use onConflictDoNothing to atomically
  // prevent duplicate grants. If the row already exists (duplicate txn),
  // the INSERT returns no rows and we return null.
  if (transactionId) {
    const rows = await db
      .insert(topUpCredits)
      .values({
        subscriptionId,
        profileId: quotaModel === 'per-profile' ? buyerProfileId : null,
        amount,
        remaining: amount,
        purchasedAt: now,
        expiresAt,
        revenuecatTransactionId: transactionId,
      })
      .onConflictDoNothing({
        target: topUpCredits.revenuecatTransactionId,
      })
      .returning();

    if (rows.length === 0) {
      // Duplicate transaction — credit already granted
      return null;
    }
    const insertedRow = rows[0];
    if (!insertedRow)
      throw new Error('Top-up credit insert did not return a row');
    return mapTopUpCreditRow(insertedRow);
  }

  // No transactionId — plain insert (internal/test usage)
  const [row] = await db
    .insert(topUpCredits)
    .values({
      subscriptionId,
      profileId: quotaModel === 'per-profile' ? buyerProfileId : null,
      amount,
      remaining: amount,
      purchasedAt: now,
      expiresAt,
      revenuecatTransactionId: null,
    })
    .returning();

  if (!row) throw new Error('Top-up credit insert did not return a row');
  return mapTopUpCreditRow(row);
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

/**
 * Counts how many top-up packs have been purchased for a subscription
 * in the current billing cycle (since cycleStart).
 * Used for the context-aware upgrade prompt: "3+ top-ups in a cycle".
 */
export async function countTopUpPurchasesSinceCycleStart(
  db: Database,
  subscriptionId: string,
  cycleStart: Date,
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(topUpCredits)
    .where(
      and(
        eq(topUpCredits.subscriptionId, subscriptionId),
        gte(topUpCredits.purchasedAt, cycleStart),
      ),
    );
  return result[0]?.count ?? 0;
}
