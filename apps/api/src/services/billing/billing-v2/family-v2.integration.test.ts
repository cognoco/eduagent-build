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
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { getTierConfig } from '../../subscription';
import {
  addProfileToSubscriptionV2,
  getFamilyPoolStatusV2,
  getProfileCountForSubscriptionV2,
  listFamilyMembersV2,
  ProfileRemovalNotImplementedErrorV2,
  removeProfileFromSubscriptionV2,
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
      periodStartAt: new Date('2026-06-01T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    .returning();
  await db.insert(quotaPools).values({
    subscriptionId: sub!.id,
    monthlyLimit: config.monthlyQuota,
    usedThisMonth: input.usedThisMonth ?? 0,
    dailyLimit: config.dailyLimit,
    usedToday: 0,
    cycleResetAt: new Date('2026-07-01T00:00:00.000Z'),
  });
  return sub!;
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
      await expect(getFamilyPoolStatusV2(db, sub.id)).resolves.toMatchObject({
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
