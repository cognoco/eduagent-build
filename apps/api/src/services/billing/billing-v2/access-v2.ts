// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — billing-v2 effective-access resolver
//
// v2 twin of `getEffectiveAccessForSubscription` (access.ts). The legacy reader
// loads the subscription from the `subscriptions` table by primary key; the v2
// reader loads it from the new `subscription` table by the SAME id
// (subscription.id = subscriptions.id by the reseed). The effective-tier policy
// (`resolveEffectiveAccessTier`) is store-agnostic and shared verbatim.
//
// Flag-gated: reachable only when IDENTITY_V2_ENABLED='true'. Legacy access.ts
// stays byte-identical.
// ---------------------------------------------------------------------------

import { type Database } from '@eduagent/database';
import { eq } from 'drizzle-orm';
import { subscription as subscriptionTable } from '@eduagent/database';
import type { BillingAccess, SubscriptionTier } from '@eduagent/schemas';

import { resolveEffectiveAccessTier } from '../../subscription';
import type { SubscriptionRow } from '../types';
import { mapSubscriptionV2Row } from './types-v2';

export interface EffectiveSubscriptionAccessV2 {
  /**
   * The subscription row mapped to the legacy SubscriptionRow shape (accountId,
   * tier, status, currentPeriodStart/End as ISO strings). Using the canonical
   * SubscriptionRow type ensures TypeScript verifies field presence at compile
   * time — no escape casts needed.
   */
  subscription: SubscriptionRow;
  effectiveAccessTier: SubscriptionTier;
  billingAccess: BillingAccess;
}

/**
 * v2 effective-access resolver. Reads the new `subscription` table by id and
 * runs the same effective-tier policy as the legacy resolver. `planTier` →
 * `tier` and `periodEndAt` → `currentPeriodEnd` are mapped into the policy
 * input; the returned `subscription` carries the legacy-shaped tier/status so
 * downstream readers (which only consult tier/status/period) are insulated.
 */
export async function getEffectiveAccessForSubscriptionV2(
  db: Database,
  subscriptionId: string,
  now = new Date(),
): Promise<EffectiveSubscriptionAccessV2 | null> {
  const row = await db.query.subscription.findFirst({
    where: eq(subscriptionTable.id, subscriptionId),
  });
  if (!row) return null;

  // mapSubscriptionV2Row validates planTier/status through the schema contract
  // and returns a fully-typed SubscriptionRow — no escape cast required.
  const subscription = mapSubscriptionV2Row(row);

  const access = resolveEffectiveAccessTier(
    {
      tier: subscription.tier,
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
    },
    now,
  );

  return { subscription, ...access };
}
