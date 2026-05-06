// ---------------------------------------------------------------------------
// Billing — Family billing (Story 5.5)
// Family member CRUD, pool status, cancellation cascade, profile limits
// ---------------------------------------------------------------------------

import { and, eq, gte, sql } from 'drizzle-orm';
import {
  subscriptions,
  usageEvents,
  profiles,
  byokWaitlist,
  familyLinks,
  type Database,
  findSubscriptionById,
  findQuotaPool,
} from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';
import { getTierConfig } from '../subscription';
import type { SubscriptionRow } from './types';
import {
  getSubscriptionByAccountId,
  ensureFreeSubscription,
  updateQuotaPoolLimit,
} from './subscription-core';

// ---------------------------------------------------------------------------
// getSubscriptionForProfile
// ---------------------------------------------------------------------------

/**
 * Resolves a profile ID to its account's subscription.
 * Profile → Account → Subscription chain.
 */
export async function getSubscriptionForProfile(
  db: Database,
  profileId: string
): Promise<SubscriptionRow | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
  });

  if (!profile) {
    return null;
  }

  return getSubscriptionByAccountId(db, profile.accountId);
}

// ---------------------------------------------------------------------------
// getProfileCountForSubscription
// ---------------------------------------------------------------------------

/**
 * Counts profiles under the account that owns a subscription.
 */
export async function getProfileCountForSubscription(
  db: Database,
  subscriptionId: string
): Promise<number> {
  const sub = await findSubscriptionById(db, subscriptionId);

  if (!sub) {
    return 0;
  }

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .where(eq(profiles.accountId, sub.accountId));

  return result[0]?.count ?? 0;
}

// ---------------------------------------------------------------------------
// canAddProfile
// ---------------------------------------------------------------------------

/**
 * Checks whether a subscription can accept another profile.
 * Profile limits are defined per-tier in TierConfig.
 */
export async function canAddProfile(
  db: Database,
  subscriptionId: string
): Promise<boolean> {
  const sub = await findSubscriptionById(db, subscriptionId);

  if (!sub) {
    return false;
  }

  const tierConfig = getTierConfig(
    (sub.tier as 'free' | 'plus' | 'family' | 'pro') ?? 'free'
  );
  const current = await getProfileCountForSubscription(db, subscriptionId);

  return current < tierConfig.maxProfiles;
}

// ---------------------------------------------------------------------------
// addToByokWaitlist
// ---------------------------------------------------------------------------

/**
 * Adds an email to the BYOK (Bring Your Own Key) waitlist.
 * Uses ON CONFLICT DO NOTHING for idempotency.
 */
export async function addToByokWaitlist(
  db: Database,
  email: string
): Promise<void> {
  await db
    .insert(byokWaitlist)
    .values({ email })
    .onConflictDoNothing({ target: byokWaitlist.email });
}

// ---------------------------------------------------------------------------
// FamilyMember type + listFamilyMembers
// ---------------------------------------------------------------------------

export interface FamilyMember {
  profileId: string;
  displayName: string;
  isOwner: boolean;
}

export interface UsageBreakdown {
  by_profile: Array<{
    profile_id: string;
    name: string;
    used: number;
    is_self: boolean;
  }>;
  family_aggregate: { used: number; limit: number } | null;
  isOwnerBreakdownViewer: boolean;
}

const USAGE_EVENTS_AVAILABLE_SINCE = '2026-05-06T00:00:00.000Z';

export function getUsageEventsAvailableSince(): string {
  return USAGE_EVENTS_AVAILABLE_SINCE;
}

function formatDateLabel(
  dateIso: string | null,
  timezone: string | null | undefined,
  locale = 'en-US'
): string | null {
  if (!dateIso) return null;
  const timeZone = timezone ?? 'UTC';
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(dateIso));
  } catch {
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(dateIso));
  }
}

export function buildUsageDateLabels(input: {
  resetsAt: string;
  renewsAt: string | null;
  timezone?: string | null;
  locale?: string | null;
}): {
  resets_at: string;
  renews_at: string | null;
  resets_at_label: string;
  renews_at_label: string | null;
} {
  return {
    resets_at: input.resetsAt,
    renews_at: input.renewsAt,
    resets_at_label:
      formatDateLabel(
        input.resetsAt,
        input.timezone,
        input.locale ?? undefined
      ) ?? '',
    renews_at_label: formatDateLabel(
      input.renewsAt,
      input.timezone,
      input.locale ?? undefined
    ),
  };
}

/**
 * Lists all profiles under the same account (family) as the given subscription.
 */
export async function listFamilyMembers(
  db: Database,
  subscriptionId: string
): Promise<FamilyMember[]> {
  const sub = await findSubscriptionById(db, subscriptionId);

  if (!sub) {
    return [];
  }

  const rows = await db.query.profiles.findMany({
    where: eq(profiles.accountId, sub.accountId),
  });

  return rows.map((r) => ({
    profileId: r.id,
    displayName: r.displayName,
    isOwner: r.isOwner,
  }));
}

export async function getUsageBreakdownForProfile(
  db: Database,
  input: {
    subscriptionId: string;
    activeProfileId: string;
    monthlyLimit: number;
    cycleStartAt: string;
  }
): Promise<UsageBreakdown> {
  const sub = await findSubscriptionById(db, input.subscriptionId);
  if (!sub) {
    return {
      by_profile: [],
      family_aggregate: null,
      isOwnerBreakdownViewer: false,
    };
  }

  const [viewer] = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      isOwner: profiles.isOwner,
      hasChildLink: sql<boolean>`exists (
        select 1 from ${familyLinks}
        where ${familyLinks.parentProfileId} = ${profiles.id}
      )`,
    })
    .from(profiles)
    .where(
      and(
        eq(profiles.accountId, sub.accountId),
        eq(profiles.id, input.activeProfileId)
      )
    )
    .limit(1);

  if (!viewer) {
    return {
      by_profile: [],
      family_aggregate: null,
      isOwnerBreakdownViewer: false,
    };
  }

  const profileRows = await db
    .select({
      profileId: profiles.id,
      name: profiles.displayName,
      used: sql<number>`coalesce(sum(${usageEvents.delta}), 0)::int`,
    })
    .from(profiles)
    .leftJoin(
      usageEvents,
      and(
        eq(usageEvents.profileId, profiles.id),
        eq(usageEvents.subscriptionId, input.subscriptionId),
        gte(usageEvents.occurredAt, new Date(input.cycleStartAt))
      )
    )
    .where(eq(profiles.accountId, sub.accountId))
    .groupBy(profiles.id, profiles.displayName);

  const isOwnerBreakdownViewer = viewer.isOwner && viewer.hasChildLink;
  const visibleRows = isOwnerBreakdownViewer
    ? profileRows
    : profileRows.filter((row) => row.profileId === input.activeProfileId);
  const familyUsed = profileRows.reduce((sum, row) => sum + row.used, 0);

  return {
    by_profile: visibleRows.map((row) => ({
      profile_id: row.profileId,
      name: row.name,
      used: row.used,
      is_self: row.profileId === input.activeProfileId,
    })),
    family_aggregate: isOwnerBreakdownViewer
      ? { used: familyUsed, limit: input.monthlyLimit }
      : null,
    isOwnerBreakdownViewer,
  };
}

// ---------------------------------------------------------------------------
// addProfileToSubscription
// ---------------------------------------------------------------------------

/**
 * Adds a profile to a family subscription.
 *
 * Checks:
 * - Subscription exists
 * - Subscription tier supports multi-profile (family or pro)
 * - Target profile already belongs to the subscription account
 *
 * Family membership is account-scoped. Until an invite/claim flow exists,
 * cross-account profile transfers are rejected instead of re-parented.
 */
export async function addProfileToSubscription(
  db: Database,
  subscriptionId: string,
  profileId: string
): Promise<{ profileCount: number } | null> {
  const sub = await findSubscriptionById(db, subscriptionId);

  if (!sub) {
    return null;
  }

  // Only family and pro tiers support multiple profiles
  if (sub.tier !== 'family' && sub.tier !== 'pro') {
    return null;
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
  });

  // Family membership is currently modeled as shared account ownership.
  // Until an invite/claim flow exists, never re-parent profiles across accounts.
  if (!profile || profile.accountId !== sub.accountId) {
    return null;
  }

  // Enforce per-tier maxProfiles limit
  const allowed = await canAddProfile(db, subscriptionId);
  if (!allowed) {
    return null;
  }

  const count = await getProfileCountForSubscription(db, subscriptionId);
  return { profileCount: count };
}

// ---------------------------------------------------------------------------
// removeProfileFromSubscription + ProfileRemovalNotImplementedError
// ---------------------------------------------------------------------------

export class ProfileRemovalNotImplementedError extends Error {
  constructor() {
    super(
      'Profile removal requires an invite/claim flow that is not yet implemented'
    );
    this.name = 'ProfileRemovalNotImplementedError';
  }
}

/**
 * Removes a profile from a family subscription.
 *
 * Cross-account detachment is intentionally disabled until the backend has a
 * verifiable invite/claim flow for the destination account.
 */
export async function removeProfileFromSubscription(
  db: Database,
  subscriptionId: string,
  profileId: string,
  newAccountId: string
): Promise<{ removedProfileId: string } | null> {
  const sub = await findSubscriptionById(db, subscriptionId);

  if (!sub) {
    return null;
  }

  const profile = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      eq(profiles.accountId, sub.accountId)
    ),
  });

  if (!profile) {
    return null;
  }

  // Owner cannot be removed — they must cancel the entire subscription
  if (profile.isOwner) {
    return null;
  }

  // Cross-account profile detachment needs an invite/claim flow so the
  // destination account can be proven. Until that exists, reject the move
  // instead of trusting a caller-supplied account ID.
  void newAccountId;
  throw new ProfileRemovalNotImplementedError();
}

// ---------------------------------------------------------------------------
// downgradeAllFamilyProfiles
// ---------------------------------------------------------------------------

/**
 * Family owner cancellation — downgrades all non-owner profiles to free tier.
 *
 * When the family owner cancels:
 * 1. Each non-owner profile gets moved to its own new account with free-tier sub
 * 2. The owner's subscription is downgraded to free tier
 *
 * This function handles only the DB-side: moving profiles and provisioning
 * free subscriptions. Stripe cancellation is handled separately.
 *
 * Returns the list of profile IDs that were downgraded (for notification).
 */
export async function downgradeAllFamilyProfiles(
  db: Database,
  subscriptionId: string,
  profileToAccountMap: Map<string, string>
): Promise<string[]> {
  const sub = await findSubscriptionById(db, subscriptionId);

  if (!sub) {
    return [];
  }

  const allProfiles = await db.query.profiles.findMany({
    where: eq(profiles.accountId, sub.accountId),
  });

  const downgraded: string[] = [];

  for (const profile of allProfiles) {
    if (profile.isOwner) {
      continue;
    }

    const newAccountId = profileToAccountMap.get(profile.id);
    if (!newAccountId) {
      continue;
    }

    // Move to new account
    await db
      .update(profiles)
      .set({
        accountId: newAccountId,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profile.id));

    // Provision free-tier subscription for new account
    await ensureFreeSubscription(db, newAccountId);

    downgraded.push(profile.id);
  }

  // Downgrade the owner's subscription to free tier
  const freeTier = getTierConfig('free');
  await db
    .update(subscriptions)
    .set({
      tier: 'free',
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscriptionId));

  await updateQuotaPoolLimit(
    db,
    subscriptionId,
    freeTier.monthlyQuota,
    freeTier.dailyLimit
  );

  return downgraded;
}

// ---------------------------------------------------------------------------
// getFamilyPoolStatus
// ---------------------------------------------------------------------------

/**
 * Returns subscription-level quota pool status for the family.
 * Shows pool-level consumption (not per-profile).
 */
export async function getFamilyPoolStatus(
  db: Database,
  subscriptionId: string
): Promise<{
  tier: SubscriptionTier;
  monthlyLimit: number;
  usedThisMonth: number;
  remainingQuestions: number;
  profileCount: number;
  maxProfiles: number;
} | null> {
  const sub = await findSubscriptionById(db, subscriptionId);

  if (!sub) {
    return null;
  }

  const pool = await findQuotaPool(db, subscriptionId);

  if (!pool) {
    return null;
  }

  const tierConfig = getTierConfig(sub.tier);
  const profileCount = await getProfileCountForSubscription(db, subscriptionId);
  const remaining = Math.max(0, pool.monthlyLimit - pool.usedThisMonth);

  return {
    tier: sub.tier,
    monthlyLimit: pool.monthlyLimit,
    usedThisMonth: pool.usedThisMonth,
    remainingQuestions: remaining,
    profileCount,
    maxProfiles: tierConfig.maxProfiles,
  };
}
