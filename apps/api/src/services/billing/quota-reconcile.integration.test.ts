/**
 * Integration: Quota-state reconciliation
 *
 * Pins `reconcileQuotaStateForEffectiveTier` / `reconcileQuotaStateForSubscription`
 * against a real DB. These functions own the money-math invariants when a
 * subscription's effective tier changes: shared-pool cycle reset vs. preserve,
 * the reset opt-out, the per-profile ↔ shared-pool model switch, and owner/child
 * provisioning. Previously this module had zero regression tests.
 *
 * No mocks of internal services or the database — external boundaries only
 * (none touched by these functions).
 */

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  membership,
  organization,
  person,
  profileQuotaUsage,
  profiles,
  quotaPools,
  subscription as subscriptionV2Table,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';
import {
  ensureLegacySubscriptionAnchorForTest,
  legacyIdentityTableExistsForTest,
} from '../../test-utils/legacy-identity-anchors';

import {
  reconcileQuotaStateForEffectiveTier,
  reconcileQuotaStateForSubscription,
} from './quota-reconcile';
// [WI-1239 / 779-strip] the per-profile branch of reconcileQuotaStateForEffectiveTier
// (legacy profiles×subscriptions join) was removed — see quota-reconcile.ts's
// header comment. reconcileQuotaStateForEffectiveTierV2 is the surviving
// per-profile implementation (person×membership×subscription); the
// per-profile describe block below and the effective-tier-resolution test
// convert to it. The shared-pool describe block is untouched — that branch is
// reused verbatim by v2 and stays on the legacy (still-exported) function.
import {
  reconcileQuotaStateForEffectiveTierV2,
  reconcileQuotaStateForSubscriptionV2,
} from './billing-v2';
import { getTierConfig } from '../subscription';

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Seed helpers — unique prefix so parallel test files don't collide
// ---------------------------------------------------------------------------

const PREFIX = 'integration-quota-reconcile';
const TEST_ACCOUNTS = Array.from({ length: 8 }, (_, i) => ({
  clerkUserId: `${PREFIX}-${String(i).padStart(2, '0')}`,
  email: `${PREFIX}-${String(i).padStart(2, '0')}@integration.test`,
}));
// [WI-1128] `accounts` (legacy) is on the drop list; the seed/cleanup anchor
// is now the v2 `organization`, keyed by name (same pattern as
// metering.integration.test.ts's ORG_NAMES).
const ORG_NAMES = Array.from({ length: 8 }, (_, i) => `${PREFIX}-org-${i}`);

function expectedNextReset(now: Date): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() + 1);
  return d;
}

async function seedAccount(index: number) {
  const db = createIntegrationDb();
  const account = TEST_ACCOUNTS[index]!;
  const [org] = await db
    .insert(organization)
    .values({ name: ORG_NAMES[index]! })
    .returning();
  // [WI-1128] Legacy `accounts` may already be dropped (post-M-DROP); after
  // M-REPOINT, `subscriptions.accountId` targets `organization` directly, so
  // this mirror (same id as the org, the "reseed identity contract") is a
  // no-op there instead of hard-failing.
  if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
    await db.insert(accounts).values({
      id: org!.id,
      clerkUserId: account.clerkUserId,
      email: account.email,
    });
  }
  return org!;
}

async function seedSubscription(input: {
  accountId: string;
  tier?: 'free' | 'plus' | 'family' | 'pro';
  status?: 'active' | 'trial' | 'expired';
}) {
  const db = createIntegrationDb();
  const tier = input.tier ?? 'family';
  const status = input.status ?? 'active';

  // [WI-1128] `quota_pools`/`profile_quota_usage`.subscriptionId now FK to
  // the v2 `subscription` table (post-M-REPOINT), not legacy `subscriptions`.
  // `subscription.payerPersonId` is NOT NULL — auto-provision a throwaway
  // payer (same pattern as metering.integration.test.ts's
  // seedSubscriptionWithQuota) since the shared-pool describe block below
  // doesn't care about payer identity.
  const [payer] = await db
    .insert(person)
    .values({
      displayName: 'Auto Payer',
      birthDate: '1990-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning();
  await db.insert(membership).values({
    personId: payer!.id,
    organizationId: input.accountId,
    roles: ['admin'],
  });

  const [sub] = await db
    .insert(subscriptionV2Table)
    .values({
      organizationId: input.accountId,
      planTier: tier,
      status,
      payerPersonId: payer!.id,
    })
    .returning();

  // Mirror into legacy `subscriptions` under the SAME id so
  // reconcileQuotaStateForSubscription (which still reads the legacy table)
  // resolves a row. Gated — a no-op once `subscriptions` itself is dropped
  // (WI-805, not this WI).
  await ensureLegacySubscriptionAnchorForTest(db, {
    subscriptionId: sub!.id,
    accountId: input.accountId,
    tier,
    status,
  });

  return sub!;
}

async function seedQuotaPool(input: {
  subscriptionId: string;
  monthlyLimit: number;
  usedThisMonth: number;
  dailyLimit: number | null;
  usedToday: number;
  cycleResetAt: Date;
}) {
  const db = createIntegrationDb();
  const [pool] = await db.insert(quotaPools).values(input).returning();
  return pool!;
}

async function seedProfile(input: {
  accountId: string;
  displayName: string;
  birthYear: number;
  isOwner: boolean;
  archivedAt?: Date | null;
}) {
  const db = createIntegrationDb();
  // [WI-1128] `profile_quota_usage.profileId` now FKs to `person` directly
  // (post-M-REPOINT) — seed the v2 person first (the shared-pool "deletes
  // per-profile usage rows" test uses this id directly with no v2 counterpart
  // seeded), then mirror legacy `profiles` under the SAME id, gated (a no-op
  // once the table is dropped).
  const [row] = await db
    .insert(person)
    .values({
      displayName: input.displayName,
      birthDate: `${input.birthYear}-01-01`,
      residenceJurisdiction: 'EU',
      archivedAt: input.archivedAt ?? null,
    })
    .returning();

  if (await legacyIdentityTableExistsForTest(db, 'profiles')) {
    await db.insert(profiles).values({
      id: row!.id,
      accountId: input.accountId,
      displayName: input.displayName,
      birthYear: input.birthYear,
      isOwner: input.isOwner,
      archivedAt: input.archivedAt ?? null,
    });
  }
  return row!;
}

async function loadQuotaPool(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });
}

async function loadProfileQuotaRows(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.profileQuotaUsage.findMany({
    where: eq(profileQuotaUsage.subscriptionId, subscriptionId),
  });
}

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const orgs = await db.query.organization.findMany({
    where: inArray(organization.name, ORG_NAMES),
  });
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return;

  // Capture member person ids BEFORE deleting membership (same ordering
  // rationale as metering.integration.test.ts's cleanupTestAccounts).
  const memberships = await db
    .select({ personId: membership.personId })
    .from(membership)
    .where(inArray(membership.organizationId, orgIds));
  const personIds = [...new Set(memberships.map((m) => m.personId))];

  // subscription.organizationId / .payerPersonId are both RESTRICT — the
  // v2 subscription must go before organization/person.
  await db
    .delete(subscriptionV2Table)
    .where(inArray(subscriptionV2Table.organizationId, orgIds));
  await db.delete(membership).where(inArray(membership.organizationId, orgIds));
  if (personIds.length > 0) {
    await db.delete(person).where(inArray(person.id, personIds));
  }
  await db.delete(organization).where(inArray(organization.id, orgIds));
  // [WI-1128] Legacy `accounts` may already be dropped (post-M-DROP); skip
  // the cleanup there instead of hard-failing. Its `subscriptions` row (same
  // id as the org) cascades away via the M-REPOINT'd account_id->organization
  // FK when the org itself is deleted above.
  if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
    await db.delete(accounts).where(inArray(accounts.id, orgIds));
  }
}

// [WI-1239 / 779-strip] v2 dual-store seeding for the per-profile describe
// block below. reconcileQuotaStateForEffectiveTierV2 reads owner/child
// enumeration via person×membership×subscription (v2) scoped to ITS OWN
// organization — distinct from the shared-pool "account" org that
// seedSubscription/seedProfile above already anchored the same ids under.
// [WI-1128] post-M-REPOINT, profile_quota_usage/quota_pools FK directly to
// v2 person/subscription, so seedProfile already created the v2 `person` row
// for legacyProfileId and seedSubscription already created the v2
// `subscription` row for legacySubscriptionId (under the shared-pool org) —
// this helper re-points that subscription row's org/payer onto its own
// per-profile org (upsert) and no-ops the now-duplicate person insert.
const V2_ORG_NAMES = [
  'integration-quota-reconcile-v2-provisions',
  'integration-quota-reconcile-v2-archived',
  'integration-quota-reconcile-v2-resolve',
];

async function seedV2Counterpart(input: {
  organizationName: string;
  legacySubscriptionId: string;
  tier: 'free' | 'plus' | 'family' | 'pro';
  persons: Array<{
    legacyProfileId: string;
    isOwner: boolean;
    archivedAt?: Date | null;
  }>;
}) {
  const db = createIntegrationDb();
  const [org] = await db
    .insert(organization)
    .values({ name: input.organizationName })
    .returning();
  const owner = input.persons.find((p) => p.isOwner)!;
  for (const p of input.persons) {
    // [WI-1128] seedProfile already inserted this person (same id) under the
    // shared-pool org; here we're only adding it to a second organization.
    await db
      .insert(person)
      .values({
        id: p.legacyProfileId,
        displayName: p.isOwner ? 'Owner' : 'Child',
        birthDate: p.isOwner ? '1985-01-01' : '2015-01-01',
        residenceJurisdiction: 'EU',
        archivedAt: p.archivedAt ?? null,
      })
      .onConflictDoNothing();
    await db.insert(membership).values({
      personId: p.legacyProfileId,
      organizationId: org!.id,
      roles: p.isOwner ? ['admin'] : ['learner'],
    });
  }
  // [WI-1128] seedSubscription already created the v2 subscription row (same
  // id) scoped to the shared-pool org with a throwaway payer — re-point it
  // onto this per-profile org and the real owner as payer.
  await db
    .insert(subscriptionV2Table)
    .values({
      id: input.legacySubscriptionId,
      organizationId: org!.id,
      planTier: input.tier,
      status: 'active',
      payerPersonId: owner.legacyProfileId,
    })
    .onConflictDoUpdate({
      target: subscriptionV2Table.id,
      set: {
        organizationId: org!.id,
        planTier: input.tier,
        status: 'active',
        payerPersonId: owner.legacyProfileId,
      },
    });
  return org!;
}

async function cleanupV2() {
  const db = createIntegrationDb();
  const orgs = await db.query.organization.findMany({
    where: inArray(organization.name, V2_ORG_NAMES),
  });
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return;
  const members = await db.query.membership.findMany({
    where: inArray(membership.organizationId, orgIds),
    columns: { personId: true },
  });
  const personIds = [...new Set(members.map((m) => m.personId))];
  await db
    .delete(subscriptionV2Table)
    .where(inArray(subscriptionV2Table.organizationId, orgIds));
  if (personIds.length > 0) {
    await db.delete(person).where(inArray(person.id, personIds));
  }
  await db.delete(organization).where(inArray(organization.id, orgIds));
}

beforeEach(async () => {
  await cleanupTestAccounts();
  await cleanupV2();
});

afterAll(async () => {
  await cleanupTestAccounts();
  await cleanupV2();
});

// ---------------------------------------------------------------------------
// Shared-pool path (tier `family`: monthlyQuota 1500, dailyLimit null)
// ---------------------------------------------------------------------------

describe('reconcileQuotaStateForEffectiveTier — shared-pool', () => {
  const familyConfig = getTierConfig('family');

  it('pins the family tier money-math literals (guards constant drift)', () => {
    // The other assertions in this file compare pool values against
    // getTierConfig('family'), so they would not catch a fat-finger of the
    // constant itself. Pin the literals so a quota change is a deliberate edit.
    expect(familyConfig.monthlyQuota).toBe(1500);
    expect(familyConfig.dailyLimit).toBeNull();
  });

  it('creates a fresh pool with tier limits and a next-month cycle reset', async () => {
    const account = await seedAccount(0);
    const sub = await seedSubscription({
      accountId: account.id,
      tier: 'family',
    });
    const now = new Date('2026-05-15T12:00:00.000Z');

    await reconcileQuotaStateForEffectiveTier(
      createIntegrationDb(),
      sub.id,
      'family',
      now,
    );

    const pool = await loadQuotaPool(sub.id);
    expect(pool).toBeDefined();
    expect(pool!.monthlyLimit).toBe(familyConfig.monthlyQuota);
    expect(pool!.dailyLimit).toBe(familyConfig.dailyLimit);
    expect(pool!.usedThisMonth).toBe(0);
    expect(pool!.usedToday).toBe(0);
    expect(pool!.cycleResetAt.getTime()).toBe(expectedNextReset(now).getTime());
  });

  it('resets counters and bumps the cycle when the pool cycle has expired', async () => {
    const account = await seedAccount(1);
    const sub = await seedSubscription({
      accountId: account.id,
      tier: 'family',
    });
    const now = new Date('2026-05-15T12:00:00.000Z');
    await seedQuotaPool({
      subscriptionId: sub.id,
      monthlyLimit: 999,
      usedThisMonth: 800,
      dailyLimit: 50,
      usedToday: 40,
      cycleResetAt: new Date('2026-05-01T00:00:00.000Z'), // <= now → expired
    });

    await reconcileQuotaStateForEffectiveTier(
      createIntegrationDb(),
      sub.id,
      'family',
      now,
    );

    const pool = await loadQuotaPool(sub.id);
    expect(pool!.usedThisMonth).toBe(0);
    expect(pool!.usedToday).toBe(0);
    expect(pool!.monthlyLimit).toBe(familyConfig.monthlyQuota);
    expect(pool!.dailyLimit).toBe(familyConfig.dailyLimit);
    expect(pool!.cycleResetAt.getTime()).toBe(expectedNextReset(now).getTime());
  });

  it('preserves mid-cycle usage when the cycle is still active', async () => {
    const account = await seedAccount(2);
    const sub = await seedSubscription({
      accountId: account.id,
      tier: 'family',
    });
    const now = new Date('2026-05-15T12:00:00.000Z');
    const activeCycle = new Date('2026-06-10T00:00:00.000Z'); // > now → active
    await seedQuotaPool({
      subscriptionId: sub.id,
      monthlyLimit: 999,
      usedThisMonth: 300,
      dailyLimit: 50,
      usedToday: 12,
      cycleResetAt: activeCycle,
    });

    await reconcileQuotaStateForEffectiveTier(
      createIntegrationDb(),
      sub.id,
      'family',
      now,
    );

    const pool = await loadQuotaPool(sub.id);
    // Usage preserved, cycle unchanged, but limits updated to the tier config
    // (the limit refresh is unconditional, including dailyLimit → null).
    expect(pool!.usedThisMonth).toBe(300);
    expect(pool!.usedToday).toBe(12);
    expect(pool!.cycleResetAt.getTime()).toBe(activeCycle.getTime());
    expect(pool!.monthlyLimit).toBe(familyConfig.monthlyQuota);
    expect(pool!.dailyLimit).toBe(familyConfig.dailyLimit);
  });

  it('does not reset expired usage when resetExpiredSharedPoolUsage is false', async () => {
    const account = await seedAccount(3);
    const sub = await seedSubscription({
      accountId: account.id,
      tier: 'family',
    });
    const now = new Date('2026-05-15T12:00:00.000Z');
    const expiredCycle = new Date('2026-05-01T00:00:00.000Z');
    await seedQuotaPool({
      subscriptionId: sub.id,
      monthlyLimit: 999,
      usedThisMonth: 800,
      dailyLimit: 50,
      usedToday: 40,
      cycleResetAt: expiredCycle,
    });

    await reconcileQuotaStateForEffectiveTier(
      createIntegrationDb(),
      sub.id,
      'family',
      now,
      { resetExpiredSharedPoolUsage: false },
    );

    const pool = await loadQuotaPool(sub.id);
    // Counters and cycle untouched; only the limits are refreshed.
    expect(pool!.usedThisMonth).toBe(800);
    expect(pool!.usedToday).toBe(40);
    expect(pool!.cycleResetAt.getTime()).toBe(expiredCycle.getTime());
    expect(pool!.monthlyLimit).toBe(familyConfig.monthlyQuota);
  });

  it('deletes per-profile usage rows when switching to a shared-pool tier', async () => {
    const account = await seedAccount(4);
    const sub = await seedSubscription({
      accountId: account.id,
      tier: 'family',
    });
    const owner = await seedProfile({
      accountId: account.id,
      displayName: 'Owner',
      birthYear: 1990,
      isOwner: true,
    });
    const db = createIntegrationDb();
    await db.insert(profileQuotaUsage).values({
      subscriptionId: sub.id,
      profileId: owner.id,
      role: 'owner',
      monthlyLimit: 700,
      usedThisMonth: 5,
      cycleResetAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    expect((await loadProfileQuotaRows(sub.id)).length).toBe(1);

    await reconcileQuotaStateForEffectiveTier(
      createIntegrationDb(),
      sub.id,
      'family',
      new Date('2026-05-15T12:00:00.000Z'),
    );

    expect(await loadProfileQuotaRows(sub.id)).toEqual([]);
    expect(await loadQuotaPool(sub.id)).toBeDefined();
  });

  it('is idempotent over the reset path — a second call on a freshly-reset pool is a no-op', async () => {
    const account = await seedAccount(5);
    const sub = await seedSubscription({
      accountId: account.id,
      tier: 'family',
    });
    const now = new Date('2026-05-15T12:00:00.000Z');
    // Seed an EXPIRED cycle so the first call takes the reset branch (zero +
    // bump cycleResetAt into the future). The second call must then see an
    // active cycle and converge — not re-reset or double-bump.
    await seedQuotaPool({
      subscriptionId: sub.id,
      monthlyLimit: familyConfig.monthlyQuota,
      usedThisMonth: 120,
      dailyLimit: familyConfig.dailyLimit,
      usedToday: 4,
      cycleResetAt: new Date('2026-05-01T00:00:00.000Z'), // <= now → expired
    });

    const db = createIntegrationDb();
    await reconcileQuotaStateForEffectiveTier(db, sub.id, 'family', now);
    await reconcileQuotaStateForEffectiveTier(db, sub.id, 'family', now);

    const pool = await loadQuotaPool(sub.id);
    expect(pool!.usedThisMonth).toBe(0);
    expect(pool!.usedToday).toBe(0);
    expect(pool!.cycleResetAt.getTime()).toBe(expectedNextReset(now).getTime());
  });
});

// ---------------------------------------------------------------------------
// Per-profile path (tier `plus`: owner 700, child 100)
// ---------------------------------------------------------------------------

describe('reconcileQuotaStateForEffectiveTier — per-profile', () => {
  const plusConfig = getTierConfig('plus');

  it('pins the plus tier money-math literals (guards constant drift)', () => {
    expect(plusConfig.ownerMonthlyQuota).toBe(700);
    expect(plusConfig.childMonthlyQuota).toBe(100);
    expect(plusConfig.ownerDailyQuota).toBeNull();
    expect(plusConfig.childDailyQuota).toBe(10);
  });

  it('provisions owner and first child with role-based limits', async () => {
    const account = await seedAccount(6);
    const sub = await seedSubscription({ accountId: account.id, tier: 'plus' });
    const owner = await seedProfile({
      accountId: account.id,
      displayName: 'Owner',
      birthYear: 1985,
      isOwner: true,
    });
    const child = await seedProfile({
      accountId: account.id,
      displayName: 'Child',
      birthYear: 2015,
      isOwner: false,
    });
    await seedV2Counterpart({
      organizationName: 'integration-quota-reconcile-v2-provisions',
      legacySubscriptionId: sub.id,
      tier: 'plus',
      persons: [
        { legacyProfileId: owner.id, isOwner: true },
        { legacyProfileId: child.id, isOwner: false },
      ],
    });

    // [WI-1239 / 779-strip] reconcileQuotaStateForEffectiveTierV2 is the
    // surviving per-profile implementation — see the import comment above.
    await reconcileQuotaStateForEffectiveTierV2(
      createIntegrationDb(),
      sub.id,
      'plus',
      new Date('2026-05-15T12:00:00.000Z'),
    );

    const rows = await loadProfileQuotaRows(sub.id);
    const ownerRow = rows.find((r) => r.profileId === owner.id);
    const childRow = rows.find((r) => r.profileId === child.id);
    expect(ownerRow?.role).toBe('owner');
    expect(ownerRow?.monthlyLimit).toBe(plusConfig.ownerMonthlyQuota);
    expect(ownerRow?.dailyLimit).toBe(plusConfig.ownerDailyQuota);
    expect(childRow?.role).toBe('child');
    expect(childRow?.monthlyLimit).toBe(plusConfig.childMonthlyQuota);
    expect(childRow?.dailyLimit).toBe(plusConfig.childDailyQuota);
  });

  it('excludes archived profiles from provisioning', async () => {
    const account = await seedAccount(7);
    const sub = await seedSubscription({ accountId: account.id, tier: 'plus' });
    const owner = await seedProfile({
      accountId: account.id,
      displayName: 'Owner',
      birthYear: 1980,
      isOwner: true,
    });
    const archivedAt = new Date('2026-04-01T00:00:00.000Z');
    const archivedChild = await seedProfile({
      accountId: account.id,
      displayName: 'Archived Child',
      birthYear: 2012,
      isOwner: false,
      archivedAt,
    });
    await seedV2Counterpart({
      organizationName: 'integration-quota-reconcile-v2-archived',
      legacySubscriptionId: sub.id,
      tier: 'plus',
      persons: [
        { legacyProfileId: owner.id, isOwner: true },
        { legacyProfileId: archivedChild.id, isOwner: false, archivedAt },
      ],
    });

    await reconcileQuotaStateForEffectiveTierV2(
      createIntegrationDb(),
      sub.id,
      'plus',
      new Date('2026-05-15T12:00:00.000Z'),
    );

    const rows = await loadProfileQuotaRows(sub.id);
    // Owner WAS provisioned (guards against a regression that filters everyone
    // out and would otherwise make "excludes archived" pass on a total no-op).
    expect(rows.some((r) => r.profileId === owner.id)).toBe(true);
    expect(rows.some((r) => r.profileId === archivedChild.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Effective-tier resolution wrapper
// ---------------------------------------------------------------------------

describe('reconcileQuotaStateForSubscription', () => {
  it('resolves the effective tier of an active plus subscription and writes per-profile rows', async () => {
    const account = await seedAccount(0);
    const sub = await seedSubscription({
      accountId: account.id,
      tier: 'plus',
      status: 'active',
    });
    const owner = await seedProfile({
      accountId: account.id,
      displayName: 'Owner',
      birthYear: 1988,
      isOwner: true,
    });
    await seedV2Counterpart({
      organizationName: 'integration-quota-reconcile-v2-resolve',
      legacySubscriptionId: sub.id,
      tier: 'plus',
      persons: [{ legacyProfileId: owner.id, isOwner: true }],
    });

    // [WI-1239 / 779-strip] reconcileQuotaStateForSubscriptionV2 is the
    // surviving per-profile-capable resolver (reads the v2 `subscription`
    // table) — see the import comment above.
    const resolved = await reconcileQuotaStateForSubscriptionV2(
      createIntegrationDb(),
      sub.id,
      new Date('2026-05-15T12:00:00.000Z'),
    );

    expect(resolved).toBe('plus');
    const rows = await loadProfileQuotaRows(sub.id);
    // Exactly the owner is provisioned (no over-provisioning), at the plus limit.
    expect(rows.length).toBe(1);
    expect(rows[0]!.profileId).toBe(owner.id);
    expect(rows[0]!.monthlyLimit).toBe(getTierConfig('plus').ownerMonthlyQuota);
  });

  it('returns null for an unknown subscription id', async () => {
    const resolved = await reconcileQuotaStateForSubscription(
      createIntegrationDb(),
      '00000000-0000-0000-0000-000000000000',
      new Date('2026-05-15T12:00:00.000Z'),
    );
    expect(resolved).toBeNull();
  });
});
