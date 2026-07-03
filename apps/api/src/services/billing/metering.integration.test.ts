/**
 * Integration: Quota Metering (STAB-3.2)
 *
 * Exercises decrementQuota / incrementQuota against a real database.
 * No mocks of internal services or database — external boundaries only
 * (Stripe / RevenueCat are not touched by these functions).
 *
 * Each test seeds its own data and cleans up in beforeEach / afterAll.
 */

import { and, eq, inArray } from 'drizzle-orm';
import {
  accounts,
  organization,
  person,
  membership,
  subscription as subscriptionV2Table,
  subscriptions,
  profiles,
  profileQuotaUsage,
  quotaPools,
  topUpCredits,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import {
  decrementQuota,
  incrementQuota,
  type DecrementResult,
  reconcileQuotaStateForEffectiveTier,
} from '../billing';
import { getTierConfig } from '../subscription';
import { inngest } from '../../inngest/client';
import { legacyIdentityTableExistsForTest } from '../../test-utils/legacy-identity-anchors';

// ---------------------------------------------------------------------------
// DB setup — real connection, same pattern as tests/integration/helpers.ts
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
// [WI-1239 / 779-strip] v2-only: seeds organization/person/membership/
// subscription (v2, organization-keyed) instead of the legacy accounts/
// profiles/subscriptions tables, since decrementQuota/incrementQuota now
// resolve effective access + ownership via the v2 store unconditionally.
// Deterministic name prefixes (rather than a legacy accounts.email/
// clerkUserId match) so parallel test runs don't collide and cleanup can
// find every row this suite created.
// ---------------------------------------------------------------------------

const PREFIX = 'integration-metering';
const ORG_NAMES = Array.from({ length: 8 }, (_, i) => `${PREFIX}-${i}`);

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedOrganization(index: number) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(organization)
    .values({ name: ORG_NAMES[index]! })
    .returning();
  // [WI-1239 / 779-strip] quota_pools/profile_quota_usage/top_up_credits/
  // usage_events still FK to the legacy `subscriptions` table
  // (pre-M-REPOINT), and `subscriptions.accountId` is itself a NOT NULL FK to
  // `accounts` — seed a matching legacy account (same id as the org, the
  // "reseed identity contract") so seedSubscriptionWithQuota's legacy
  // subscription row below has somewhere to point.
  // [WI-1128] Legacy `accounts` may already be dropped (post-M-DROP); after
  // M-REPOINT, `subscriptions.accountId` targets `organization` directly, so
  // this seed is a no-op there instead of hard-failing.
  if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
    await db.insert(accounts).values({
      id: row!.id,
      clerkUserId: `${ORG_NAMES[index]}-clerk`,
      email: `${ORG_NAMES[index]}@integration.test`,
    });
  }
  return row!;
}

async function seedSubscriptionWithQuota(input: {
  organizationId: string;
  tier?: 'free' | 'plus' | 'family' | 'pro';
  status?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
  currentPeriodEnd?: Date | null;
  monthlyLimit?: number;
  usedThisMonth?: number;
  dailyLimit?: number | null;
  usedToday?: number;
}) {
  const db = createIntegrationDb();
  const tier = input.tier ?? 'plus';
  const tierConfig = getTierConfig(tier);

  // subscription.payerPersonId is NOT NULL (data-model.md §2A.4). Most tests
  // in this file don't care about the payer's identity (only the per-profile
  // describe block seeds an explicit owner/child), so auto-provision a throw-
  // away payer person + membership here rather than threading one through
  // every call site.
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
    organizationId: input.organizationId,
    roles: ['admin'],
  });

  const [subscription] = await db
    .insert(subscriptionV2Table)
    .values({
      organizationId: input.organizationId,
      planTier: tier,
      status: input.status ?? 'active',
      payerPersonId: payer!.id,
      periodStartAt: new Date('2026-04-01T00:00:00.000Z'),
      periodEndAt:
        input.currentPeriodEnd === undefined
          ? new Date('2026-05-01T00:00:00.000Z')
          : input.currentPeriodEnd,
    })
    .returning();

  // [WI-1347] Mirror the v2 subscription into the legacy `subscriptions`
  // table under the SAME id — an id-aligned anchor only; quota_pools' FK now
  // targets v2 `subscription` (repointed by 0129 M-REPOINT), so this is a
  // no-op once the legacy table is dropped.
  if (await legacyIdentityTableExistsForTest(db, 'subscriptions')) {
    await db.insert(subscriptions).values({
      id: subscription!.id,
      accountId: input.organizationId,
      tier,
      status: input.status ?? 'active',
    });
  }

  const [quotaPool] = await db
    .insert(quotaPools)
    .values({
      subscriptionId: subscription!.id,
      monthlyLimit: input.monthlyLimit ?? tierConfig.monthlyQuota,
      usedThisMonth: input.usedThisMonth ?? 0,
      dailyLimit:
        input.dailyLimit === undefined
          ? (tierConfig.dailyLimit ?? null)
          : input.dailyLimit,
      usedToday: input.usedToday ?? 0,
      cycleResetAt: new Date('2026-05-01T00:00:00.000Z'),
    })
    .returning();

  return { subscription: subscription!, quotaPool: quotaPool! };
}

async function seedTopUpCredit(input: {
  subscriptionId: string;
  profileId?: string | null;
  amount: number;
  remaining?: number;
  expiresAt?: Date;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(topUpCredits)
    .values({
      subscriptionId: input.subscriptionId,
      profileId: input.profileId ?? null,
      amount: input.amount,
      remaining: input.remaining ?? input.amount,
      purchasedAt: new Date('2026-04-01T00:00:00.000Z'),
      expiresAt: input.expiresAt ?? new Date('2027-04-01T00:00:00.000Z'),
    })
    .returning();
  return row!;
}

async function seedPerson(input: {
  organizationId: string;
  displayName: string;
  isOwner: boolean;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(person)
    .values({
      displayName: input.displayName,
      birthDate: input.isOwner ? '1990-01-01' : '2016-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning();
  await db.insert(membership).values({
    personId: row!.id,
    organizationId: input.organizationId,
    roles: input.isOwner ? ['admin', 'learner'] : ['learner'],
  });
  // [WI-1239 / 779-strip] profile_quota_usage.profileId still FKs to the
  // legacy `profiles` table (pre-M-REPOINT) — mirror the person under the
  // SAME id, same as the account/subscription dual-write above.
  // [WI-1128] Legacy `profiles` may already be dropped (post-M-DROP); after
  // M-REPOINT, `profile_quota_usage.profileId` targets `person` directly, so
  // this seed is a no-op there instead of hard-failing.
  if (await legacyIdentityTableExistsForTest(db, 'profiles')) {
    await db.insert(profiles).values({
      id: row!.id,
      accountId: input.organizationId,
      displayName: input.displayName,
      birthYear: input.isOwner ? 1990 : 2016,
      isOwner: input.isOwner,
    });
  }
  return row!;
}

async function seedProfileQuota(input: {
  subscriptionId: string;
  profileId: string;
  role: 'owner' | 'child';
  monthlyLimit: number;
  usedThisMonth?: number;
  dailyLimit?: number | null;
  usedToday?: number;
  cycleResetAt?: Date;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(profileQuotaUsage)
    .values({
      subscriptionId: input.subscriptionId,
      profileId: input.profileId,
      role: input.role,
      monthlyLimit: input.monthlyLimit,
      usedThisMonth: input.usedThisMonth ?? 0,
      dailyLimit: input.dailyLimit ?? null,
      usedToday: input.usedToday ?? 0,
      cycleResetAt: input.cycleResetAt ?? new Date('2026-05-01T00:00:00.000Z'),
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

async function loadProfileQuota(subscriptionId: string, profileId: string) {
  const db = createIntegrationDb();
  return db.query.profileQuotaUsage.findFirst({
    where: and(
      eq(profileQuotaUsage.subscriptionId, subscriptionId),
      eq(profileQuotaUsage.profileId, profileId),
    ),
  });
}

async function loadTopUps(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.topUpCredits.findMany({
    where: eq(topUpCredits.subscriptionId, subscriptionId),
  });
}

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const orgs = await db.query.organization.findMany({
    where: inArray(organization.name, ORG_NAMES),
  });
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return;

  // Capture member person ids BEFORE deleting membership (the join that
  // finds them disappears once membership rows are gone).
  const memberships = await db
    .select({ personId: membership.personId })
    .from(membership)
    .where(inArray(membership.organizationId, orgIds));
  const personIds = [...new Set(memberships.map((m) => m.personId))];

  // Ordering respects the FK constraints: subscription.organizationId is
  // RESTRICT (not cascade) on organization, and subscription.payerPersonId
  // is RESTRICT on person — subscription must go first. membership cascades
  // on both organization and person deletes, but deleting it explicitly here
  // keeps the ordering self-contained rather than relying on cascade timing.
  await db
    .delete(subscriptionV2Table)
    .where(inArray(subscriptionV2Table.organizationId, orgIds));
  await db.delete(membership).where(inArray(membership.organizationId, orgIds));
  if (personIds.length > 0) {
    await db.delete(person).where(inArray(person.id, personIds));
  }
  await db.delete(organization).where(inArray(organization.id, orgIds));
  // Legacy account (same id as the org — see seedOrganization) cascades to
  // its subscriptions row, which cascades to quota_pools/profile_quota_usage/
  // top_up_credits/usage_events.
  // [WI-1128] Legacy `accounts` may already be dropped (post-M-DROP); skip
  // the cleanup there instead of hard-failing.
  if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
    await db.delete(accounts).where(inArray(accounts.id, orgIds));
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanupTestAccounts();
  jest.spyOn(inngest, 'send').mockResolvedValue({ ids: [] });
});

afterAll(async () => {
  await cleanupTestAccounts();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Quota metering (integration)', () => {
  it('decrements monthly quota atomically', async () => {
    const org = await seedOrganization(0);
    const seeded = await seedSubscriptionWithQuota({
      organizationId: org.id,
      tier: 'family',
      monthlyLimit: 10,
      usedThisMonth: 5,
      dailyLimit: null,
      usedToday: 0,
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
    );
    const pool = await loadQuotaPool(seeded.subscription.id);

    expect(result.success).toBe(true);
    expect(result.source).toBe('monthly');
    expect(pool!.usedThisMonth).toBe(6);
    expect(pool!.usedToday).toBe(1);
  });

  it('enforces daily cap', async () => {
    const org = await seedOrganization(1);
    const seeded = await seedSubscriptionWithQuota({
      organizationId: org.id,
      tier: 'family',
      monthlyLimit: 100,
      usedThisMonth: 0,
      dailyLimit: 2,
      usedToday: 2,
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
    );
    const pool = await loadQuotaPool(seeded.subscription.id);

    expect(result.success).toBe(false);
    expect(result.source).toBe('daily_exceeded');
    expect(result.remainingDaily).toBe(0);
    // Usage counters must NOT have changed
    expect(pool!.usedToday).toBe(2);
  });

  it('falls back to top-up credits when monthly quota exhausted', async () => {
    const org = await seedOrganization(2);
    const seeded = await seedSubscriptionWithQuota({
      organizationId: org.id,
      tier: 'family',
      monthlyLimit: 10,
      usedThisMonth: 10,
      dailyLimit: null,
      usedToday: 3,
    });
    await seedTopUpCredit({
      subscriptionId: seeded.subscription.id,
      amount: 5,
      remaining: 5,
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
    );
    const topUps = await loadTopUps(seeded.subscription.id);

    expect(result.success).toBe(true);
    expect(result.source).toBe('top_up');
    expect(topUps[0]!.remaining).toBe(4);
    // Monthly counter must NOT have changed
    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedThisMonth).toBe(10);
  });

  it('increments quota back on LLM failure (no underflow)', async () => {
    const org = await seedOrganization(3);
    const seeded = await seedSubscriptionWithQuota({
      organizationId: org.id,
      tier: 'family',
      monthlyLimit: 10,
      usedThisMonth: 0,
      usedToday: 0,
    });

    // incrementQuota when usedThisMonth=0 must not go below 0 (GREATEST guard)
    await incrementQuota(createIntegrationDb(), seeded.subscription.id);

    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedThisMonth).toBe(0);
    expect(pool!.usedToday).toBe(0);
  });

  // [BREAK / S-2 / BUG-627] Concurrent top-up decrements MUST NOT bypass the
  // daily cap. Pre-fix: two concurrent calls both passed the snapshot check
  // at usedToday=dailyLimit-1, both consumed a top-up credit, both unguarded-
  // updated usedToday +1 — ending at dailyLimit+1 (silent cap bypass).
  // Post-fix: only one succeeds; the others get daily_exceeded and their
  // top-up decrements are rolled back.
  it('[BREAK] concurrent top-up consumers do not bypass daily cap', async () => {
    const org = await seedOrganization(5);
    const seeded = await seedSubscriptionWithQuota({
      organizationId: org.id,
      tier: 'family',
      monthlyLimit: 10,
      usedThisMonth: 10, // monthly exhausted — forces top-up path
      dailyLimit: 2,
      usedToday: 1, // one slot left under daily cap
    });
    await seedTopUpCredit({
      subscriptionId: seeded.subscription.id,
      amount: 5,
      remaining: 5,
    });

    // Fire 3 concurrent decrements. With usedToday=1 / dailyLimit=2 only
    // ONE should be admitted before the cap is hit.
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        decrementQuota(createIntegrationDb(), seeded.subscription.id),
      ),
    );

    const successes = results.filter((r: DecrementResult) => r.success);
    const dailyExceeded = results.filter(
      (r: DecrementResult) => r.source === 'daily_exceeded',
    );

    expect(successes).toHaveLength(1);
    expect(dailyExceeded).toHaveLength(2);

    // usedToday must be exactly dailyLimit (2), not dailyLimit+N.
    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedToday).toBe(2);

    // Top-up was rolled back for the 2 losers — only 1 credit consumed.
    const topUps = await loadTopUps(seeded.subscription.id);
    expect(topUps[0]!.remaining).toBe(4);
  });

  // [BREAK / CR-2026-05-19-C6] Top-up consumption followed by LLM-failure refund
  // MUST credit the top-up batch, not decrement the monthly pool. Pre-fix:
  // incrementQuota unconditionally ran `usedThisMonth = GREATEST(usedThisMonth - 1, 0)`
  // — so every LLM failure on a top-up consumption inflated the monthly pool by 1.
  it('[BREAK CR-2026-05-19-C6] LLM-failure refund after top-up consumption credits top-up, not monthly', async () => {
    const org = await seedOrganization(6);
    const seeded = await seedSubscriptionWithQuota({
      organizationId: org.id,
      tier: 'family',
      monthlyLimit: 10,
      usedThisMonth: 10, // monthly exhausted — forces top-up path
      dailyLimit: null,
      usedToday: 3,
    });
    const topUp = await seedTopUpCredit({
      subscriptionId: seeded.subscription.id,
      amount: 5,
      remaining: 5,
    });

    // Consume one top-up credit
    const decrement = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
    );
    expect(decrement.success).toBe(true);
    expect(decrement.source).toBe('top_up');
    expect(decrement.topUpCreditId).toBe(topUp.id);

    let pool = await loadQuotaPool(seeded.subscription.id);
    let topUps = await loadTopUps(seeded.subscription.id);
    expect(pool!.usedThisMonth).toBe(10); // unchanged
    expect(pool!.usedToday).toBe(4);
    expect(topUps[0]!.remaining).toBe(4);

    // Simulate LLM failure → refund. Caller threads source + id back.
    await incrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
      undefined,
      { source: decrement.source, topUpCreditId: decrement.topUpCreditId },
    );

    pool = await loadQuotaPool(seeded.subscription.id);
    topUps = await loadTopUps(seeded.subscription.id);

    // Monthly pool MUST NOT have been inflated.
    expect(pool!.usedThisMonth).toBe(10);
    // Daily counter rolled back (the slot is freed).
    expect(pool!.usedToday).toBe(3);
    // Top-up batch was credited back.
    expect(topUps[0]!.remaining).toBe(5);
  });

  it('[BREAK] refund uses the quota model from the original decrement', async () => {
    const org = await seedOrganization(6);
    const seeded = await seedSubscriptionWithQuota({
      organizationId: org.id,
      tier: 'family',
      monthlyLimit: 10,
      usedThisMonth: 10,
      dailyLimit: null,
      usedToday: 3,
    });
    const topUp = await seedTopUpCredit({
      subscriptionId: seeded.subscription.id,
      amount: 5,
      remaining: 5,
    });

    const decrement = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
    );
    expect(decrement).toMatchObject({
      success: true,
      source: 'top_up',
      quotaModel: 'shared-pool',
      topUpCreditId: topUp.id,
    });

    await createIntegrationDb()
      .update(subscriptionV2Table)
      .set({ planTier: 'plus', updatedAt: new Date() })
      .where(eq(subscriptionV2Table.id, seeded.subscription.id));

    await incrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
      undefined,
      {
        source: decrement.source,
        topUpCreditId: decrement.topUpCreditId,
        quotaModel: decrement.quotaModel,
      },
    );

    const pool = await loadQuotaPool(seeded.subscription.id);
    const topUps = await loadTopUps(seeded.subscription.id);
    expect(pool!.usedThisMonth).toBe(10);
    expect(pool!.usedToday).toBe(3);
    expect(topUps[0]!.remaining).toBe(5);
  });

  // [REGRESSION / CR-2026-05-19-C6] Legacy callers that omit `source` still
  // refund the monthly pool (back-compat) — they were the only refund path
  // before the fix and shouldn't break.
  it('[CR-2026-05-19-C6] legacy refund without source falls back to monthly pool', async () => {
    const org = await seedOrganization(7);
    const seeded = await seedSubscriptionWithQuota({
      organizationId: org.id,
      tier: 'family',
      monthlyLimit: 10,
      usedThisMonth: 5,
      usedToday: 2,
    });

    await incrementQuota(createIntegrationDb(), seeded.subscription.id);

    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedThisMonth).toBe(4);
    expect(pool!.usedToday).toBe(1);
  });

  // [BREAK CR-2026-05-19-M11] Daily-cap discrimination must use the in-transaction
  // pool snapshot, not a second out-of-transaction read. Pre-fix: if a daily-reset
  // cron fired between the monthly UPDATE (which fails) and the separate re-read,
  // usedToday would flip to 0, making the caller fall through to the top-up path
  // even though the daily cap was hit. Post-fix: the re-read is inside the same
  // transaction as the UPDATE attempt, so it sees the same consistent snapshot —
  // daily cap = hit → daily_exceeded, not top_up.
  //
  // This test covers the state that WOULD have been misread pre-fix:
  // usedToday >= dailyLimit (cap hit) AND usedThisMonth >= monthlyLimit (monthly
  // exhausted) AND a top-up is available. If the pool snapshot were re-read
  // outside the tx with usedToday=0 the test would instead return top_up.
  it('[BREAK CR-2026-05-19-M11] daily-cap discrimination uses in-transaction pool snapshot (cron-race safety)', async () => {
    const dailyLimit = 2;
    const monthlyLimit = 10;

    const org = await seedOrganization(0); // reuse slot 0 — cleaned in beforeEach
    const seeded = await seedSubscriptionWithQuota({
      organizationId: org.id,
      tier: 'family',
      monthlyLimit,
      usedThisMonth: monthlyLimit, // monthly exhausted
      dailyLimit,
      usedToday: dailyLimit, // daily cap already hit
    });
    // A top-up is available — if the re-read race fires, this would be consumed
    await seedTopUpCredit({
      subscriptionId: seeded.subscription.id,
      amount: 5,
      remaining: 5,
    });

    const result = await decrementQuota(
      createIntegrationDb(),
      seeded.subscription.id,
    );

    // Must be daily_exceeded — NOT top_up (which would happen if usedToday were
    // misread as 0 by an out-of-transaction re-read racing with the daily-reset cron).
    expect(result.success).toBe(false);
    expect(result.source).toBe('daily_exceeded');

    // Top-up credit must be untouched (not consumed by the wrong branch).
    const topUps = await loadTopUps(seeded.subscription.id);
    expect(topUps[0]!.remaining).toBe(5);
  });

  it('concurrent decrements do not over-consume', async () => {
    // Set remaining=1 → fire 5 concurrent decrementQuota calls
    // Exactly 1 should succeed, 4 should get quota_exceeded
    const org = await seedOrganization(4);
    const seeded = await seedSubscriptionWithQuota({
      organizationId: org.id,
      tier: 'family',
      monthlyLimit: 1,
      usedThisMonth: 0,
      dailyLimit: null,
      usedToday: 0,
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        decrementQuota(createIntegrationDb(), seeded.subscription.id),
      ),
    );

    const successes = results.filter((r: DecrementResult) => r.success);
    const failures = results.filter((r: DecrementResult) => !r.success);

    // Exactly 1 of the 5 concurrent calls should succeed
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(4);

    // Verify the quota pool was only decremented once
    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedThisMonth).toBe(1);
  });

  describe('per-profile quota model', () => {
    it.each(['free', 'plus'] as const)(
      'requires a profileId for %s metering',
      async (tier) => {
        const org = await seedOrganization(0);
        const seeded = await seedSubscriptionWithQuota({
          organizationId: org.id,
          tier,
        });

        await expect(
          decrementQuota(createIntegrationDb(), seeded.subscription.id),
        ).rejects.toMatchObject({ code: 'PROFILE_ID_REQUIRED' });
      },
    );

    it('resets stale shared-pool usage when a subscription re-enters that model', async () => {
      const org = await seedOrganization(0);
      const seeded = await seedSubscriptionWithQuota({
        organizationId: org.id,
        tier: 'family',
        monthlyLimit: 1,
        usedThisMonth: 1,
        dailyLimit: 5,
        usedToday: 4,
      });
      const now = new Date('2026-06-01T00:00:00.000Z');

      await reconcileQuotaStateForEffectiveTier(
        createIntegrationDb(),
        seeded.subscription.id,
        'family',
        now,
      );

      const pool = await loadQuotaPool(seeded.subscription.id);
      expect(pool).toMatchObject({
        monthlyLimit: getTierConfig('family').monthlyQuota,
        usedThisMonth: 0,
        dailyLimit: getTierConfig('family').dailyLimit,
        usedToday: 0,
      });
      expect(pool!.cycleResetAt).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    });

    it('decrements owner and child rows independently', async () => {
      const plusTier = getTierConfig('plus');
      const org = await seedOrganization(1);
      const seeded = await seedSubscriptionWithQuota({
        organizationId: org.id,
        tier: 'plus',
      });
      const owner = await seedPerson({
        organizationId: org.id,
        displayName: 'Owner',
        isOwner: true,
      });
      const child = await seedPerson({
        organizationId: org.id,
        displayName: 'Child',
        isOwner: false,
      });
      await seedProfileQuota({
        subscriptionId: seeded.subscription.id,
        profileId: owner.id,
        role: 'owner',
        monthlyLimit: plusTier.ownerMonthlyQuota!,
        dailyLimit: plusTier.ownerDailyQuota,
      });
      await seedProfileQuota({
        subscriptionId: seeded.subscription.id,
        profileId: child.id,
        role: 'child',
        monthlyLimit: plusTier.childMonthlyQuota!,
        usedThisMonth: 3,
        dailyLimit: plusTier.childDailyQuota,
        usedToday: 2,
      });

      const ownerResult = await decrementQuota(
        createIntegrationDb(),
        seeded.subscription.id,
        owner.id,
      );
      const childResult = await decrementQuota(
        createIntegrationDb(),
        seeded.subscription.id,
        child.id,
      );

      expect(ownerResult).toMatchObject({
        success: true,
        source: 'monthly',
        profileRole: 'owner',
        remainingMonthly: plusTier.ownerMonthlyQuota! - 1,
        remainingDaily: null,
      });
      expect(childResult).toMatchObject({
        success: true,
        source: 'monthly',
        profileRole: 'child',
        remainingMonthly: plusTier.childMonthlyQuota! - 4,
        remainingDaily: plusTier.childDailyQuota! - 3,
      });

      const ownerQuota = await loadProfileQuota(
        seeded.subscription.id,
        owner.id,
      );
      const childQuota = await loadProfileQuota(
        seeded.subscription.id,
        child.id,
      );
      expect(ownerQuota!.usedThisMonth).toBe(1);
      expect(ownerQuota!.usedToday).toBe(1);
      expect(childQuota!.usedThisMonth).toBe(4);
      expect(childQuota!.usedToday).toBe(3);
    });

    it('spends Plus top-ups only for the owner profile', async () => {
      const plusTier = getTierConfig('plus');
      const org = await seedOrganization(2);
      const seeded = await seedSubscriptionWithQuota({
        organizationId: org.id,
        tier: 'plus',
      });
      const owner = await seedPerson({
        organizationId: org.id,
        displayName: 'Owner',
        isOwner: true,
      });
      const child = await seedPerson({
        organizationId: org.id,
        displayName: 'Child',
        isOwner: false,
      });
      await seedProfileQuota({
        subscriptionId: seeded.subscription.id,
        profileId: owner.id,
        role: 'owner',
        monthlyLimit: plusTier.ownerMonthlyQuota!,
        usedThisMonth: plusTier.ownerMonthlyQuota!,
        dailyLimit: plusTier.ownerDailyQuota,
      });
      await seedProfileQuota({
        subscriptionId: seeded.subscription.id,
        profileId: child.id,
        role: 'child',
        monthlyLimit: plusTier.childMonthlyQuota!,
        usedThisMonth: plusTier.childMonthlyQuota!,
        dailyLimit: plusTier.childDailyQuota,
      });
      await seedTopUpCredit({
        subscriptionId: seeded.subscription.id,
        profileId: owner.id,
        amount: 3,
        remaining: 3,
      });

      const childResult = await decrementQuota(
        createIntegrationDb(),
        seeded.subscription.id,
        child.id,
      );
      const ownerResult = await decrementQuota(
        createIntegrationDb(),
        seeded.subscription.id,
        owner.id,
      );

      expect(childResult).toMatchObject({
        success: false,
        source: 'none',
        profileRole: 'child',
      });
      expect(ownerResult).toMatchObject({
        success: true,
        source: 'top_up',
        profileRole: 'owner',
        remainingTopUp: 2,
      });

      const topUps = await loadTopUps(seeded.subscription.id);
      expect(topUps[0]!.remaining).toBe(2);
      const childQuota = await loadProfileQuota(
        seeded.subscription.id,
        child.id,
      );
      expect(childQuota!.usedThisMonth).toBe(plusTier.childMonthlyQuota);
      expect(childQuota!.usedToday).toBe(0);
    });

    it('lazily provisions a missing child row and retries the decrement', async () => {
      const plusTier = getTierConfig('plus');
      const org = await seedOrganization(3);
      const seeded = await seedSubscriptionWithQuota({
        organizationId: org.id,
        tier: 'plus',
      });
      const child = await seedPerson({
        organizationId: org.id,
        displayName: 'Child',
        isOwner: false,
      });

      const result = await decrementQuota(
        createIntegrationDb(),
        seeded.subscription.id,
        child.id,
      );

      expect(result).toMatchObject({
        success: true,
        source: 'monthly',
        profileRole: 'child',
        remainingMonthly: plusTier.childMonthlyQuota! - 1,
        remainingDaily: plusTier.childDailyQuota! - 1,
      });
      const childQuota = await loadProfileQuota(
        seeded.subscription.id,
        child.id,
      );
      expect(childQuota).toMatchObject({
        role: 'child',
        monthlyLimit: plusTier.childMonthlyQuota,
        dailyLimit: plusTier.childDailyQuota,
        usedThisMonth: 1,
        usedToday: 1,
      });
    });

    it('clamps stale Plus owner rows to Free caps while billing is past due', async () => {
      const plusTier = getTierConfig('plus');
      const freeTier = getTierConfig('free');
      const staleUsedThisMonth = freeTier.ownerMonthlyQuota! - 1;
      const org = await seedOrganization(4);
      const seeded = await seedSubscriptionWithQuota({
        organizationId: org.id,
        tier: 'plus',
        status: 'past_due',
      });
      const owner = await seedPerson({
        organizationId: org.id,
        displayName: 'Owner',
        isOwner: true,
      });
      await seedProfileQuota({
        subscriptionId: seeded.subscription.id,
        profileId: owner.id,
        role: 'owner',
        monthlyLimit: plusTier.ownerMonthlyQuota!,
        usedThisMonth: staleUsedThisMonth,
        dailyLimit: plusTier.ownerDailyQuota,
        usedToday: 0,
      });

      const result = await decrementQuota(
        createIntegrationDb(),
        seeded.subscription.id,
        owner.id,
      );

      expect(result).toMatchObject({
        success: true,
        source: 'monthly',
        profileRole: 'owner',
        monthlyLimit: freeTier.ownerMonthlyQuota,
        remainingMonthly: 0,
        remainingDaily: freeTier.ownerDailyQuota! - 1,
      });
      const ownerQuota = await loadProfileQuota(
        seeded.subscription.id,
        owner.id,
      );
      expect(ownerQuota).toMatchObject({
        monthlyLimit: freeTier.ownerMonthlyQuota,
        dailyLimit: freeTier.ownerDailyQuota,
        usedThisMonth: freeTier.ownerMonthlyQuota,
        usedToday: 1,
      });
    });

    it('[PR3] emits a quota-specific parent notification event when a child exhausts the daily cap', async () => {
      const plusTier = getTierConfig('plus');
      const org = await seedOrganization(5);
      const seeded = await seedSubscriptionWithQuota({
        organizationId: org.id,
        tier: 'plus',
      });
      const child = await seedPerson({
        organizationId: org.id,
        displayName: 'Child',
        isOwner: false,
      });
      await seedProfileQuota({
        subscriptionId: seeded.subscription.id,
        profileId: child.id,
        role: 'child',
        monthlyLimit: plusTier.childMonthlyQuota!,
        usedThisMonth: 3,
        dailyLimit: plusTier.childDailyQuota,
        usedToday: plusTier.childDailyQuota!,
      });

      const result = await decrementQuota(
        createIntegrationDb(),
        seeded.subscription.id,
        child.id,
      );

      expect(result).toMatchObject({
        success: false,
        source: 'daily_exceeded',
        profileRole: 'child',
      });
      expect(inngest.send).toHaveBeenCalledWith({
        name: 'app/billing.profile_quota.exhausted',
        data: expect.objectContaining({
          subscriptionId: seeded.subscription.id,
          profileId: child.id,
          kind: 'daily_exceeded',
          resetsAt: expect.any(String),
          occurredAt: expect.any(String),
        }),
      });
    });

    it('[PR3] emits monthly_exceeded when a child exhausts the monthly cap without using owner top-ups', async () => {
      const plusTier = getTierConfig('plus');
      const org = await seedOrganization(5);
      const seeded = await seedSubscriptionWithQuota({
        organizationId: org.id,
        tier: 'plus',
      });
      const owner = await seedPerson({
        organizationId: org.id,
        displayName: 'Owner',
        isOwner: true,
      });
      const child = await seedPerson({
        organizationId: org.id,
        displayName: 'Child',
        isOwner: false,
      });
      await seedProfileQuota({
        subscriptionId: seeded.subscription.id,
        profileId: child.id,
        role: 'child',
        monthlyLimit: plusTier.childMonthlyQuota!,
        usedThisMonth: plusTier.childMonthlyQuota!,
        dailyLimit: plusTier.childDailyQuota,
        usedToday: 0,
      });
      await seedTopUpCredit({
        subscriptionId: seeded.subscription.id,
        profileId: owner.id,
        amount: 3,
        remaining: 3,
      });

      const result = await decrementQuota(
        createIntegrationDb(),
        seeded.subscription.id,
        child.id,
      );

      expect(result).toMatchObject({
        success: false,
        source: 'none',
        profileRole: 'child',
      });
      expect(inngest.send).toHaveBeenCalledWith({
        name: 'app/billing.profile_quota.exhausted',
        data: expect.objectContaining({
          subscriptionId: seeded.subscription.id,
          profileId: child.id,
          kind: 'monthly_exceeded',
          resetsAt: '2026-05-01T00:00:00.000Z',
          occurredAt: expect.any(String),
        }),
      });
      const topUps = await loadTopUps(seeded.subscription.id);
      expect(topUps[0]!.remaining).toBe(3);
    });

    it('[PR3] does not notify a parent when the owner exhausts Plus quota', async () => {
      const plusTier = getTierConfig('plus');
      const org = await seedOrganization(5);
      const seeded = await seedSubscriptionWithQuota({
        organizationId: org.id,
        tier: 'plus',
      });
      const owner = await seedPerson({
        organizationId: org.id,
        displayName: 'Owner',
        isOwner: true,
      });
      await seedProfileQuota({
        subscriptionId: seeded.subscription.id,
        profileId: owner.id,
        role: 'owner',
        monthlyLimit: plusTier.ownerMonthlyQuota!,
        usedThisMonth: plusTier.ownerMonthlyQuota!,
        dailyLimit: plusTier.ownerDailyQuota,
        usedToday: 0,
      });

      const result = await decrementQuota(
        createIntegrationDb(),
        seeded.subscription.id,
        owner.id,
      );

      expect(result).toMatchObject({
        success: false,
        source: 'none',
        profileRole: 'owner',
      });
      expect(inngest.send).not.toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/billing.profile_quota.exhausted',
        }),
      );
    });
  });
});
