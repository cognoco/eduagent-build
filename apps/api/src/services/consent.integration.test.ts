/**
 * Integration: createGrantedConsentState atomicity [BUG-863]
 *
 * Proves rollback against a real database. The consent + family_link writes
 * happen inside `db.transaction(...)`; if the family_link insert fails the
 * FK constraint, BOTH writes must roll back so the child profile is never
 * left in CONSENTED state without a parent link (GDPR/COPPA exposure).
 *
 * Unit tests in consent.test.ts already verify the call shape (single
 * transaction call, error propagates). This test verifies the runtime
 * behaviour against Postgres — the silent neon-http non-atomic fallback
 * was the actual root cause, and only an end-to-end check confirms the
 * driver migration restored ACID semantics.
 */

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  profiles,
  consentStates,
  familyLinks,
  nudges,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { createGrantedConsentState, revokeConsent } from './consent';

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../..'));

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

const PREFIX = 'integration-consent-863';
const TEST_EMAIL = `${PREFIX}@integration.test`;
const TEST_CLERK = `${PREFIX}-clerk`;
// A UUID that is NEVER seeded — used to trigger the FK violation on
// familyLinks.parent_profile_id and force the transaction to roll back.
const NON_EXISTENT_PARENT_ID = '00000000-0000-0000-0000-000000000000';

async function cleanup() {
  const db = createIntegrationDb();
  const accs = await db.query.accounts.findMany({
    where: inArray(accounts.email, [TEST_EMAIL]),
  });
  if (accs.length > 0) {
    await db.delete(accounts).where(
      inArray(
        accounts.id,
        accs.map((a) => a.id),
      ),
    );
  }
}

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createGrantedConsentState atomicity (integration) [BUG-863]', () => {
  it('rolls back the consent_states row when the family_link FK insert fails', async () => {
    const db = createIntegrationDb();
    const [account] = await db
      .insert(accounts)
      .values({ clerkUserId: TEST_CLERK, email: TEST_EMAIL })
      .returning();
    const [child] = await db
      .insert(profiles)
      .values({
        accountId: account!.id,
        displayName: 'Test Child',
        birthYear: 2014,
        isOwner: false,
      })
      .returning();

    // Trigger an FK violation on familyLinks.parent_profile_id mid-transaction.
    // The consent insert succeeds first, then the family_link insert fails —
    // a non-atomic execution would leave the consent row behind.
    await expect(
      createGrantedConsentState(db, child!.id, 'GDPR', NON_EXISTENT_PARENT_ID),
    ).rejects.toThrow();

    // Verify rollback: NO consent_states row exists for this profile. If the
    // transaction was non-atomic, the insert would have already committed
    // before the family_link error and this query would return a row.
    const lingering = await db.query.consentStates.findMany({
      where: eq(consentStates.profileId, child!.id),
    });
    expect(lingering).toHaveLength(0);

    // And no orphan family_link row either.
    const links = await db.query.familyLinks.findMany({
      where: eq(familyLinks.childProfileId, child!.id),
    });
    expect(links).toHaveLength(0);
  });

  it('persists both rows when both inserts succeed', async () => {
    const db = createIntegrationDb();
    const [account] = await db
      .insert(accounts)
      .values({ clerkUserId: TEST_CLERK, email: TEST_EMAIL })
      .returning();
    const [parent] = await db
      .insert(profiles)
      .values({
        accountId: account!.id,
        displayName: 'Parent',
        birthYear: 1985,
        isOwner: true,
      })
      .returning();
    const [child] = await db
      .insert(profiles)
      .values({
        accountId: account!.id,
        displayName: 'Child',
        birthYear: 2014,
        isOwner: false,
      })
      .returning();

    const result = await createGrantedConsentState(
      db,
      child!.id,
      'GDPR',
      parent!.id,
    );
    expect(result.status).toBe('CONSENTED');

    const consents = await db.query.consentStates.findMany({
      where: eq(consentStates.profileId, child!.id),
    });
    expect(consents).toHaveLength(1);
    expect(consents[0]!.status).toBe('CONSENTED');

    const links = await db.query.familyLinks.findMany({
      where: eq(familyLinks.childProfileId, child!.id),
    });
    expect(links).toHaveLength(1);
    expect(links[0]!.parentProfileId).toBe(parent!.id);
  });
});

// ---------------------------------------------------------------------------
// revokeConsent — nudge-suppression branch (integration)
// ---------------------------------------------------------------------------
//
// These tests verify the transactional nudge-suppression behaviour introduced
// alongside the WITHDRAWN update. They exercise the real Postgres DB so that
// the atomicity guarantee is proven at runtime, not just at the mock level.
// ---------------------------------------------------------------------------

const REVOKE_PREFIX = 'integration-consent-revoke';
const REVOKE_EMAIL_A = `${REVOKE_PREFIX}-a@integration.test`;
const REVOKE_EMAIL_B = `${REVOKE_PREFIX}-b@integration.test`;
const REVOKE_CLERK_A = `${REVOKE_PREFIX}-clerk-a`;
const REVOKE_CLERK_B = `${REVOKE_PREFIX}-clerk-b`;

async function cleanupRevokeTests() {
  const db = createIntegrationDb();
  const accs = await db.query.accounts.findMany({
    where: inArray(accounts.email, [REVOKE_EMAIL_A, REVOKE_EMAIL_B]),
  });
  if (accs.length > 0) {
    await db.delete(accounts).where(
      inArray(
        accounts.id,
        accs.map((a) => a.id),
      ),
    );
  }
}

/**
 * Seeds a parent + child profile with a CONSENTED consent state, a
 * family_link, and N unread nudges sent from the parent to the child.
 * Returns the created IDs so callers can query them after revokeConsent.
 */
async function seedConsentedChildWithNudges(
  db: ReturnType<typeof createIntegrationDb>,
  {
    accountEmail,
    clerkUserId,
    nudgeCount,
  }: { accountEmail: string; clerkUserId: string; nudgeCount: number },
) {
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email: accountEmail })
    .returning();

  const [parent] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Parent',
      birthYear: 1985,
      isOwner: true,
    })
    .returning();

  const [child] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Child',
      birthYear: 2014,
      isOwner: false,
    })
    .returning();

  const [consent] = await db
    .insert(consentStates)
    .values({
      profileId: child!.id,
      consentType: 'GDPR',
      status: 'CONSENTED',
      respondedAt: new Date(),
    })
    .returning();

  await db.insert(familyLinks).values({
    childProfileId: child!.id,
    parentProfileId: parent!.id,
  });

  const nudgeIds: string[] = [];
  for (let i = 0; i < nudgeCount; i++) {
    const [nudge] = await db
      .insert(nudges)
      .values({
        fromProfileId: parent!.id,
        toProfileId: child!.id,
        template: 'you_got_this',
      })
      .returning();
    nudgeIds.push(nudge!.id);
  }

  return {
    parentId: parent!.id,
    childId: child!.id,
    consentId: consent!.id,
    nudgeIds,
  };
}

describe('revokeConsent nudge-suppression (integration)', () => {
  beforeEach(async () => {
    await cleanupRevokeTests();
  });

  afterAll(async () => {
    await cleanupRevokeTests();
  });

  it('[nudge-suppression] marks all unread nudges readAt when consent is revoked', async () => {
    const db = createIntegrationDb();
    const { parentId, childId, nudgeIds } = await seedConsentedChildWithNudges(
      db,
      {
        accountEmail: REVOKE_EMAIL_A,
        clerkUserId: REVOKE_CLERK_A,
        nudgeCount: 3,
      },
    );

    const result = await revokeConsent(db, childId, parentId);

    expect(result.status).toBe('WITHDRAWN');
    expect(result.respondedAt).not.toBeNull();

    const rows = await db.query.nudges.findMany({
      where: eq(nudges.toProfileId, childId),
    });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.readAt).not.toBeNull();
    }

    const respondedAt = new Date(result.respondedAt!);
    for (const nudgeId of nudgeIds) {
      const nudge = rows.find((r) => r.id === nudgeId);
      expect(nudge).toBeDefined();
      expect(
        Math.abs(nudge!.readAt!.getTime() - respondedAt.getTime()),
      ).toBeLessThan(1000);
    }
  });

  it('[nudge-suppression] second revokeConsent call does NOT update already-read nudges', async () => {
    const db = createIntegrationDb();
    const { parentId, childId } = await seedConsentedChildWithNudges(db, {
      accountEmail: REVOKE_EMAIL_A,
      clerkUserId: REVOKE_CLERK_A,
      nudgeCount: 2,
    });

    await revokeConsent(db, childId, parentId);

    const afterFirst = await db.query.nudges.findMany({
      where: eq(nudges.toProfileId, childId),
    });
    const firstReadAts = afterFirst.map((r) => r.readAt!.getTime());

    await revokeConsent(db, childId, parentId);

    const afterSecond = await db.query.nudges.findMany({
      where: eq(nudges.toProfileId, childId),
    });
    const secondReadAts = afterSecond.map((r) => r.readAt!.getTime());

    expect(secondReadAts).toEqual(firstReadAts);
  });

  it('[nudge-suppression] only marks the targeted child nudges read — sibling nudges stay unread', async () => {
    const db = createIntegrationDb();

    const { parentId: parentA, childId: childA } =
      await seedConsentedChildWithNudges(db, {
        accountEmail: REVOKE_EMAIL_A,
        clerkUserId: REVOKE_CLERK_A,
        nudgeCount: 2,
      });

    const { childId: childB } = await seedConsentedChildWithNudges(db, {
      accountEmail: REVOKE_EMAIL_B,
      clerkUserId: REVOKE_CLERK_B,
      nudgeCount: 2,
    });

    await revokeConsent(db, childA, parentA);

    const nudgesA = await db.query.nudges.findMany({
      where: eq(nudges.toProfileId, childA),
    });
    for (const row of nudgesA) {
      expect(row.readAt).not.toBeNull();
    }

    const nudgesB = await db.query.nudges.findMany({
      where: eq(nudges.toProfileId, childB),
    });
    expect(nudgesB.length).toBeGreaterThan(0);
    for (const row of nudgesB) {
      expect(row.readAt).toBeNull();
    }
  });

  it('[nudge-suppression] does NOT touch nudges when status is already WITHDRAWN (early-return guard)', async () => {
    const db = createIntegrationDb();
    const { parentId, childId } = await seedConsentedChildWithNudges(db, {
      accountEmail: REVOKE_EMAIL_A,
      clerkUserId: REVOKE_CLERK_A,
      nudgeCount: 1,
    });

    await db
      .update(consentStates)
      .set({ status: 'WITHDRAWN', respondedAt: new Date() })
      .where(eq(consentStates.profileId, childId));

    const before = await db.query.nudges.findMany({
      where: eq(nudges.toProfileId, childId),
    });
    expect(before[0]!.readAt).toBeNull();

    const result = await revokeConsent(db, childId, parentId);
    expect(result.status).toBe('WITHDRAWN');

    const after = await db.query.nudges.findMany({
      where: eq(nudges.toProfileId, childId),
    });
    expect(after[0]!.readAt).toBeNull();
  });
});
