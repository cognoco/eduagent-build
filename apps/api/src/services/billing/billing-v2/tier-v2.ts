// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — billing-v2 top-up re-attribution on tier-model change
//
// v2 twin of tier.ts `reattributeTopUpCreditsOnModelChange`. The only identity
// read is the owner-profile lookup on a shared-pool → per-profile transition:
// legacy reads `profiles` by (accountId, is_owner); v2 resolves the owner person
// via findOwnerPersonId on the subscription's organization. The `accountId`
// parameter is the organization id under the flag. The `top_up_credits` re-write
// is a satellite, unchanged.
//
// Flag-gated: called by the v2 RevenueCat core
// (updateSubscriptionAndQuotaFromRevenuecatWebhookV2). Legacy tier.ts stays
// byte-identical.
// ---------------------------------------------------------------------------

import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { topUpCredits, type Database } from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';
import { getTierConfig } from '../../subscription';
import { createLogger } from '../../logger';
import { findOwnerPersonId } from '../../identity-v2/helpers';

const logger = createLogger();

/**
 * v2 of reattributeTopUpCreditsOnModelChange. `organizationId` is the v2 image
 * of the legacy `accountId`. Owner resolution uses membership.roles instead of
 * profiles.is_owner; everything else (the null↔owner credit re-attribution) is
 * identical.
 */
export async function reattributeTopUpCreditsOnModelChangeV2(
  tx: Database,
  subscriptionId: string,
  organizationId: string,
  previousTier: SubscriptionTier,
  newTier: SubscriptionTier,
): Promise<number> {
  const oldModel = getTierConfig(previousTier).quotaModel;
  const newModel = getTierConfig(newTier).quotaModel;

  if (oldModel === newModel) return 0;

  if (newModel === 'per-profile') {
    // shared-pool → per-profile: re-attribute null credits to the owner person.
    const ownerPersonId = await findOwnerPersonId(tx, organizationId);

    if (!ownerPersonId) {
      logger.warn(
        '[billing.tier] shared-pool→per-profile: no owner person found; top-up credits left with profileId=null',
        { subscriptionId, newTier, metric: 'billing_tier_topup_no_owner' },
      );
      return 0;
    }

    const updated = await tx
      .update(topUpCredits)
      .set({ profileId: ownerPersonId })
      .where(
        and(
          eq(topUpCredits.subscriptionId, subscriptionId),
          isNull(topUpCredits.profileId),
          sql`${topUpCredits.remaining} > 0`,
        ),
      )
      .returning({ id: topUpCredits.id });
    return updated.length;
  }

  // per-profile → shared-pool: re-attribute owner-profile credits to null.
  const updated = await tx
    .update(topUpCredits)
    .set({ profileId: null })
    .where(
      and(
        eq(topUpCredits.subscriptionId, subscriptionId),
        isNotNull(topUpCredits.profileId),
        sql`${topUpCredits.remaining} > 0`,
      ),
    )
    .returning({ id: topUpCredits.id });
  return updated.length;
}
