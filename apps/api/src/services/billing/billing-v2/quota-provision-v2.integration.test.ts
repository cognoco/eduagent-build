import { resolve } from 'path';

import { and, eq, inArray } from 'drizzle-orm';
import {
  createDatabase,
  membership,
  organization,
  person,
  profileQuotaUsage,
  subscription as subscriptionTable,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { getTierConfig } from '../../subscription';
import { inngest } from '../../../inngest/client';
import {
  getOrProvisionProfileQuotaUsageV2,
  resolveProfileQuotaRoleV2,
} from './quota-provision-v2';

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

const PREFIX = 'integration-quota-provision-v2';
const ORG_NAMES = Array.from({ length: 5 }, (_, i) => `${PREFIX}-${i}`);

async function seedOrganization(index: number) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(organization)
    .values({ name: ORG_NAMES[index]! })
    .returning();

  return row!;
}

async function seedPerson(input: {
  organizationId: string;
  displayName: string;
  isOwner: boolean;
  archivedAt?: Date | null;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(person)
    .values({
      displayName: input.displayName,
      birthDate: input.isOwner ? '1990-01-01' : '2016-01-01',
      residenceJurisdiction: 'EU',
      archivedAt: input.archivedAt ?? null,
    })
    .returning();

  await db.insert(membership).values({
    personId: row!.id,
    organizationId: input.organizationId,
    roles: input.isOwner ? ['admin', 'learner'] : ['learner'],
  });

  return row!;
}

async function seedSubscription(input: {
  organizationId: string;
  payerPersonId: string;
  tier?: 'free' | 'plus' | 'family' | 'pro';
  status?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
}) {
  const db = createIntegrationDb();
  const tier = input.tier ?? 'plus';
  const status = input.status ?? 'active';
  const [row] = await db
    .insert(subscriptionTable)
    .values({
      organizationId: input.organizationId,
      payerPersonId: input.payerPersonId,
      planTier: tier,
      status,
      periodStartAt: new Date('2026-06-01T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    .returning();

  return row!;
}

async function seedProfileQuota(input: {
  subscriptionId: string;
  profileId: string;
  role: 'owner' | 'child';
  monthlyLimit: number;
  dailyLimit: number | null;
  usedThisMonth?: number;
  usedToday?: number;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(profileQuotaUsage)
    .values({
      subscriptionId: input.subscriptionId,
      profileId: input.profileId,
      role: input.role,
      monthlyLimit: input.monthlyLimit,
      dailyLimit: input.dailyLimit,
      usedThisMonth: input.usedThisMonth ?? 0,
      usedToday: input.usedToday ?? 0,
      cycleResetAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    .returning();
  return row!;
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

async function cleanup() {
  const db = createIntegrationDb();
  const orgs = await db.query.organization.findMany({
    where: inArray(organization.name, ORG_NAMES),
  });
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return;

  const memberships = await db
    .select({ personId: membership.personId })
    .from(membership)
    .where(inArray(membership.organizationId, orgIds));
  const personIds = [...new Set(memberships.map((m) => m.personId))];

  await db
    .delete(subscriptionTable)
    .where(inArray(subscriptionTable.organizationId, orgIds));
  await db.delete(membership).where(inArray(membership.organizationId, orgIds));
  if (personIds.length > 0) {
    await db.delete(person).where(inArray(person.id, personIds));
  }
  await db.delete(organization).where(inArray(organization.id, orgIds));
}

describe('quota-provision-v2 (integration)', () => {
  beforeEach(async () => {
    await cleanup();
    jest.spyOn(inngest, 'send').mockResolvedValue({ ids: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(cleanup);

  it('resolves owner and child roles from membership roles, not legacy profile flags', async () => {
    const org = await seedOrganization(0);
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
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'plus',
    });

    await expect(
      resolveProfileQuotaRoleV2(createIntegrationDb(), sub.id, owner.id),
    ).resolves.toBe('owner');
    await expect(
      resolveProfileQuotaRoleV2(createIntegrationDb(), sub.id, child.id),
    ).resolves.toBe('child');
  });

  it('provisions absent owner and child quota rows with tier-specific limits', async () => {
    const plus = getTierConfig('plus');
    const org = await seedOrganization(1);
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
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'plus',
    });

    const ownerQuota = await getOrProvisionProfileQuotaUsageV2(
      createIntegrationDb(),
      sub.id,
      owner.id,
      { tier: 'plus', now: new Date('2026-06-01T00:00:00.000Z') },
    );
    const childQuota = await getOrProvisionProfileQuotaUsageV2(
      createIntegrationDb(),
      sub.id,
      child.id,
      { tier: 'plus', now: new Date('2026-06-01T00:00:00.000Z') },
    );

    expect(ownerQuota).toMatchObject({
      role: 'owner',
      monthlyLimit: plus.ownerMonthlyQuota,
      dailyLimit: plus.ownerDailyQuota,
      usedThisMonth: 0,
      usedToday: 0,
    });
    expect(childQuota).toMatchObject({
      role: 'child',
      monthlyLimit: plus.childMonthlyQuota,
      dailyLimit: plus.childDailyQuota,
      usedThisMonth: 0,
      usedToday: 0,
    });
    expect(await loadProfileQuota(sub.id, owner.id)).toBeTruthy();
    expect(await loadProfileQuota(sub.id, child.id)).toBeTruthy();
    expect(inngest.send).toHaveBeenCalledWith({
      name: 'app/billing.profile_quota.lazy_provisioned',
      data: expect.objectContaining({
        subscriptionId: sub.id,
        profileId: owner.id,
        role: 'owner',
        tier: 'plus',
      }),
    });
  });

  it('updates stale per-profile limits without resetting existing usage', async () => {
    const plus = getTierConfig('plus');
    const free = getTierConfig('free');
    const org = await seedOrganization(2);
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
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'plus',
    });
    await seedProfileQuota({
      subscriptionId: sub.id,
      profileId: child.id,
      role: 'child',
      monthlyLimit: free.childMonthlyQuota!,
      dailyLimit: free.childDailyQuota,
      usedThisMonth: 7,
      usedToday: 2,
    });

    const quota = await getOrProvisionProfileQuotaUsageV2(
      createIntegrationDb(),
      sub.id,
      child.id,
      { tier: 'plus', now: new Date('2026-06-15T00:00:00.000Z') },
    );

    expect(quota).toMatchObject({
      role: 'child',
      monthlyLimit: plus.childMonthlyQuota,
      dailyLimit: plus.childDailyQuota,
      usedThisMonth: 7,
      usedToday: 2,
    });
    const stored = await loadProfileQuota(sub.id, child.id);
    expect(stored).toMatchObject({
      monthlyLimit: plus.childMonthlyQuota,
      dailyLimit: plus.childDailyQuota,
      usedThisMonth: 7,
      usedToday: 2,
    });
  });

  it('does not provision missing, archived, or cross-org membership rows', async () => {
    const org = await seedOrganization(3);
    const otherOrg = await seedOrganization(4);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const crossOrgChild = await seedPerson({
      organizationId: otherOrg.id,
      displayName: 'Other Child',
      isOwner: false,
    });
    const archivedChild = await seedPerson({
      organizationId: org.id,
      displayName: 'Archived Child',
      isOwner: false,
      archivedAt: new Date('2026-06-10T00:00:00.000Z'),
    });
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'plus',
    });

    await expect(
      getOrProvisionProfileQuotaUsageV2(
        createIntegrationDb(),
        sub.id,
        '11111111-1111-4111-8111-111111111111',
        { tier: 'plus' },
      ),
    ).resolves.toBeNull();
    await expect(
      getOrProvisionProfileQuotaUsageV2(
        createIntegrationDb(),
        sub.id,
        crossOrgChild.id,
        { tier: 'plus' },
      ),
    ).resolves.toBeNull();
    await expect(
      getOrProvisionProfileQuotaUsageV2(
        createIntegrationDb(),
        sub.id,
        archivedChild.id,
        { tier: 'plus' },
      ),
    ).resolves.toBeNull();

    expect(await loadProfileQuota(sub.id, crossOrgChild.id)).toBeUndefined();
    expect(await loadProfileQuota(sub.id, archivedChild.id)).toBeUndefined();
  });
});
