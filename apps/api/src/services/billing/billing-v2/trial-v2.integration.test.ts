import { resolve } from 'path';

import { eq, inArray } from 'drizzle-orm';
import {
  createDatabase,
  generateUUIDv7,
  membership,
  organization,
  person,
  profileQuotaUsage,
  quotaPools,
  subscription as subscriptionTable,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { getTierConfig } from '../../subscription';
import {
  downgradeExtendedTrialQuotaIfStillExpiredV2,
  expireTrialAndDowngradeQuotaV2,
  expireTrialSubscriptionV2,
  resetExpiredQuotaCyclesV2,
  transitionToExtendedTrialFromRevenuecatEventV2,
  transitionToExtendedTrialV2,
} from './trial-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

function createIntegrationDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return createDatabase(url);
}

type PlanTier = 'free' | 'plus' | 'family' | 'pro';
type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired';

interface SeedGraphInput {
  planTier?: PlanTier;
  status?: SubscriptionStatus;
  withQuotaPool?: boolean;
  monthlyLimit?: number;
  dailyLimit?: number | null;
  usedThisMonth?: number;
  usedToday?: number;
  cycleResetAt?: Date;
  lastRevenuecatEventId?: string | null;
  lastRevenuecatEventTimestampMs?: string | null;
}

interface SeedGraph {
  organizationId: string;
  personId: string;
  subscriptionId: string;
}

const trackedOrganizationIds: string[] = [];
const trackedPersonIds: string[] = [];
const trackedSubscriptionIds: string[] = [];

async function seedGraph(input: SeedGraphInput = {}): Promise<SeedGraph> {
  const db = createIntegrationDb();
  const [org] = await db
    .insert(organization)
    .values({ name: `trial-v2-integration-${generateUUIDv7()}` })
    .returning();
  const [payer] = await db
    .insert(person)
    .values({
      displayName: 'Trial v2 integration payer',
      birthDate: '1990-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning();

  await db.insert(membership).values({
    organizationId: org!.id,
    personId: payer!.id,
    roles: ['admin', 'learner'],
  });

  const [subscription] = await db
    .insert(subscriptionTable)
    .values({
      organizationId: org!.id,
      payerPersonId: payer!.id,
      planTier: input.planTier ?? 'plus',
      status: input.status ?? 'trial',
      trialEndsAt: new Date('2026-06-01T00:00:00.000Z'),
      lastRevenuecatEventId: input.lastRevenuecatEventId,
      lastRevenuecatEventTimestampMs: input.lastRevenuecatEventTimestampMs,
    })
    .returning();

  trackedOrganizationIds.push(org!.id);
  trackedPersonIds.push(payer!.id);
  trackedSubscriptionIds.push(subscription!.id);

  if (input.withQuotaPool !== false) {
    await db.insert(quotaPools).values({
      subscriptionId: subscription!.id,
      monthlyLimit: input.monthlyLimit ?? 500,
      dailyLimit: input.dailyLimit ?? 50,
      usedThisMonth: input.usedThisMonth ?? 17,
      usedToday: input.usedToday ?? 3,
      cycleResetAt: input.cycleResetAt ?? new Date('2026-07-01T00:00:00.000Z'),
    });
  }

  return {
    organizationId: org!.id,
    personId: payer!.id,
    subscriptionId: subscription!.id,
  };
}

async function loadSubscription(subscriptionId: string) {
  const db = createIntegrationDb();
  const [row] = await db
    .select()
    .from(subscriptionTable)
    .where(eq(subscriptionTable.id, subscriptionId));
  return row;
}

async function loadQuotaPool(subscriptionId: string) {
  const db = createIntegrationDb();
  const [row] = await db
    .select()
    .from(quotaPools)
    .where(eq(quotaPools.subscriptionId, subscriptionId));
  return row;
}

async function loadProfileQuota(subscriptionId: string) {
  const db = createIntegrationDb();
  const [row] = await db
    .select()
    .from(profileQuotaUsage)
    .where(eq(profileQuotaUsage.subscriptionId, subscriptionId));
  return row;
}

async function cleanupTrackedRows() {
  const db = createIntegrationDb();

  if (trackedSubscriptionIds.length > 0) {
    await db
      .delete(profileQuotaUsage)
      .where(inArray(profileQuotaUsage.subscriptionId, trackedSubscriptionIds));
    await db
      .delete(quotaPools)
      .where(inArray(quotaPools.subscriptionId, trackedSubscriptionIds));
    await db
      .delete(subscriptionTable)
      .where(inArray(subscriptionTable.id, trackedSubscriptionIds));
  }
  if (trackedPersonIds.length > 0) {
    await db
      .delete(membership)
      .where(inArray(membership.personId, trackedPersonIds));
    await db.delete(person).where(inArray(person.id, trackedPersonIds));
  }
  if (trackedOrganizationIds.length > 0) {
    await db
      .delete(organization)
      .where(inArray(organization.id, trackedOrganizationIds));
  }

  trackedSubscriptionIds.length = 0;
  trackedPersonIds.length = 0;
  trackedOrganizationIds.length = 0;
}

describe('billing-v2 trial lifecycle (integration)', () => {
  afterEach(cleanupTrackedRows);
  afterAll(cleanupTrackedRows);

  it('transitions a trial and its quota pool to the extended free trial', async () => {
    const free = getTierConfig('free');
    const graph = await seedGraph();

    await expect(
      transitionToExtendedTrialV2(
        createIntegrationDb(),
        graph.subscriptionId,
        275,
      ),
    ).resolves.toBe(true);

    await expect(loadSubscription(graph.subscriptionId)).resolves.toMatchObject(
      {
        status: 'expired',
        planTier: 'free',
      },
    );
    await expect(loadQuotaPool(graph.subscriptionId)).resolves.toMatchObject({
      monthlyLimit: 275,
      dailyLimit: free.dailyLimit,
      usedThisMonth: 0,
      usedToday: 0,
    });
  });

  it('returns false without mutating an active subscription or its quota', async () => {
    const graph = await seedGraph({ status: 'active' });
    const subscriptionBefore = await loadSubscription(graph.subscriptionId);
    const quotaBefore = await loadQuotaPool(graph.subscriptionId);

    await expect(
      transitionToExtendedTrialV2(
        createIntegrationDb(),
        graph.subscriptionId,
        275,
      ),
    ).resolves.toBe(false);

    await expect(loadSubscription(graph.subscriptionId)).resolves.toMatchObject(
      {
        status: subscriptionBefore!.status,
        planTier: subscriptionBefore!.planTier,
        updatedAt: subscriptionBefore!.updatedAt,
      },
    );
    await expect(loadQuotaPool(graph.subscriptionId)).resolves.toMatchObject({
      monthlyLimit: quotaBefore!.monthlyLimit,
      dailyLimit: quotaBefore!.dailyLimit,
      usedThisMonth: quotaBefore!.usedThisMonth,
      usedToday: quotaBefore!.usedToday,
      updatedAt: quotaBefore!.updatedAt,
    });
  });

  it('returns false for a missing subscription', async () => {
    await expect(
      transitionToExtendedTrialV2(createIntegrationDb(), generateUUIDv7(), 275),
    ).resolves.toBe(false);
  });

  it('expires a trial subscription without changing its quota pool', async () => {
    const graph = await seedGraph();
    const quotaBefore = await loadQuotaPool(graph.subscriptionId);

    await expireTrialSubscriptionV2(
      createIntegrationDb(),
      graph.subscriptionId,
    );

    await expect(loadSubscription(graph.subscriptionId)).resolves.toMatchObject(
      {
        status: 'expired',
        planTier: 'free',
      },
    );
    await expect(loadQuotaPool(graph.subscriptionId)).resolves.toMatchObject({
      monthlyLimit: quotaBefore!.monthlyLimit,
      dailyLimit: quotaBefore!.dailyLimit,
      usedThisMonth: quotaBefore!.usedThisMonth,
      usedToday: quotaBefore!.usedToday,
    });
  });

  it('atomically expires a trial and resets every downgraded quota field', async () => {
    const free = getTierConfig('free');
    const graph = await seedGraph({
      monthlyLimit: free.monthlyQuota,
      dailyLimit: 99,
      usedThisMonth: 23,
      usedToday: 7,
    });

    await expireTrialAndDowngradeQuotaV2(
      createIntegrationDb(),
      graph.subscriptionId,
      free.monthlyQuota,
      free.dailyLimit,
    );

    await expect(loadSubscription(graph.subscriptionId)).resolves.toMatchObject(
      {
        status: 'expired',
        planTier: 'free',
      },
    );
    await expect(loadQuotaPool(graph.subscriptionId)).resolves.toMatchObject({
      monthlyLimit: free.monthlyQuota,
      dailyLimit: free.dailyLimit,
      usedThisMonth: 0,
      usedToday: 0,
    });
  });

  it('applies a first RevenueCat event to the subscription and quota atomically', async () => {
    const free = getTierConfig('free');
    const graph = await seedGraph();

    await expect(
      transitionToExtendedTrialFromRevenuecatEventV2(
        createIntegrationDb(),
        graph.subscriptionId,
        325,
        'event-first',
        2_000,
      ),
    ).resolves.toMatchObject({
      id: graph.subscriptionId,
      status: 'expired',
      tier: 'free',
      lastRevenuecatEventId: 'event-first',
      lastRevenuecatEventTimestampMs: '2000',
      webhookApplied: true,
    });

    await expect(loadQuotaPool(graph.subscriptionId)).resolves.toMatchObject({
      monthlyLimit: 325,
      dailyLimit: free.dailyLimit,
      usedThisMonth: 0,
      usedToday: 0,
    });
  });

  it('does not reapply a duplicate RevenueCat event', async () => {
    const graph = await seedGraph({
      lastRevenuecatEventId: 'event-current',
      lastRevenuecatEventTimestampMs: '2000',
    });
    const quotaBefore = await loadQuotaPool(graph.subscriptionId);

    await expect(
      transitionToExtendedTrialFromRevenuecatEventV2(
        createIntegrationDb(),
        graph.subscriptionId,
        325,
        'event-current',
        2_100,
      ),
    ).resolves.toMatchObject({
      id: graph.subscriptionId,
      status: 'trial',
      tier: 'plus',
      lastRevenuecatEventId: 'event-current',
      lastRevenuecatEventTimestampMs: '2000',
      webhookApplied: false,
    });
    await expect(loadQuotaPool(graph.subscriptionId)).resolves.toMatchObject({
      monthlyLimit: quotaBefore!.monthlyLimit,
      usedThisMonth: quotaBefore!.usedThisMonth,
      dailyLimit: quotaBefore!.dailyLimit,
      usedToday: quotaBefore!.usedToday,
    });
  });

  it('does not apply an older RevenueCat event', async () => {
    const graph = await seedGraph({
      lastRevenuecatEventId: 'event-current',
      lastRevenuecatEventTimestampMs: '2000',
    });

    await expect(
      transitionToExtendedTrialFromRevenuecatEventV2(
        createIntegrationDb(),
        graph.subscriptionId,
        325,
        'event-older',
        1_999,
      ),
    ).resolves.toMatchObject({
      id: graph.subscriptionId,
      status: 'trial',
      tier: 'plus',
      lastRevenuecatEventId: 'event-current',
      lastRevenuecatEventTimestampMs: '2000',
      webhookApplied: false,
    });
  });

  it('rolls back a RevenueCat transition when the quota pool is missing', async () => {
    const graph = await seedGraph({ withQuotaPool: false });

    await expect(
      transitionToExtendedTrialFromRevenuecatEventV2(
        createIntegrationDb(),
        graph.subscriptionId,
        325,
        'event-no-pool',
        2_000,
      ),
    ).rejects.toThrow('Missing quota pool');

    await expect(loadSubscription(graph.subscriptionId)).resolves.toMatchObject(
      {
        status: 'trial',
        planTier: 'plus',
        lastRevenuecatEventId: null,
        lastRevenuecatEventTimestampMs: null,
      },
    );
  });

  it('downgrades quota only while the subscription is still expired and free', async () => {
    const free = getTierConfig('free');
    const eligible = await seedGraph({ status: 'expired', planTier: 'free' });
    const ineligible = await seedGraph({ status: 'active', planTier: 'plus' });
    const ineligibleBefore = await loadQuotaPool(ineligible.subscriptionId);

    await expect(
      downgradeExtendedTrialQuotaIfStillExpiredV2(
        createIntegrationDb(),
        eligible.subscriptionId,
        free.monthlyQuota,
        free.dailyLimit,
      ),
    ).resolves.toBe(true);
    await expect(loadQuotaPool(eligible.subscriptionId)).resolves.toMatchObject(
      {
        monthlyLimit: free.monthlyQuota,
        dailyLimit: free.dailyLimit,
        usedThisMonth: 0,
        usedToday: 0,
      },
    );

    await expect(
      downgradeExtendedTrialQuotaIfStillExpiredV2(
        createIntegrationDb(),
        ineligible.subscriptionId,
        free.monthlyQuota,
        free.dailyLimit,
      ),
    ).resolves.toBe(false);
    await expect(
      loadQuotaPool(ineligible.subscriptionId),
    ).resolves.toMatchObject({
      monthlyLimit: ineligibleBefore!.monthlyLimit,
      dailyLimit: ineligibleBefore!.dailyLimit,
      usedThisMonth: ineligibleBefore!.usedThisMonth,
      usedToday: ineligibleBefore!.usedToday,
    });
  });

  it('resets due subscription and profile quota cycles with tier-aware limits', async () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const plus = getTierConfig('plus');
    const due = await seedGraph({
      status: 'active',
      planTier: 'plus',
      monthlyLimit: 1,
      dailyLimit: 1,
      usedThisMonth: 12,
      usedToday: 4,
      cycleResetAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    const future = await seedGraph({
      status: 'active',
      planTier: 'free',
      monthlyLimit: 444,
      dailyLimit: 44,
      usedThisMonth: 9,
      usedToday: 2,
      cycleResetAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    await createIntegrationDb()
      .insert(profileQuotaUsage)
      .values({
        subscriptionId: due.subscriptionId,
        profileId: due.personId,
        role: 'owner',
        monthlyLimit: plus.ownerMonthlyQuota,
        dailyLimit: plus.dailyLimit,
        usedThisMonth: 8,
        usedToday: 2,
        cycleResetAt: new Date('2026-07-01T00:00:00.000Z'),
      });

    const rollbackSentinel = 'WI-1371 reset rollback';
    await expect(
      createIntegrationDb().transaction(async (tx) => {
        const affected = await resetExpiredQuotaCyclesV2(
          tx as unknown as Database,
          now,
        );
        expect(affected).toBeGreaterThanOrEqual(2);

        const dueQuota = await tx.query.quotaPools.findFirst({
          where: eq(quotaPools.subscriptionId, due.subscriptionId),
        });
        expect(dueQuota).toMatchObject({
          monthlyLimit: plus.monthlyQuota,
          dailyLimit: plus.dailyLimit,
          usedThisMonth: 0,
          usedToday: 0,
          cycleResetAt: new Date('2026-08-01T00:00:00.000Z'),
        });
        const dueProfileQuota = await tx.query.profileQuotaUsage.findFirst({
          where: eq(profileQuotaUsage.subscriptionId, due.subscriptionId),
        });
        expect(dueProfileQuota).toMatchObject({
          usedThisMonth: 0,
          usedToday: 0,
          cycleResetAt: new Date('2026-08-01T00:00:00.000Z'),
        });

        const futureQuota = await tx.query.quotaPools.findFirst({
          where: eq(quotaPools.subscriptionId, future.subscriptionId),
        });
        expect(futureQuota).toMatchObject({
          monthlyLimit: 444,
          dailyLimit: 44,
          usedThisMonth: 9,
          usedToday: 2,
          cycleResetAt: new Date('2026-08-01T00:00:00.000Z'),
        });

        throw new Error(rollbackSentinel);
      }),
    ).rejects.toThrow(rollbackSentinel);

    await expect(loadQuotaPool(due.subscriptionId)).resolves.toMatchObject({
      monthlyLimit: 1,
      dailyLimit: 1,
      usedThisMonth: 12,
      usedToday: 4,
      cycleResetAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    await expect(loadProfileQuota(due.subscriptionId)).resolves.toMatchObject({
      usedThisMonth: 8,
      usedToday: 2,
      cycleResetAt: new Date('2026-07-01T00:00:00.000Z'),
    });
  });
});
