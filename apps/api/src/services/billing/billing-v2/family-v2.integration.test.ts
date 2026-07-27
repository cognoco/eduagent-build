import { resolve } from 'path';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  createDatabase,
  guardianship,
  membership,
  organization,
  person,
  quotaPools,
  subscription as subscriptionTable,
  topUpCredits,
  usageEvents,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { getTierConfig } from '../../subscription';
import { decrementQuota } from '../metering';
import { getEffectiveAccessForSubscriptionV2 } from './access-v2';
import {
  addProfileToSubscriptionV2,
  getFamilyPoolStatusV2,
  getProfileCountForSubscriptionV2,
  listFamilyMembersV2,
  ProfileRemovalNotImplementedErrorV2,
  removeProfileFromSubscriptionV2,
  StaleFamilyAccessSnapshotErrorV2,
} from './family-v2';

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

const PREFIX = 'integration-family-v2';
const ORG_NAMES = Array.from({ length: 8 }, (_, i) => `${PREFIX}-${i}`);

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
  isOwner?: boolean;
  archivedAt?: Date | null;
}) {
  const db = createIntegrationDb();
  const isOwner = input.isOwner ?? false;
  const [row] = await db
    .insert(person)
    .values({
      displayName: input.displayName,
      birthDate: isOwner ? '1985-01-01' : '2015-01-01',
      residenceJurisdiction: 'EU',
      archivedAt: input.archivedAt ?? null,
    })
    .returning();
  await db.insert(membership).values({
    organizationId: input.organizationId,
    personId: row!.id,
    roles: isOwner ? ['admin', 'learner'] : ['learner'],
  });

  return row!;
}

async function seedSubscription(input: {
  organizationId: string;
  payerPersonId: string;
  tier: 'free' | 'plus' | 'family' | 'pro';
  usedThisMonth?: number;
  persistedMonthlyLimit?: number;
  periodStartAt?: Date | null;
  periodEndAt?: Date;
  cycleResetAt?: Date;
  seedCounterEvents?: boolean;
}) {
  const db = createIntegrationDb();
  const config = getTierConfig(input.tier);
  const [sub] = await db
    .insert(subscriptionTable)
    .values({
      organizationId: input.organizationId,
      payerPersonId: input.payerPersonId,
      planTier: input.tier,
      status: 'active',
      periodStartAt:
        input.periodStartAt === undefined
          ? new Date('2026-06-01T00:00:00.000Z')
          : input.periodStartAt,
      periodEndAt: input.periodEndAt ?? new Date('2026-07-01T00:00:00.000Z'),
    })
    .returning();
  await db.insert(quotaPools).values({
    subscriptionId: sub!.id,
    monthlyLimit: input.persistedMonthlyLimit ?? config.monthlyQuota,
    usedThisMonth: input.usedThisMonth ?? 0,
    dailyLimit: config.dailyLimit,
    usedToday: 0,
    cycleResetAt: input.cycleResetAt ?? new Date('2026-07-01T00:00:00.000Z'),
  });
  if (
    (input.seedCounterEvents ?? true) &&
    input.usedThisMonth != null &&
    input.usedThisMonth > 0
  ) {
    await db.insert(usageEvents).values(
      Array.from({ length: input.usedThisMonth }, () => ({
        subscriptionId: sub!.id,
        profileId: input.payerPersonId,
        occurredAt: new Date('2026-06-10T12:00:00.000Z'),
        delta: 1,
      })),
    );
  }
  return sub!;
}

async function requireEffectiveAccess(db: Database, subscriptionId: string) {
  const access = await getEffectiveAccessForSubscriptionV2(db, subscriptionId);
  expect(access).not.toBeNull();
  return access!;
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

  if (personIds.length > 0) {
    await db
      .delete(guardianship)
      .where(inArray(guardianship.guardianPersonId, personIds));
    await db
      .delete(guardianship)
      .where(inArray(guardianship.chargePersonId, personIds));
  }
  await db
    .delete(subscriptionTable)
    .where(inArray(subscriptionTable.organizationId, orgIds));
  await db.delete(membership).where(inArray(membership.organizationId, orgIds));
  if (personIds.length > 0) {
    await db.delete(person).where(inArray(person.id, personIds));
  }
  await db.delete(organization).where(inArray(organization.id, orgIds));
}

describe('family-v2 billing service (integration)', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it.each(['family', 'pro'] as const)(
    'lists active members, reports pool status, and validates an existing same-org profile on %s',
    async (tier) => {
      const db = createIntegrationDb();
      const org = await seedOrganization(0);
      const owner = await seedPerson({
        organizationId: org.id,
        displayName: 'Owner',
        isOwner: true,
      });
      const child = await seedPerson({
        organizationId: org.id,
        displayName: 'Child',
      });
      const archived = await seedPerson({
        organizationId: org.id,
        displayName: 'Archived',
        archivedAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      const sub = await seedSubscription({
        organizationId: org.id,
        payerPersonId: owner.id,
        tier,
        usedThisMonth: 12,
      });

      await expect(listFamilyMembersV2(db, sub.id)).resolves.toEqual([
        { profileId: owner.id, displayName: 'Owner', isOwner: true },
        { profileId: child.id, displayName: 'Child', isOwner: false },
      ]);
      await expect(
        getFamilyPoolStatusV2(
          db,
          sub.id,
          await requireEffectiveAccess(db, sub.id),
        ),
      ).resolves.toMatchObject({
        tier,
        monthlyLimit: getTierConfig(tier).monthlyQuota,
        usedThisMonth: 12,
        remainingQuestions: getTierConfig(tier).monthlyQuota - 12,
        profileCount: 2,
        maxProfiles: getTierConfig(tier).maxProfiles,
      });
      await expect(
        addProfileToSubscriptionV2(db, sub.id, child.id),
      ).resolves.toEqual({ profileCount: 2 });
      expect(
        (await listFamilyMembersV2(db, sub.id)).map((m) => m.profileId),
      ).not.toContain(archived.id);
    },
  );

  it.each(['free', 'plus'] as const)(
    'rejects add-profile validation for %s subscriptions',
    async (tier) => {
      const org = await seedOrganization(1);
      const owner = await seedPerson({
        organizationId: org.id,
        displayName: 'Owner',
        isOwner: true,
      });
      const child = await seedPerson({
        organizationId: org.id,
        displayName: 'Child',
      });
      const sub = await seedSubscription({
        organizationId: org.id,
        payerPersonId: owner.id,
        tier,
      });

      await expect(
        addProfileToSubscriptionV2(createIntegrationDb(), sub.id, child.id),
      ).resolves.toBeNull();
    },
  );

  it('repairs a stale Plus-era denominator and assembles one Family cycle from member events', async () => {
    const db = createIntegrationDb();
    const org = await seedOrganization(7);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const child = await seedPerson({
      organizationId: org.id,
      displayName: 'Child',
    });
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'family',
      persistedMonthlyLimit: 700,
      usedThisMonth: 7,
      seedCounterEvents: false,
    });
    await db.insert(usageEvents).values([
      ...Array.from({ length: 9 }, () => ({
        subscriptionId: sub.id,
        profileId: owner.id,
        occurredAt: new Date('2026-06-10T12:00:00.000Z'),
        delta: 1,
      })),
      ...Array.from({ length: 5 }, () => ({
        subscriptionId: sub.id,
        profileId: child.id,
        occurredAt: new Date('2026-06-11T12:00:00.000Z'),
        delta: 1,
      })),
      // Previous-cycle usage must not leak into this Family denominator.
      {
        subscriptionId: sub.id,
        profileId: owner.id,
        occurredAt: new Date('2026-05-20T12:00:00.000Z'),
        delta: 1,
      },
    ]);

    const status = await getFamilyPoolStatusV2(
      db,
      sub.id,
      await requireEffectiveAccess(db, sub.id),
    );

    expect(status).toMatchObject({
      tier: 'family',
      monthlyLimit: 1500,
      usedThisMonth: 14,
      remainingQuestions: 1486,
      profileCount: 2,
      memberUsage: [
        expect.objectContaining({ profileId: owner.id, used: 9 }),
        expect.objectContaining({ profileId: child.id, used: 5 }),
      ],
    });
    expect(status?.memberUsage.reduce((sum, row) => sum + row.used, 0)).toBe(
      status?.usedThisMonth,
    );

    const repairedPool = await db.query.quotaPools.findFirst({
      where: eq(quotaPools.subscriptionId, sub.id),
    });
    expect(repairedPool).toMatchObject({
      monthlyLimit: 1500,
      usedThisMonth: 14,
    });

    const decrement = await decrementQuota(db, sub.id, owner.id);
    expect(decrement).toMatchObject({
      success: true,
      source: 'monthly',
      remainingMonthly: 1485,
      quotaModel: 'shared-pool',
    });
    await expect(
      db.query.quotaPools.findFirst({
        where: eq(quotaPools.subscriptionId, sub.id),
      }),
    ).resolves.toMatchObject({ monthlyLimit: 1500, usedThisMonth: 15 });
  });

  it('uses the monthly pool reset boundary inside a non-null annual subscription period', async () => {
    const db = createIntegrationDb();
    const org = await seedOrganization(7);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Annual Family owner',
      isOwner: true,
    });
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'family',
      usedThisMonth: 5,
      seedCounterEvents: false,
      periodStartAt: new Date('2026-01-01T00:00:00.000Z'),
      periodEndAt: new Date('2027-01-01T00:00:00.000Z'),
      cycleResetAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    await db.insert(usageEvents).values([
      ...Array.from({ length: 3 }, () => ({
        subscriptionId: sub.id,
        profileId: owner.id,
        occurredAt: new Date('2026-06-30T23:59:59.999Z'),
        delta: 1,
      })),
      ...Array.from({ length: 5 }, () => ({
        subscriptionId: sub.id,
        profileId: owner.id,
        occurredAt: new Date('2026-07-15T12:00:00.000Z'),
        delta: 1,
      })),
    ]);

    await expect(
      getFamilyPoolStatusV2(
        db,
        sub.id,
        await requireEffectiveAccess(db, sub.id),
      ),
    ).resolves.toMatchObject({
      cycleStartAt: '2026-07-01T00:00:00.000Z',
      usedThisMonth: 5,
      remainingQuestions: 1495,
      inactiveMemberUsedThisMonth: 0,
      memberUsage: [expect.objectContaining({ profileId: owner.id, used: 5 })],
    });
  });

  it('displays exhausted-monthly plus top-up consumption without inflating monthly enforcement', async () => {
    const db = createIntegrationDb();
    const org = await seedOrganization(3);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Top-up owner',
      isOwner: true,
    });
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'family',
      usedThisMonth: 1500,
      seedCounterEvents: false,
    });
    await db.insert(usageEvents).values(
      Array.from({ length: 1500 }, () => ({
        subscriptionId: sub.id,
        profileId: owner.id,
        occurredAt: new Date('2026-06-10T12:00:00.000Z'),
        delta: 1,
      })),
    );
    await db.insert(topUpCredits).values({
      subscriptionId: sub.id,
      profileId: owner.id,
      amount: 2,
      remaining: 2,
      purchasedAt: new Date('2026-06-15T00:00:00.000Z'),
      expiresAt: new Date('2027-06-15T00:00:00.000Z'),
    });

    await expect(decrementQuota(db, sub.id, owner.id)).resolves.toMatchObject({
      success: true,
      source: 'top_up',
      remainingMonthly: 0,
      remainingTopUp: 1,
    });
    // Force the status read through its repair branch, as happens when a plan
    // transition leaves a stale denominator after top-up consumption.
    await db
      .update(quotaPools)
      .set({ monthlyLimit: 700 })
      .where(eq(quotaPools.subscriptionId, sub.id));
    await expect(
      getFamilyPoolStatusV2(
        db,
        sub.id,
        await requireEffectiveAccess(db, sub.id),
      ),
    ).resolves.toMatchObject({
      monthlyLimit: 1500,
      usedThisMonth: 1501,
      remainingQuestions: 0,
      inactiveMemberUsedThisMonth: 0,
      memberUsage: [
        expect.objectContaining({ profileId: owner.id, used: 1501 }),
      ],
    });
    await expect(
      db.query.quotaPools.findFirst({
        where: eq(quotaPools.subscriptionId, sub.id),
      }),
    ).resolves.toMatchObject({ monthlyLimit: 1500, usedThisMonth: 1500 });
  });

  it('retains removed-member consumption while separating it from active member rows', async () => {
    const db = createIntegrationDb();
    const org = await seedOrganization(3);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const child = await seedPerson({
      organizationId: org.id,
      displayName: 'Removed child',
    });
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'family',
      usedThisMonth: 5,
      seedCounterEvents: false,
    });
    await db.insert(usageEvents).values(
      Array.from({ length: 5 }, () => ({
        subscriptionId: sub.id,
        profileId: child.id,
        occurredAt: new Date('2026-06-10T12:00:00.000Z'),
        delta: 1,
      })),
    );

    await expect(
      removeProfileFromSubscriptionV2(db, sub.id, child.id),
    ).resolves.toEqual({ removedProfileId: child.id });
    const access = await requireEffectiveAccess(db, sub.id);
    await expect(
      getFamilyPoolStatusV2(db, sub.id, access),
    ).resolves.toMatchObject({
      usedThisMonth: 5,
      remainingQuestions: 1495,
      inactiveMemberUsedThisMonth: 5,
      profileCount: 1,
      memberUsage: [expect.objectContaining({ profileId: owner.id, used: 0 })],
    });
    await expect(
      db.query.quotaPools.findFirst({
        where: eq(quotaPools.subscriptionId, sub.id),
      }),
    ).resolves.toMatchObject({ usedThisMonth: 5 });

    await expect(decrementQuota(db, sub.id, owner.id)).resolves.toMatchObject({
      success: true,
      source: 'monthly',
      remainingMonthly: 1494,
    });
    await expect(
      getFamilyPoolStatusV2(
        db,
        sub.id,
        await requireEffectiveAccess(db, sub.id),
      ),
    ).resolves.toMatchObject({
      usedThisMonth: 6,
      inactiveMemberUsedThisMonth: 5,
      memberUsage: [expect.objectContaining({ profileId: owner.id, used: 1 })],
    });
    await expect(
      db.query.quotaPools.findFirst({
        where: eq(quotaPools.subscriptionId, sub.id),
      }),
    ).resolves.toMatchObject({ usedThisMonth: 6 });
  });

  it('rejects stale Family access without rewriting a transitioned Plus pool, then accepts a fresh Family snapshot', async () => {
    const db = createIntegrationDb();
    const familyOrg = await seedOrganization(5);
    const familyOwner = await seedPerson({
      organizationId: familyOrg.id,
      displayName: 'Family owner',
      isOwner: true,
    });
    const familySub = await seedSubscription({
      organizationId: familyOrg.id,
      payerPersonId: familyOwner.id,
      tier: 'family',
      usedThisMonth: 3,
    });
    const familySnapshot = await requireEffectiveAccess(db, familySub.id);
    await db
      .update(subscriptionTable)
      .set({ planTier: 'plus' })
      .where(eq(subscriptionTable.id, familySub.id));
    await db
      .update(quotaPools)
      .set({ monthlyLimit: 700, usedThisMonth: 3 })
      .where(eq(quotaPools.subscriptionId, familySub.id));

    await expect(
      getFamilyPoolStatusV2(db, familySub.id, familySnapshot),
    ).rejects.toBeInstanceOf(StaleFamilyAccessSnapshotErrorV2);
    await expect(
      db.query.quotaPools.findFirst({
        where: eq(quotaPools.subscriptionId, familySub.id),
      }),
    ).resolves.toMatchObject({ monthlyLimit: 700, usedThisMonth: 3 });
    await expect(
      getFamilyPoolStatusV2(
        db,
        familySub.id,
        await requireEffectiveAccess(db, familySub.id),
      ),
    ).resolves.toBeNull();

    const plusOrg = await seedOrganization(6);
    const plusOwner = await seedPerson({
      organizationId: plusOrg.id,
      displayName: 'Plus owner',
      isOwner: true,
    });
    const plusSub = await seedSubscription({
      organizationId: plusOrg.id,
      payerPersonId: plusOwner.id,
      tier: 'plus',
      persistedMonthlyLimit: 700,
      usedThisMonth: 2,
    });
    const plusSnapshot = await requireEffectiveAccess(db, plusSub.id);
    await db
      .update(subscriptionTable)
      .set({ planTier: 'family' })
      .where(eq(subscriptionTable.id, plusSub.id));

    await expect(
      getFamilyPoolStatusV2(db, plusSub.id, plusSnapshot),
    ).resolves.toBeNull();
    await expect(
      db.query.quotaPools.findFirst({
        where: eq(quotaPools.subscriptionId, plusSub.id),
      }),
    ).resolves.toMatchObject({ monthlyLimit: 700, usedThisMonth: 2 });

    await expect(
      getFamilyPoolStatusV2(
        db,
        plusSub.id,
        await requireEffectiveAccess(db, plusSub.id),
      ),
    ).resolves.toMatchObject({ tier: 'family', monthlyLimit: 1500 });
  });

  it('does not reverse-clamp a January 31 cycle after its February reset', async () => {
    const db = createIntegrationDb();
    const org = await seedOrganization(4);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Month-end owner',
      isOwner: true,
    });
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'family',
      periodStartAt: new Date('2026-01-31T12:34:56.000Z'),
      periodEndAt: new Date('2027-01-31T12:34:56.000Z'),
      cycleResetAt: new Date('2026-02-28T12:34:56.000Z'),
      seedCounterEvents: false,
    });
    await db.insert(usageEvents).values([
      {
        subscriptionId: sub.id,
        profileId: owner.id,
        occurredAt: new Date('2026-01-30T12:34:56.000Z'),
        delta: 1,
      },
      {
        subscriptionId: sub.id,
        profileId: owner.id,
        occurredAt: new Date('2026-01-31T12:34:56.000Z'),
        delta: 1,
      },
    ]);

    await expect(
      getFamilyPoolStatusV2(
        db,
        sub.id,
        await requireEffectiveAccess(db, sub.id),
      ),
    ).resolves.toMatchObject({
      cycleStartAt: '2026-01-31T12:34:56.000Z',
      cycleResetAt: '2026-02-28T12:34:56.000Z',
      usedThisMonth: 1,
    });
  });

  it('replays clamped monthly boundaries inside an annual subscription period', async () => {
    const db = createIntegrationDb();
    const org = await seedOrganization(4);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Annual month-end owner',
      isOwner: true,
    });
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'family',
      periodStartAt: new Date('2026-01-31T12:34:56.000Z'),
      periodEndAt: new Date('2027-01-31T12:34:56.000Z'),
      cycleResetAt: new Date('2026-03-28T12:34:56.000Z'),
      seedCounterEvents: false,
    });
    await db.insert(usageEvents).values([
      {
        subscriptionId: sub.id,
        profileId: owner.id,
        occurredAt: new Date('2026-02-27T12:34:56.000Z'),
        delta: 1,
      },
      {
        subscriptionId: sub.id,
        profileId: owner.id,
        occurredAt: new Date('2026-02-28T12:34:56.000Z'),
        delta: 1,
      },
    ]);

    await expect(
      getFamilyPoolStatusV2(
        db,
        sub.id,
        await requireEffectiveAccess(db, sub.id),
      ),
    ).resolves.toMatchObject({
      cycleStartAt: '2026-02-28T12:34:56.000Z',
      cycleResetAt: '2026-03-28T12:34:56.000Z',
      usedThisMonth: 1,
    });
  });

  it('fails closed when the locked reset token has no authoritative anchor', async () => {
    const db = createIntegrationDb();
    const org = await seedOrganization(4);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Unanchored owner',
      isOwner: true,
    });
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'family',
      usedThisMonth: 9,
      periodStartAt: null,
      cycleResetAt: new Date('2026-03-31T12:34:56.000Z'),
      seedCounterEvents: false,
    });

    await expect(
      getFamilyPoolStatusV2(
        db,
        sub.id,
        await requireEffectiveAccess(db, sub.id),
      ),
    ).resolves.toBeNull();
    await expect(
      db.query.quotaPools.findFirst({
        where: eq(quotaPools.subscriptionId, sub.id),
      }),
    ).resolves.toMatchObject({ usedThisMonth: 9 });
  });

  it('rejects over-cap and cross-org add-profile validation', async () => {
    const db = createIntegrationDb();
    const org = await seedOrganization(2);
    const otherOrg = await seedOrganization(3);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Owner',
      isOwner: true,
    });
    for (const displayName of ['Child 1', 'Child 2', 'Child 3']) {
      await seedPerson({ organizationId: org.id, displayName });
    }
    const overCapCandidate = await seedPerson({
      organizationId: org.id,
      displayName: 'Over Cap Candidate',
      archivedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const crossOrgChild = await seedPerson({
      organizationId: otherOrg.id,
      displayName: 'Cross Org Child',
    });
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'family',
    });

    await expect(getProfileCountForSubscriptionV2(db, sub.id)).resolves.toBe(4);
    await expect(
      addProfileToSubscriptionV2(db, sub.id, overCapCandidate.id),
    ).resolves.toBeNull();
    await expect(
      addProfileToSubscriptionV2(db, sub.id, crossOrgChild.id),
    ).resolves.toBeNull();
  });

  it('removes a non-owner by archiving the person and revoking guardianship edges', async () => {
    const db = createIntegrationDb();
    const org = await seedOrganization(4);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const child = await seedPerson({
      organizationId: org.id,
      displayName: 'Child',
    });
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'family',
    });
    await db.insert(guardianship).values({
      guardianPersonId: owner.id,
      chargePersonId: child.id,
    });

    await expect(
      removeProfileFromSubscriptionV2(db, sub.id, child.id),
    ).resolves.toEqual({ removedProfileId: child.id });

    const archived = await db.query.person.findFirst({
      where: eq(person.id, child.id),
    });
    expect(archived?.archivedAt).toBeInstanceOf(Date);
    const activeEdges = await db.query.guardianship.findMany({
      where: and(
        eq(guardianship.guardianPersonId, owner.id),
        eq(guardianship.chargePersonId, child.id),
        isNull(guardianship.revokedAt),
      ),
    });
    expect(activeEdges).toHaveLength(0);
    await expect(listFamilyMembersV2(db, sub.id)).resolves.toEqual([
      { profileId: owner.id, displayName: 'Owner', isOwner: true },
    ]);
    await expect(getProfileCountForSubscriptionV2(db, sub.id)).resolves.toBe(1);
  });

  it('rejects owner, cross-org, and cross-account removal', async () => {
    const db = createIntegrationDb();
    const org = await seedOrganization(5);
    const otherOrg = await seedOrganization(6);
    const owner = await seedPerson({
      organizationId: org.id,
      displayName: 'Owner',
      isOwner: true,
    });
    const child = await seedPerson({
      organizationId: org.id,
      displayName: 'Child',
    });
    const crossOrgChild = await seedPerson({
      organizationId: otherOrg.id,
      displayName: 'Cross Org Child',
    });
    const sub = await seedSubscription({
      organizationId: org.id,
      payerPersonId: owner.id,
      tier: 'family',
    });

    await expect(
      removeProfileFromSubscriptionV2(db, sub.id, owner.id),
    ).resolves.toBeNull();
    await expect(
      removeProfileFromSubscriptionV2(db, sub.id, crossOrgChild.id),
    ).resolves.toBeNull();
    await expect(
      removeProfileFromSubscriptionV2(db, sub.id, child.id, otherOrg.id),
    ).rejects.toBeInstanceOf(ProfileRemovalNotImplementedErrorV2);

    const ownerRow = await db.query.person.findFirst({
      where: eq(person.id, owner.id),
    });
    const childRow = await db.query.person.findFirst({
      where: eq(person.id, child.id),
    });
    expect(ownerRow?.archivedAt).toBeNull();
    expect(childRow?.archivedAt).toBeNull();
  });
});
