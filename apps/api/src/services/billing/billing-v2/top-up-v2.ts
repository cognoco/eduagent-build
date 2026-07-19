// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — billing-v2 top-up credit grant
//
// v2 twin of top-up.ts `purchaseTopUpCredits`. Two identity reads are
// re-pointed: the subscription lookup (legacy `subscriptions` by id → new
// `subscription` by id) and the per-profile owner resolution (legacy
// `profiles.is_owner` → `membership.roles @> '{admin}'` via findOwnerPersonId).
// The `top_up_credits` write is a satellite, unchanged — including the
// `revenuecat_transaction_id` ON-CONFLICT idempotency (BS-02).
//
// Flag-gated: called by the v2 RevenueCat handler (handleNonRenewingPurchaseV2).
// Legacy top-up.ts stays byte-identical.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import {
  topUpCredits,
  subscription as subscriptionTable,
  type Database,
} from '@eduagent/database';
import { getTierConfig } from '../../subscription';
import { findOwnerPersonId } from '../../identity-v2/helpers';
import { addMonthsClamped } from '../billing-shared';
import type { TopUpCreditRow } from '../top-up';
import { parseSubscriptionV2PlanTier } from './types-v2';

const TOP_UP_EXPIRY_MONTHS = 12;

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

/**
 * v2 of purchaseTopUpCredits. Reads the new `subscription` table by id for the
 * tier-eligibility check; for per-profile tiers resolves the buyer (owner) via
 * findOwnerPersonId on the subscription's organization. The satellite insert +
 * idempotency are identical to the legacy function.
 */
export async function purchaseTopUpCreditsV2(
  db: Database,
  subscriptionId: string,
  amount: number,
  now: Date = new Date(),
  transactionId?: string,
  profileId?: string,
): Promise<TopUpCreditRow | null> {
  // safe-caller: RevenueCat IPN webhook — authenticated by signed IPN payload.
  const sub = await db.query.subscription.findFirst({
    where: eq(subscriptionTable.id, subscriptionId),
  });

  if (!sub) {
    return null;
  }

  const tier = parseSubscriptionV2PlanTier(sub.planTier);
  if (tier === 'free') {
    return null;
  }

  const quotaModel = getTierConfig(tier).quotaModel;
  let buyerProfileId: string | null = profileId ?? null;
  if (quotaModel === 'per-profile') {
    const ownerPersonId = await findOwnerPersonId(db, sub.organizationId);
    if (!ownerPersonId) return null;
    if (buyerProfileId && buyerProfileId !== ownerPersonId) return null;
    buyerProfileId = ownerPersonId;
  }

  const expiresAt = addMonthsClamped(now, TOP_UP_EXPIRY_MONTHS);

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
      .onConflictDoNothing({ target: topUpCredits.revenuecatTransactionId })
      .returning();

    if (rows.length === 0) {
      // Duplicate transaction — credit already granted.
      return null;
    }
    const insertedRow = rows[0];
    if (!insertedRow)
      throw new Error('Top-up credit insert did not return a row');
    return mapTopUpCreditRow(insertedRow);
  }

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
