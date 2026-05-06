/**
 * Integration: Family pool breakdown visibility (BUG-898 break test, C6)
 *
 * Verifies that getUsageBreakdownForProfile enforces the correct visibility
 * rules against a real database. The C2 fix specifically prevents child
 * profiles from receiving full breakdown access when owner sharing is enabled.
 *
 * Test matrix:
 * 1. child viewer + sharing OFF  → byProfile: [], self-only data
 * 2. child viewer + sharing ON   → byProfile: [] (C2 fix), self-only data
 * 3. non-owner adult + sharing ON → full breakdown
 * 4. owner + child link          → full breakdown regardless of sharing flag
 *
 * Mocked boundaries: none — all DB access is real.
 */

import { eq } from 'drizzle-orm';
import {
  accounts,
  familyLinks,
  familyPreferences,
  profiles,
  quotaPools,
  subscriptions,
  usageEvents,
} from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import { getUsageBreakdownForProfile } from '../../apps/api/src/services/billing/family';

// ---------------------------------------------------------------------------
// Test identity constants
// ---------------------------------------------------------------------------

const OWNER_CLERK_ID = 'integration-fpool-owner';
const OWNER_EMAIL = 'integration-fpool-owner@integration.test';
const CHILD_CLERK_ID = 'integration-fpool-child';
const CHILD_EMAIL = 'integration-fpool-child@integration.test';
const COPARENT_CLERK_ID = 'integration-fpool-coparent';
const COPARENT_EMAIL = 'integration-fpool-coparent@integration.test';

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

interface SeedResult {
  subscriptionId: string;
  ownerProfileId: string;
  childProfileId: string;
  coParentProfileId: string;
  cycleStartAt: string;
  dayStartAt: string;
}

/**
 * Seeds a single account with three profiles (owner, child, co-parent),
 * one shared subscription, and per-profile usage events.
 *
 * Account layout:
 * - ownerProfile (isOwner=true, has familyLink to childProfile)
 * - childProfile (isOwner=false, linked as child via familyLinks)
 * - coParentProfile (isOwner=false, has familyLink TO childProfile → hasChildLink=true, isChild=false)
 *
 * The test account uses one Clerk user (owner) because the billing DB model
 * is account-scoped. Co-parent and child are additional profiles on the same
 * account, which is the real multi-profile family model.
 */
async function seedFamilyWithUsage(): Promise<SeedResult> {
  const db = createIntegrationDb();

  // Single account for all profiles (family account model)
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId: OWNER_CLERK_ID, email: OWNER_EMAIL })
    .returning();

  const [ownerProfile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Owner',
      birthYear: 1980,
      isOwner: true,
    })
    .returning();

  const [childProfile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Child',
      birthYear: 2013, // age 13
      isOwner: false,
    })
    .returning();

  const [coParentProfile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Co-parent',
      birthYear: 1982,
      isOwner: false,
    })
    .returning();

  // Owner and co-parent both have a child link (hasChildLink=true)
  await db.insert(familyLinks).values({
    parentProfileId: ownerProfile!.id,
    childProfileId: childProfile!.id,
  });

  await db.insert(familyLinks).values({
    parentProfileId: coParentProfile!.id,
    childProfileId: childProfile!.id,
  });

  // Subscription
  const [sub] = await db
    .insert(subscriptions)
    .values({
      accountId: account!.id,
      tier: 'family',
      status: 'active',
    })
    .returning();

  // Quota pool (required for the subscription to be queryable)
  const cycleStart = new Date('2026-05-01T00:00:00.000Z');
  await db.insert(quotaPools).values({
    subscriptionId: sub!.id,
    monthlyLimit: 700,
    usedThisMonth: 0,
    usedToday: 0,
    cycleResetAt: new Date('2026-06-01T00:00:00.000Z'),
  });

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

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanupAccounts({
    emails: [OWNER_EMAIL, CHILD_EMAIL, COPARENT_EMAIL],
    clerkUserIds: [OWNER_CLERK_ID, CHILD_CLERK_ID, COPARENT_CLERK_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [OWNER_EMAIL, CHILD_EMAIL, COPARENT_EMAIL],
    clerkUserIds: [OWNER_CLERK_ID, CHILD_CLERK_ID, COPARENT_CLERK_ID],
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: family pool breakdown visibility (BUG-898)', () => {
  it('Test 1: child viewer + sharing OFF → byProfile empty, self-only data', async () => {
    const db = createIntegrationDb();
    const seed = await seedFamilyWithUsage();
    await setSharingEnabled(seed.ownerProfileId, false);

    const result = await getUsageBreakdownForProfile(db, {
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

    const result = await getUsageBreakdownForProfile(db, {
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

    const result = await getUsageBreakdownForProfile(db, {
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

    const result = await getUsageBreakdownForProfile(db, {
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
