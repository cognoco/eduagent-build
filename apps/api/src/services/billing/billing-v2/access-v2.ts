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

import {
  type Database,
  findSubscriptionById__unscoped,
} from '@eduagent/database';
import { eq } from 'drizzle-orm';
import { subscription as subscriptionTable } from '@eduagent/database';
import type { BillingAccess, SubscriptionTier } from '@eduagent/schemas';

import { resolveEffectiveAccessTier } from '../../subscription';
import {
  parseSubscriptionV2PlanTier,
  parseSubscriptionV2Status,
} from './types-v2';

export interface EffectiveSubscriptionAccessV2 {
  /**
   * The raw new-table subscription row. Typed off the legacy unscoped helper's
   * return so the access shape stays interchangeable at the call sites that only
   * read tier/status/period (the fields both tables share by name except the two
   * mapped below, which the caller does not consume from this struct).
   */
  subscription: NonNullable<
    Awaited<ReturnType<typeof findSubscriptionById__unscoped>>
  >;
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

  const tier = parseSubscriptionV2PlanTier(row.planTier);
  const status = parseSubscriptionV2Status(row.status);

  const access = resolveEffectiveAccessTier(
    {
      tier,
      status,
      trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: row.periodEndAt?.toISOString() ?? null,
    },
    now,
  );

  // Re-shape the new-table row into the legacy subscription struct the caller
  // expects (tier/status/period field names), preserving the id and the
  // store-correlation columns. Only the fields downstream actually reads are
  // surfaced under their legacy names.
  const legacyShaped = {
    ...row,
    accountId: row.organizationId,
    tier,
    status,
    currentPeriodStart: row.periodStartAt,
    currentPeriodEnd: row.periodEndAt,
  } as unknown as EffectiveSubscriptionAccessV2['subscription'];

  return { subscription: legacyShaped, ...access };
}
