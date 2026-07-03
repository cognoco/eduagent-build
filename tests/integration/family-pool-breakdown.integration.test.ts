/**
 * Integration: Family pool breakdown visibility (BUG-898 break test, C6)
 *
 * Verifies that getUsageBreakdownForProfileV2 enforces the correct visibility
 * rules against a real database. The C2 fix specifically prevents child
 * profiles from receiving full breakdown access when owner sharing is enabled.
 *
 * Test matrix:
 * 1. child viewer + sharing OFF  → byProfile: [], self-only data
 * 2. child viewer + sharing ON   → byProfile: [] (C2 fix), self-only data
 * 3. non-owner adult + sharing ON → full breakdown
 * 4. owner + child link          → full breakdown regardless of sharing flag
 *
 * [WI-1239 / 779-strip] Converted from getUsageBreakdownForProfile (legacy) to
 * its v2 twin — the legacy function was deleted (routes/billing.ts already
 * dispatched exclusively to -V2). getUsageBreakdownForProfileV2 resolves the
 * viewer/family-owner/family-edge state via the v2
 * (organization/person/membership/guardianship) store.
 *
 * [WI-1128] Previously this file also dual-seeded the legacy
 * accounts/profiles/subscriptions tables (pre-M-REPOINT, when usage_events /
 * quota_pools / family_preferences still FK'd them). Post-M-REPOINT those
 * tables FK the v2 person/subscription tables directly, and
 * getUsageBreakdownForProfileV2 reads only the v2 store — so the legacy seed
 * served no purpose for this suite specifically (unlike
 * family-usage-v2.integration.test.ts, which still exercises other
 * legacy-path tests in its package) and has been dropped. Seeding is v2-only
 * now.
 *
 * Mocked boundaries: none — all DB access is real.
 */

import { eq, inArray } from 'drizzle-orm';
import {
  familyPreferences,
  guardianship,
  membership,
  organization,
  person,
  quotaPools,
  subscription as subscriptionV2Table,
  usageEvents,
} from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import { getUsageBreakdownForProfileV2 } from '../../apps/api/src/services/billing/billing-v2/family-usage-v2';

// ---------------------------------------------------------------------------
// Test identity constants
// ---------------------------------------------------------------------------

const OWNER_CLERK_ID = 'integration-fpool-owner';
const OWNER_EMAIL = 'integration-fpool-owner@integration.test';
const CHILD_CLERK_ID = 'integration-fpool-child';
const CHILD_EMAIL = 'integration-fpool-child@integration.test';
const COPARENT_CLERK_ID = 'integration-fpool-coparent';
const COPARENT_EMAIL = 'integration-fpool-coparent@integration.test';
const V2_ORG_NAME = 'integration-fpool-v2-org';

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

interface SeedResult {
  subscriptionId: string;
  organizationId: string;
  ownerProfileId: string;
  childProfileId: string;
  coParentProfileId: string;
  cycleStartAt: string;
  dayStartAt: string;
}

/**
 * Seeds a family of three (owner, child, co-parent) directly into the v2
 * store (organization/person/membership/subscription/guardianship), which is
 * everything getUsageBreakdownForProfileV2 reads.
 *
 * Account layout:
 * - ownerProfile (admin membership, guardian of childProfile)
 * - childProfile (learner membership, charge of ownerProfile + coParentProfile)
 * - coParentProfile (learner membership, guardian of childProfile)
 */
async function seedFamilyWithUsage(): Promise<SeedResult> {
  const db = createIntegrationDb();

  const [org] = await db
    .insert(organization)
    .values({ name: V2_ORG_NAME })
    .returning();

  const [ownerProfile] = await db
    .insert(person)
    .values({
      displayName: 'Owner',
      birthDate: '1980-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning();

  const [childProfile] = await db
    .insert(person)
    .values({
      displayName: 'Child',
      birthDate: '2013-01-01', // age 13
      residenceJurisdiction: 'EU',
    })
    .returning();

  const [coParentProfile] = await db
    .insert(person)
    .values({
      displayName: 'Co-parent',
      birthDate: '1982-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning();

  await db.insert(membership).values([
    { personId: ownerProfile!.id, organizationId: org!.id, roles: ['admin'] },
    {
      personId: childProfile!.id,
      organizationId: org!.id,
      roles: ['learner'],
    },
    {
      personId: coParentProfile!.id,
      organizationId: org!.id,
      roles: ['learner'],
    },
  ]);

  const [sub] = await db
    .insert(subscriptionV2Table)
    .values({
      organizationId: org!.id,
      planTier: 'family',
      status: 'active',
      payerPersonId: ownerProfile!.id,
    })
    .returning();

  // Quota pool (required for the subscription FK, not read by
  // getUsageBreakdownForProfileV2 directly).
  const cycleStart = new Date('2026-05-01T00:00:00.000Z');
  await db.insert(quotaPools).values({
    subscriptionId: sub!.id,
    monthlyLimit: 700,
    usedThisMonth: 0,
    usedToday: 0,
    cycleResetAt: new Date('2026-06-01T00:00:00.000Z'),
  });

  // Guardianship edges — owner and co-parent are both guardians of the child.
  await db.insert(guardianship).values([
    { guardianPersonId: ownerProfile!.id, chargePersonId: childProfile!.id },
    {
      guardianPersonId: coParentProfile!.id,
      chargePersonId: childProfile!.id,
    },
  ]);

  const now = new Date('2026-05-06T12:00:00.000Z');

  // Owner: 10 events in this cycle, 1 today
  await db.insert(usageEvents).values({
    subscriptionId: sub!.id,
    profileId: ownerProfile!.id,
    occurredAt: new Date('2026-05-02T10:00:00.000Z'),
    delta: 1,
  });
  for (let i = 1; i < 10; i++) {
    await db.insert(usageEvents).values({
      subscriptionId: sub!.id,
      profileId: ownerProfile!.id,
      occurredAt: new Date('2026-05-03T10:00:00.000Z'),
      delta: 1,
    });
  }
  await db.insert(usageEvents).values({
    subscriptionId: sub!.id,
    profileId: ownerProfile!.id,
    occurredAt: now,
    delta: 1,
  });

  // Child: 7 events, 3 today
  for (let i = 0; i < 4; i++) {
    await db.insert(usageEvents).values({
      subscriptionId: sub!.id,
      profileId: childProfile!.id,
      occurredAt: new Date('2026-05-04T09:00:00.000Z'),
      delta: 1,
    });
  }
  for (let i = 0; i < 3; i++) {
    await db.insert(usageEvents).values({
      subscriptionId: sub!.id,
      profileId: childProfile!.id,
      occurredAt: now,
      delta: 1,
    });
  }

  // Co-parent: 5 events, 2 today
  for (let i = 0; i < 3; i++) {
    await db.insert(usageEvents).values({
      subscriptionId: sub!.id,
      profileId: coParentProfile!.id,
      occurredAt: new Date('2026-05-05T14:00:00.000Z'),
      delta: 1,
    });
  }
  for (let i = 0; i < 2; i++) {
    await db.insert(usageEvents).values({
      subscriptionId: sub!.id,
      profileId: coParentProfile!.id,
      occurredAt: now,
      delta: 1,
    });
  }

  return {
    subscriptionId: sub!.id,
    organizationId: org!.id,
    ownerProfileId: ownerProfile!.id,
    childProfileId: childProfile!.id,
    coParentProfileId: coParentProfile!.id,
    cycleStartAt: cycleStart.toISOString(),
    dayStartAt: '2026-05-06T00:00:00.000Z',
  };
}

async function setSharingEnabled(ownerProfileId: string, enabled: boolean) {
  const db = createIntegrationDb();
  await db
    .insert(familyPreferences)
    .values({ ownerProfileId, poolBreakdownShared: enabled })
    .onConflictDoUpdate({
      target: familyPreferences.ownerProfileId,
      set: { poolBreakdownShared: enabled },
    });
}

async function cleanupV2() {
  const db = createIntegrationDb();
  const org = await db.query.organization.findFirst({
    where: eq(organization.name, V2_ORG_NAME),
  });
  if (!org) return;
  await db
    .delete(subscriptionV2Table)
    .where(eq(subscriptionV2Table.organizationId, org.id));
  const members = await db.query.membership.findMany({
    where: eq(membership.organizationId, org.id),
    columns: { personId: true },
  });
  const personIds = members.map((m) => m.personId);
  if (personIds.length > 0) {
    // guardianship RESTRICTs on person for both endpoints — clear edges on
    // either side before deleting the persons.
    await db
      .delete(guardianship)
      .where(inArray(guardianship.guardianPersonId, personIds));
    await db
      .delete(guardianship)
      .where(inArray(guardianship.chargePersonId, personIds));
    await db.delete(person).where(inArray(person.id, personIds));
  }
  await db.delete(organization).where(eq(organization.id, org.id));
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanupAccounts({
    emails: [OWNER_EMAIL, CHILD_EMAIL, COPARENT_EMAIL],
    clerkUserIds: [OWNER_CLERK_ID, CHILD_CLERK_ID, COPARENT_CLERK_ID],
  });
  await cleanupV2();
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [OWNER_EMAIL, CHILD_EMAIL, COPARENT_EMAIL],
    clerkUserIds: [OWNER_CLERK_ID, CHILD_CLERK_ID, COPARENT_CLERK_ID],
  });
  await cleanupV2();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: family pool breakdown visibility (BUG-898)', () => {
  it('Test 1: child viewer + sharing OFF → byProfile empty, self-only data', async () => {
    const db = createIntegrationDb();
    const seed = await seedFamilyWithUsage();
    await setSharingEnabled(seed.ownerProfileId, false);

    const result = await getUsageBreakdownForProfileV2(db, {
      subscriptionId: seed.subscriptionId,
      activeProfileId: seed.childProfileId,
      monthlyLimit: 700,
      cycleStartAt: seed.cycleStartAt,
      dayStartAt: seed.dayStartAt,
    });

    expect(result.byProfile).toHaveLength(0);
    expect(result.familyAggregate).toBeNull();
    expect(result.isOwnerBreakdownViewer).toBe(false);

    // selfUsedToday should reflect the child's own 3 events only
    expect(result.selfUsedToday).toBe(3);
    // selfUsedThisMonth should reflect child's own 7 events
    expect(result.selfUsedThisMonth).toBe(7);
  });

  it('Test 2: child viewer + sharing ON → byProfile still empty (C2 fix)', async () => {
    const db = createIntegrationDb();
    const seed = await seedFamilyWithUsage();
    await setSharingEnabled(seed.ownerProfileId, true);

    const result = await getUsageBreakdownForProfileV2(db, {
      subscriptionId: seed.subscriptionId,
      activeProfileId: seed.childProfileId,
      monthlyLimit: 700,
      cycleStartAt: seed.cycleStartAt,
      dayStartAt: seed.dayStartAt,
    });

    // C2: sharing is for adults only — children must never see full breakdown
    expect(result.byProfile).toHaveLength(0);
    expect(result.familyAggregate).toBeNull();
    expect(result.isOwnerBreakdownViewer).toBe(false);

    // Must still see own data
    expect(result.selfUsedToday).toBe(3);
    expect(result.selfUsedThisMonth).toBe(7);
  });

  it('Test 3: non-owner adult (co-parent) + sharing ON → full breakdown', async () => {
    const db = createIntegrationDb();
    const seed = await seedFamilyWithUsage();
    await setSharingEnabled(seed.ownerProfileId, true);

    const result = await getUsageBreakdownForProfileV2(db, {
      subscriptionId: seed.subscriptionId,
      activeProfileId: seed.coParentProfileId,
      monthlyLimit: 700,
      cycleStartAt: seed.cycleStartAt,
      dayStartAt: seed.dayStartAt,
    });

    expect(result.isOwnerBreakdownViewer).toBe(true);
    // All 3 profiles visible
    expect(result.byProfile).toHaveLength(3);
    const profileIds = result.byProfile.map((r) => r.profile_id);
    expect(profileIds).toContain(seed.ownerProfileId);
    expect(profileIds).toContain(seed.childProfileId);
    expect(profileIds).toContain(seed.coParentProfileId);

    // No sibling data leaks into selfUsed fields when breakdown is visible
    expect(result.familyAggregate).not.toBeNull();
    expect(result.selfUsedToday).toBeNull();
    expect(result.selfUsedThisMonth).toBeNull();
  });

  it('Test 4: owner + child link → full breakdown regardless of sharing flag', async () => {
    const db = createIntegrationDb();
    const seed = await seedFamilyWithUsage();
    // Sharing is OFF — owner should still see full breakdown
    await setSharingEnabled(seed.ownerProfileId, false);

    const result = await getUsageBreakdownForProfileV2(db, {
      subscriptionId: seed.subscriptionId,
      activeProfileId: seed.ownerProfileId,
      monthlyLimit: 700,
      cycleStartAt: seed.cycleStartAt,
      dayStartAt: seed.dayStartAt,
    });

    expect(result.isOwnerBreakdownViewer).toBe(true);
    expect(result.byProfile).toHaveLength(3);
    expect(result.familyAggregate).not.toBeNull();
  });
});
