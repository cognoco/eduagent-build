import { and, eq, inArray, or } from 'drizzle-orm';
import {
  generateUUIDv7,
  guardianship,
  login,
  membership,
  organization,
  person,
  subscription as subscriptionTable,
  subscriptionPayers,
  type Database,
} from '@eduagent/database';

// [WI-1139] The legacy `accounts`/`profiles`/`family_links`/`consent_states`/
// `subscriptions` Drizzle table defs were removed (physical DB drop is a
// separate step, WI-1306). The four anchor/seed helpers below can no longer
// construct typed inserts/deletes against those tables, so they are now
// permanent no-ops — every caller already treated their effect as
// best-effort (the runtime `tableExists()` gate meant a suite never assumed
// the legacy row was actually written).
type LegacyIdentityTableName =
  | 'accounts'
  | 'profiles'
  | 'family_links'
  | 'consent_states'
  | 'subscriptions';

export async function legacyIdentityTableExistsForTest(
  _db: Database,
  _table: LegacyIdentityTableName,
): Promise<boolean> {
  return false;
}

export async function ensureLegacyProfileAnchorForTest(
  _db: Database,
  _input: {
    profileId: string;
    accountId?: string;
    displayName?: string;
    birthYear?: number;
    isOwner?: boolean;
    email?: string;
    clerkUserId?: string;
  },
): Promise<void> {
  // no-op — legacy `accounts`/`profiles` defs removed.
}

export async function ensureLegacySubscriptionAnchorForTest(
  _db: Database,
  _input: {
    subscriptionId: string;
    accountId: string;
    tier?: 'free' | 'plus' | 'family' | 'pro';
    status?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
  },
): Promise<void> {
  // no-op — legacy `subscriptions` def removed.
}

export async function deleteLegacyAccountsForTest(
  _db: Database,
  _accountIds: string[],
): Promise<void> {
  // no-op — legacy `accounts` def removed.
}

export async function ensureV2IdentityForLegacyProfileTest(
  db: Database,
  input: {
    accountId: string;
    profileId: string;
    displayName: string;
    birthYear: number;
    clerkUserId: string;
    email: string;
    isOwner?: boolean;
    /**
     * [WI-1145] Seed a baseline free v2 `subscription` (+ matching legacy parent)
     * for the owner. Default true — most suites want the post-collapse billing /
     * metering reads to resolve a row. Suites that own the full subscription
     * lifecycle in their own seed (e.g. billing-lifecycle, whose "repair a missing
     * subscription" case requires NO pre-existing sub) pass false and insert their
     * own legacy+v2 pair with a shared id.
     */
    seedBaselineSubscription?: boolean;
  },
): Promise<void> {
  await db
    .insert(organization)
    .values({
      id: input.accountId,
      name: `Test org ${input.accountId.slice(0, 8)}`,
    })
    .onConflictDoNothing();

  await db
    .insert(person)
    .values({
      id: input.profileId,
      displayName: input.displayName,
      birthDate: `${input.birthYear}-01-01`,
      residenceJurisdiction: 'EU',
    })
    .onConflictDoNothing();

  if (input.isOwner ?? true) {
    const loginId = generateUUIDv7();
    await db
      .insert(login)
      .values({
        id: loginId,
        personId: input.profileId,
        clerkUserId: input.clerkUserId,
        email: input.email,
      })
      .onConflictDoNothing();

    const loginRow = await db.query.login.findFirst({
      where: eq(login.clerkUserId, input.clerkUserId),
      columns: { id: true },
    });
    if (loginRow) {
      await db
        .update(person)
        .set({ loginId: loginRow.id })
        .where(eq(person.id, input.profileId));
    }
  }

  const existingMembership = await db.query.membership.findFirst({
    where: and(
      eq(membership.personId, input.profileId),
      eq(membership.organizationId, input.accountId),
    ),
    columns: { id: true },
  });
  if (!existingMembership) {
    await db.insert(membership).values({
      personId: input.profileId,
      organizationId: input.accountId,
      roles: (input.isOwner ?? true) ? ['admin', 'learner'] : ['learner'],
    });
  }

  // [WI-1145] Seed a baseline v2 `subscription` for the owner so v2 billing/
  // metering reads (getSubscriptionByAccountIdV2 / ensureFreeSubscriptionV2)
  // resolve a row on the post-collapse main lane, and so
  // setSubscriptionTierForProfile's v2 UPDATE has a row to mutate. Free/active
  // matches the legacy default; tier-specific tests call
  // setSubscriptionTierForProfile, which updates BOTH stores in lockstep so
  // legacy↔v2 stay consistent.
  if ((input.isOwner ?? true) && (input.seedBaselineSubscription ?? true)) {
    await ensureLegacyProfileAnchorForTest(db, {
      accountId: input.accountId,
      profileId: input.profileId,
      displayName: input.displayName,
      birthYear: input.birthYear,
      isOwner: input.isOwner ?? true,
      email: input.email,
      clerkUserId: input.clerkUserId,
    });

    const [existingSubscription] = await db
      .select({ id: subscriptionTable.id })
      .from(subscriptionTable)
      .where(eq(subscriptionTable.organizationId, input.accountId))
      .limit(1);
    if (!existingSubscription) {
      const baselineSubscriptionId = generateUUIDv7();
      await db.insert(subscriptionTable).values({
        id: baselineSubscriptionId,
        organizationId: input.accountId,
        planTier: 'free',
        status: 'active',
        payerPersonId: input.profileId,
      });
      // [WI-1145] Mirror createIdentityGraph's owner-bootstrap dual-write: give
      // the v2 baseline sub a legacy `subscriptions` parent with the SAME id.
      // `profile_quota_usage.subscription_id` FK-references legacy `subscriptions`
      // on the journaled-chain test DB, so a per-profile-tier quota provision
      // (post-collapse billing read) against the v2 sub id needs that legacy row
      // to exist. It cascades away with the account
      // (`subscriptions.account_id` onDelete cascade), so cleanupAccounts sweeps
      // it for free.
      await ensureLegacySubscriptionAnchorForTest(db, {
        subscriptionId: baselineSubscriptionId,
        accountId: input.accountId,
        tier: 'free',
        status: 'active',
      });
    }
  }
}

export async function deleteV2IdentitiesForTest(
  db: Database,
  input: { accountIds?: string[]; profileIds?: string[] },
): Promise<void> {
  const profileIds = input.profileIds ?? [];
  const accountIds = input.accountIds ?? [];

  if (accountIds.length > 0) {
    await db
      .delete(subscriptionTable)
      .where(inArray(subscriptionTable.organizationId, accountIds));
  }

  if (profileIds.length > 0) {
    await db
      .delete(subscriptionTable)
      .where(inArray(subscriptionTable.payerPersonId, profileIds));
    await db
      .delete(subscriptionPayers)
      .where(inArray(subscriptionPayers.personId, profileIds));
    await db
      .delete(guardianship)
      .where(
        or(
          inArray(guardianship.guardianPersonId, profileIds),
          inArray(guardianship.chargePersonId, profileIds),
        ),
      );
    await db.delete(membership).where(inArray(membership.personId, profileIds));
    await db.delete(login).where(inArray(login.personId, profileIds));
    await db.delete(person).where(inArray(person.id, profileIds));
  }

  if (accountIds.length > 0) {
    await db
      .delete(membership)
      .where(inArray(membership.organizationId, accountIds));
    await db.delete(organization).where(inArray(organization.id, accountIds));
  }
}
