import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  profileQuotaUsage,
  profiles,
  quotaPools,
  subscriptions,
  type Database,
} from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';

import { getTierConfig, resolveEffectiveAccessTier } from '../subscription';
import { provisionProfileQuotaUsage } from './quota-provision';

function nextMonthlyReset(now: Date): Date {
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);
  return cycleResetAt;
}

export async function reconcileQuotaStateForSubscription(
  db: Database,
  subscriptionId: string,
  now = new Date(),
): Promise<SubscriptionTier | null> {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });
  if (!subscription) return null;

  const { effectiveAccessTier } = resolveEffectiveAccessTier(
    {
      tier: subscription.tier,
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    },
    now,
  );

  await reconcileQuotaStateForEffectiveTier(
    db,
    subscriptionId,
    effectiveAccessTier,
    now,
  );
  return effectiveAccessTier;
}

export async function reconcileQuotaStateForEffectiveTier(
  db: Database,
  subscriptionId: string,
  tier: SubscriptionTier,
  now = new Date(),
): Promise<void> {
  const config = getTierConfig(tier);

  if (config.quotaModel === 'shared-pool') {
    await db
      .delete(profileQuotaUsage)
      .where(eq(profileQuotaUsage.subscriptionId, subscriptionId));

    await db
      .insert(quotaPools)
      .values({
        subscriptionId,
        monthlyLimit: config.monthlyQuota,
        usedThisMonth: 0,
        dailyLimit: config.dailyLimit,
        usedToday: 0,
        cycleResetAt: nextMonthlyReset(now),
      })
      .onConflictDoUpdate({
        target: quotaPools.subscriptionId,
        // Existing shared pools are mid-cycle state; only the limits change here.
        // Cycle resets are handled by the quota reset cron.
        set: {
          monthlyLimit: config.monthlyQuota,
          dailyLimit: config.dailyLimit,
          updatedAt: now,
        },
      });
    return;
  }

  const ownerMonthlyLimit = config.ownerMonthlyQuota;
  const childMonthlyLimit = config.childMonthlyQuota;
  if (ownerMonthlyLimit === null || childMonthlyLimit === null) return;

  const rows = (
    await db
      .select({
        id: profiles.id,
        isOwner: profiles.isOwner,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .innerJoin(subscriptions, eq(subscriptions.accountId, profiles.accountId))
      .where(
        and(eq(subscriptions.id, subscriptionId), isNull(profiles.archivedAt)),
      )
  ).sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const owner = rows.find((row) => row.isOwner);
  const firstChild = rows.find((row) => !row.isOwner);

  if (owner) {
    await provisionProfileQuotaUsage(db, subscriptionId, owner.id, 'owner', {
      tier,
      now,
    });
  }
  if (firstChild) {
    await provisionProfileQuotaUsage(
      db,
      subscriptionId,
      firstChild.id,
      'child',
      {
        tier,
        now,
      },
    );
  }

  await db
    .update(profileQuotaUsage)
    .set({
      monthlyLimit: sql`CASE WHEN ${profileQuotaUsage.role} = 'owner' THEN ${ownerMonthlyLimit}::integer ELSE ${childMonthlyLimit}::integer END`,
      dailyLimit: sql`CASE WHEN ${profileQuotaUsage.role} = 'owner' THEN ${config.ownerDailyQuota}::integer ELSE ${config.childDailyQuota}::integer END`,
      updatedAt: now,
    })
    .where(eq(profileQuotaUsage.subscriptionId, subscriptionId));
}
