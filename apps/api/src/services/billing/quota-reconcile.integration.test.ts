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
  profileQuotaUsage,
  profiles,
  quotaPools,
  subscriptions,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import {
  reconcileQuotaStateForEffectiveTier,
  reconcileQuotaStateForSubscription,
} from './quota-reconcile';
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
const ALL_EMAILS = TEST_ACCOUNTS.map((a) => a.email);
const ALL_CLERK_IDS = TEST_ACCOUNTS.map((a) => a.clerkUserId);

function expectedNextReset(now: Date): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() + 1);
  return d;
}

async function seedAccount(index: number) {
  const db = createIntegrationDb();
  const account = TEST_ACCOUNTS[index]!;
  const [row] = await db
    .insert(accounts)
    .values({ clerkUserId: account.clerkUserId, email: account.email })
    .returning();
  return row!;
}

async function seedSubscription(input: {
  accountId: string;
  tier?: 'free' | 'plus' | 'family' | 'pro';
  status?: 'active' | 'trial' | 'expired';
}) {
  const db = createIntegrationDb();
  const [sub] = await db
    .insert(subscriptions)
    .values({
      accountId: input.accountId,
      tier: input.tier ?? 'family',
      status: input.status ?? 'active',
    })
    .returning();
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
  const [row] = await db
    .insert(profiles)
    .values({
      accountId: input.accountId,
      displayName: input.displayName,
      birthYear: input.birthYear,
      isOwner: input.isOwner,
      archivedAt: input.archivedAt ?? null,
    })
    .returning();
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
  const byEmail = await db.query.accounts.findMany({
    where: inArray(accounts.email, ALL_EMAILS),
  });
  const byClerk = await db.query.accounts.findMany({
    where: inArray(accounts.clerkUserId, ALL_CLERK_IDS),
  });
  const ids = [...new Set([...byEmail, ...byClerk].map((r) => r.id))];
  if (ids.length > 0) {
    await db.delete(accounts).where(inArray(accounts.id, ids));
  }
}

beforeEach(async () => {
  await cleanupTestAccounts();
});

afterAll(async () => {
  await cleanupTestAccounts();
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

    await reconcileQuotaStateForEffectiveTier(
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
    const archivedChild = await seedProfile({
      accountId: account.id,
      displayName: 'Archived Child',
      birthYear: 2012,
      isOwner: false,
      archivedAt: new Date('2026-04-01T00:00:00.000Z'),
    });

    await reconcileQuotaStateForEffectiveTier(
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

    const resolved = await reconcileQuotaStateForSubscription(
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
