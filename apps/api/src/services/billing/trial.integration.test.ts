/**
 * Integration: Quota reset helpers
 *
 * [CR-2026-05-19-C7] Verifies `resetDailyQuotas` counts every pool with
 * usedToday > 0.
 *
 * [WI-1347] This file originally also verified resetDailyQuotas +
 * resetExpiredQuotaCycles atomicity/ordering, and covered
 * transitionToExtendedTrial / downgradeExtendedTrialQuotaIfStillExpired /
 * transitionToExtendedTrialFromRevenuecatEvent / expireTrialAndDowngradeQuota.
 * All of those are transitively dead (billing/trial.ts's legacy exports —
 * see docs/_archive/retired-code.md, "WI-1347 — billing/trial.integration.test.ts").
 * resetDailyQuotas itself touches no legacy identity table and remains live.
 *
 * No mocks of internal services or database — external boundaries only
 * (none touched by these helpers).
 */

import { eq, inArray } from 'drizzle-orm';
import {
  membership,
  organization,
  person,
  quotaPools,
  subscription as subscriptionV2Table,
  createDatabase,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { resetDailyQuotas } from '../billing';
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
// Seed helpers — unique prefix so parallel test runs don't collide
// ---------------------------------------------------------------------------

const PREFIX = 'integration-trial-reset';
const TEST_ACCOUNTS = [
  { clerkUserId: `${PREFIX}-01`, email: `${PREFIX}-01@integration.test` },
  { clerkUserId: `${PREFIX}-02`, email: `${PREFIX}-02@integration.test` },
  { clerkUserId: `${PREFIX}-03`, email: `${PREFIX}-03@integration.test` },
  // [CR-2026-05-19-M3] Additional accounts for atomicity tests
  { clerkUserId: `${PREFIX}-m3-01`, email: `${PREFIX}-m3-01@integration.test` },
  { clerkUserId: `${PREFIX}-m3-02`, email: `${PREFIX}-m3-02@integration.test` },
  { clerkUserId: `${PREFIX}-m3-03`, email: `${PREFIX}-m3-03@integration.test` },
  { clerkUserId: `${PREFIX}-m3-04`, email: `${PREFIX}-m3-04@integration.test` },
  { clerkUserId: `${PREFIX}-m3-05`, email: `${PREFIX}-m3-05@integration.test` },
];

async function seedAccount(index: number) {
  const db = createIntegrationDb();
  const [org] = await db
    .insert(organization)
    .values({ name: `${PREFIX}-org-${index}` })
    .returning();
  return org!;
}

// [WI-1128] `quota_pools.subscriptionId` now FKs to the v2 `subscription`
// table (post-M-REPOINT). Auto-provision a throwaway payer (subscription.
// payerPersonId is NOT NULL — these tests don't care about payer identity),
// and return the v2 subscription id so callers mirror the legacy
// `subscriptions` row under the SAME id (resetExpiredQuotaCycles' raw-SQL
// join on `qp.subscription_id = s.id` depends on the two ids matching).
async function seedV2SubscriptionCounterpart(
  db: Database,
  organizationId: string,
  tier: 'free' | 'plus' | 'family' | 'pro',
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired',
): Promise<string> {
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
    organizationId,
    roles: ['admin'],
  });
  const [subV2] = await db
    .insert(subscriptionV2Table)
    .values({
      organizationId,
      planTier: tier,
      status,
      payerPersonId: payer!.id,
    })
    .returning();
  return subV2!.id;
}

async function seedSubscriptionWithQuota(input: {
  accountId: string;
  tier?: 'free' | 'plus' | 'family' | 'pro';
  usedThisMonth?: number;
  usedToday?: number;
  cycleResetAt: Date;
}) {
  const db = createIntegrationDb();
  const tier = input.tier ?? 'plus';
  const tierConfig = getTierConfig(tier);

  const subV2Id = await seedV2SubscriptionCounterpart(
    db,
    input.accountId,
    tier,
    'active',
  );

  const [quotaPool] = await db
    .insert(quotaPools)
    .values({
      subscriptionId: subV2Id,
      monthlyLimit: tierConfig.monthlyQuota,
      usedThisMonth: input.usedThisMonth ?? 0,
      dailyLimit: tierConfig.dailyLimit ?? null,
      usedToday: input.usedToday ?? 0,
      cycleResetAt: input.cycleResetAt,
    })
    .returning();

  return { subscription: { id: subV2Id }, quotaPool: quotaPool! };
}

async function loadQuotaPool(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });
}

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const orgs = await db.query.organization.findMany({
    where: inArray(
      organization.name,
      TEST_ACCOUNTS.map((_, i) => `${PREFIX}-org-${i}`),
    ),
  });
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return;

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
}

beforeEach(async () => {
  await cleanupTestAccounts();
});

afterAll(async () => {
  await cleanupTestAccounts();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// [WI-1347] Retired the 2 resetExpiredQuotaCycles-exercising tests from this
// describe (the combined-transaction atomicity test + the standalone test) —
// legacy resetExpiredQuotaCycles is transitively dead, superseded by
// resetExpiredQuotaCyclesV2 (the live quota-reset.ts cron pairs it with
// resetDailyQuotas instead). See docs/_archive/retired-code.md
// ("WI-1347 — billing/trial.integration.test.ts"). resetDailyQuotas itself
// touches no legacy identity table and remains live-safe; its test is kept.
describe('Quota reset helpers (integration) [CR-2026-05-19-C7]', () => {
  const NOW = new Date('2026-05-15T01:00:00.000Z');

  it('resetDailyQuotas counts every pool with usedToday > 0', async () => {
    const account = await seedAccount(0);
    const cycleStillFuture = new Date('2027-01-01T00:00:00.000Z');
    const seeded = await seedSubscriptionWithQuota({
      accountId: account.id,
      tier: 'plus',
      usedThisMonth: 3,
      usedToday: 4,
      cycleResetAt: cycleStillFuture,
    });

    const count = await resetDailyQuotas(createIntegrationDb(), NOW);
    expect(count).toBeGreaterThanOrEqual(1);

    const pool = await loadQuotaPool(seeded.subscription.id);
    expect(pool!.usedToday).toBe(0);
    // Monthly counter untouched by the daily reset.
    expect(pool!.usedThisMonth).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// [WI-1347, retired] 4 describe blocks removed: transitionToExtendedTrial
// atomicity, downgradeExtendedTrialQuotaIfStillExpired atomicity,
// transitionToExtendedTrialFromRevenuecatEvent, expireTrialAndDowngradeQuota
// atomicity. All tested billing/trial.ts exports confirmed transitively
// dead — zero live callers outside their own barrel re-export; the live
// Inngest trial-expiry.ts job imports exclusively from
// billing-v2/trial-v2.ts. Preservation gate: annotated tag
// retired/wi-1347-trial-dead-fn-blocks + docs/_archive/retired-code.md
// ("WI-1347 — billing/trial.integration.test.ts"). V2 integration coverage
// tracked in WI-1371.
// ---------------------------------------------------------------------------
