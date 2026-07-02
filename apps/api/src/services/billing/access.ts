// [WI-1239 / 779-strip] KEPT — getEffectiveAccessForSubscription reads the
// legacy `subscriptions` table via findSubscriptionById__unscoped, but its
// only remaining caller is family.ts's canAddProfile, itself transitively
// reachable only from services/profile.ts's createProfileWithLimitCheck
// (out of WI-1239's scope; dead in production, routes use createChildProfileV2).
// Live v2 equivalent: billing-v2/access-v2.ts's getEffectiveAccessForSubscriptionV2.
import {
  type Database,
  findSubscriptionById__unscoped,
} from '@eduagent/database';
import type { BillingAccess, SubscriptionTier } from '@eduagent/schemas';

import { resolveEffectiveAccessTier } from '../subscription';

export interface EffectiveSubscriptionAccess {
  subscription: NonNullable<
    Awaited<ReturnType<typeof findSubscriptionById__unscoped>>
  >;
  effectiveAccessTier: SubscriptionTier;
  billingAccess: BillingAccess;
}

export async function getEffectiveAccessForSubscription(
  db: Database,
  subscriptionId: string,
  now = new Date(),
): Promise<EffectiveSubscriptionAccess | null> {
  const subscription = await findSubscriptionById__unscoped(db, subscriptionId);
  if (!subscription) return null;

  const access = resolveEffectiveAccessTier(
    {
      tier: subscription.tier,
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    },
    now,
  );

  return { subscription, ...access };
}
