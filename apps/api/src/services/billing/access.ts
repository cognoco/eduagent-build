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
