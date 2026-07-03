/**
 * Integration: Settings Service — concurrent rate-limit cap enforcement (BUG-861)
 *
 * Before the neon-serverless driver swap, db.transaction() was a no-op.
 * The TOCTOU guard in checkAndLogRateLimit (count-check then insert) ran as
 * separate auto-committed statements.  Two concurrent requests could each
 * read a count below the cap, both decide "not limited", and both log an
 * entry, exceeding the cap.
 *
 * NOTE on isolation level: the current implementation uses READ COMMITTED
 * with a plain SELECT (no FOR UPDATE).  At READ COMMITTED, concurrent
 * transactions can still both read the same pre-insert count.  The test
 * documents the invariant; if it fails this points to a remaining TOCTOU
 * weakness that needs FOR UPDATE or SERIALIZABLE isolation to close fully.
 *
 * No mocks of internal services or database.
 */

import { eq, inArray, and, count, gte } from 'drizzle-orm';
import {
  guardianship,
  person,
  login,
  membership,
  generateUUIDv7,
  familyLinks,
  notificationLog,
  createDatabase,
} from '@eduagent/database';
import {
  ensureV2IdentityForLegacyProfileTest,
  ensureLegacyProfileAnchorForTest,
  deleteLegacyAccountsForTest,
  deleteV2IdentitiesForTest,
  legacyIdentityTableExistsForTest,
} from '../test-utils/legacy-identity-anchors';

// Discovers the account/profile ids a prior run of seedFixture-shaped helpers
// left behind, by email — via the v2 `login` table, which (unlike legacy
// `accounts`) always exists. Returns the v2 organizationId (== accountId,
// reseed-identity-contract) and personId (== profileId) for each match.
async function findSeededIdsByEmail(
  db: ReturnType<typeof createIntegrationDb>,
  emails: string[],
): Promise<{ accountIds: string[]; profileIds: string[] }> {
  const loginRows = await db.query.login.findMany({
    where: inArray(login.email, emails),
    columns: { personId: true },
  });
  const profileIds = loginRows.map((r) => r.personId);
  if (profileIds.length === 0) return { accountIds: [], profileIds: [] };
  const membershipRows = await db.query.membership.findMany({
    where: inArray(membership.personId, profileIds),
    columns: { organizationId: true },
  });
  const accountIds = [...new Set(membershipRows.map((r) => r.organizationId))];
  return { accountIds, profileIds };
}
import { ForbiddenError } from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { checkAndLogRateLimit, getChildCelebrationLevel } from './settings';

// ---------------------------------------------------------------------------
// DB setup — real connection
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

// ---------------------------------------------------------------------------
// Test identifiers
// ---------------------------------------------------------------------------

const PREFIX = 'integration-settings-bug861';
const ACCOUNT = {
  clerkUserId: `${PREFIX}-user`,
  email: `${PREFIX}@integration.test`,
};

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedFixture() {
  const db = createIntegrationDb();
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  // [WI-867] v2 identity rows — always seeded (flag collapsed to v2-only).
  // Gated internally: dual-writes the legacy accounts/profiles anchor when
  // the legacy tables exist (seedBaselineSubscription:false skips the v2
  // helper's own anchor call, so this explicit one is load-bearing).
  await ensureLegacyProfileAnchorForTest(db, {
    profileId,
    accountId,
    displayName: 'Settings Test User',
    birthYear: 2000,
    isOwner: true,
    clerkUserId: ACCOUNT.clerkUserId,
    email: ACCOUNT.email,
  });
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: 'Settings Test User',
    birthYear: 2000,
    clerkUserId: ACCOUNT.clerkUserId,
    email: ACCOUNT.email,
    isOwner: true,
    seedBaselineSubscription: false,
  });
  return {
    account: { id: accountId },
    profile: { id: profileId },
  };
}

async function cleanup() {
  const db = createIntegrationDb();
  const { accountIds, profileIds } = await findSeededIdsByEmail(db, [
    ACCOUNT.email,
  ]);
  await deleteLegacyAccountsForTest(db, accountIds);
  await deleteV2IdentitiesForTest(db, { accountIds, profileIds });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('[BUG-861] checkAndLogRateLimit concurrent cap enforcement (integration)', () => {
  it('[BUG-861] enforces maxCount under concurrent calls — final log count must not exceed cap', async () => {
    const { account, profile } = await seedFixture();
    const db = createIntegrationDb();

    const HOURS = 1;
    const MAX_COUNT = 3;
    const NOTIFICATION_TYPE = 'review_reminder' as const;

    // Pre-fill to cap - 1 entries
    for (let i = 0; i < MAX_COUNT - 1; i++) {
      const rateLimited = await checkAndLogRateLimit(
        db,
        profile.id,
        account.id,
        NOTIFICATION_TYPE,
        { hours: HOURS, maxCount: MAX_COUNT },
        { callerPersonId: profile.id },
      );
      expect(rateLimited).toBe(false);
    }

    // Verify pre-condition: cap - 1 rows logged
    const since = new Date(Date.now() - HOURS * 60 * 60 * 1000);
    const [before] = await db
      .select({ n: count() })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.profileId, profile.id),
          eq(notificationLog.type, NOTIFICATION_TYPE),
          gte(notificationLog.sentAt, since),
        ),
      );
    expect(before!.n).toBe(MAX_COUNT - 1);

    // Fire 15 concurrent rate-limit checks.  The advisory lock serializes them,
    // so exactly ONE should be allowed; the other 14 must be rate-limited.
    const CONCURRENT = 15;
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT }, () =>
        checkAndLogRateLimit(
          db,
          profile.id,
          account.id,
          NOTIFICATION_TYPE,
          { hours: HOURS, maxCount: MAX_COUNT },
          { callerPersonId: profile.id },
        ),
      ),
    );

    // None should throw
    const rejections = results.filter((r) => r.status === 'rejected');
    expect(rejections).toHaveLength(0);

    // Count how many calls were NOT rate-limited (i.e., logged an entry)
    const allowed = results.filter(
      (r) => r.status === 'fulfilled' && r.value === false,
    );

    // Final notification count must equal MAX_COUNT exactly — the advisory lock
    // must serialize all concurrent transactions so only the first one can insert.
    // LessThanOrEqual is NOT sufficient; we assert strict equality because the
    // pre-filled count was MAX_COUNT - 1 and exactly one more insert must win.
    const sinceNow = new Date(Date.now() - HOURS * 60 * 60 * 1000);
    const [after] = await db
      .select({ n: count() })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.profileId, profile.id),
          eq(notificationLog.type, NOTIFICATION_TYPE),
          gte(notificationLog.sentAt, sinceNow),
        ),
      );

    // Hard invariant: exactly 1 of the concurrent calls must have been allowed,
    // and the DB count must equal MAX_COUNT (not merely <= MAX_COUNT).
    expect(allowed).toHaveLength(1);
    expect(after!.n).toBe(MAX_COUNT);
  });

  it('[BUG-861] returns true (rate-limited) when already at cap — no extra log row', async () => {
    const { account, profile } = await seedFixture();
    const db = createIntegrationDb();

    const HOURS = 1;
    const MAX_COUNT = 2;
    const NOTIFICATION_TYPE = 'daily_reminder' as const;

    // Fill to cap sequentially
    for (let i = 0; i < MAX_COUNT; i++) {
      const limited = await checkAndLogRateLimit(
        db,
        profile.id,
        account.id,
        NOTIFICATION_TYPE,
        { hours: HOURS, maxCount: MAX_COUNT },
        { callerPersonId: profile.id },
      );
      expect(limited).toBe(false);
    }

    // Next call must be rate-limited
    const rateLimited = await checkAndLogRateLimit(
      db,
      profile.id,
      account.id,
      NOTIFICATION_TYPE,
      { hours: HOURS, maxCount: MAX_COUNT },
      { callerPersonId: profile.id },
    );
    expect(rateLimited).toBe(true);

    // Row count must still be exactly MAX_COUNT
    const since = new Date(Date.now() - HOURS * 60 * 60 * 1000);
    const [row] = await db
      .select({ n: count() })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.profileId, profile.id),
          eq(notificationLog.type, NOTIFICATION_TYPE),
          gte(notificationLog.sentAt, since),
        ),
      );
    expect(row!.n).toBe(MAX_COUNT);
  });
});

// ---------------------------------------------------------------------------
// getChildCelebrationLevel — authorization boundary (integration)
// ---------------------------------------------------------------------------

const CELEB_PREFIX = 'integration-settings-celeb';
const CELEB_PARENT_A = {
  clerkUserId: `${CELEB_PREFIX}-parentA`,
  email: `${CELEB_PREFIX}-parentA@integration.test`,
};
const CELEB_PARENT_B = {
  clerkUserId: `${CELEB_PREFIX}-parentB`,
  email: `${CELEB_PREFIX}-parentB@integration.test`,
};

async function seedCelebrationFixture() {
  const db = createIntegrationDb();

  const accountAId = generateUUIDv7();
  const profileAId = generateUUIDv7();
  const accountBId = generateUUIDv7();
  const profileBId = generateUUIDv7();
  const childProfileId = generateUUIDv7();

  await ensureLegacyProfileAnchorForTest(db, {
    profileId: profileAId,
    accountId: accountAId,
    displayName: 'Parent A',
    birthYear: 1985,
    isOwner: true,
    clerkUserId: CELEB_PARENT_A.clerkUserId,
    email: CELEB_PARENT_A.email,
  });
  await ensureLegacyProfileAnchorForTest(db, {
    profileId: profileBId,
    accountId: accountBId,
    displayName: 'Parent B',
    birthYear: 1986,
    isOwner: true,
    clerkUserId: CELEB_PARENT_B.clerkUserId,
    email: CELEB_PARENT_B.email,
  });
  // Child profile belongs to parent A's account.
  await ensureLegacyProfileAnchorForTest(db, {
    profileId: childProfileId,
    accountId: accountAId,
    displayName: 'Child',
    birthYear: 2014,
    isOwner: false,
  });

  // Link child only to parent A (legacy table — kept for legacy-path callers).
  if (await legacyIdentityTableExistsForTest(db, 'family_links')) {
    await db.insert(familyLinks).values({
      parentProfileId: profileAId,
      childProfileId,
    });
  }

  // [WI-867] v2 identity rows — assertParentAccess now reads guardianship.
  await db.insert(person).values([
    {
      id: profileAId,
      displayName: 'Parent A',
      birthDate: '1985-06-15',
      residenceJurisdiction: 'EU',
    },
    {
      id: profileBId,
      displayName: 'Parent B',
      birthDate: '1986-06-15',
      residenceJurisdiction: 'EU',
    },
    {
      id: childProfileId,
      displayName: 'Child',
      birthDate: '2014-06-15',
      residenceJurisdiction: 'EU',
    },
  ]);
  await db.insert(guardianship).values({
    guardianPersonId: profileAId,
    chargePersonId: childProfileId,
  });

  return {
    parentA: { id: profileAId },
    parentB: { id: profileBId },
    child: { id: childProfileId },
  };
}

async function cleanupCelebration() {
  const db = createIntegrationDb();
  const { accountIds, profileIds } = await findSeededIdsByEmail(db, [
    CELEB_PARENT_A.email,
    CELEB_PARENT_B.email,
  ]);
  await deleteLegacyAccountsForTest(db, accountIds);
  await deleteV2IdentitiesForTest(db, { accountIds, profileIds });
}

describe('getChildCelebrationLevel authorization boundary (integration)', () => {
  beforeEach(async () => {
    await cleanupCelebration();
  });

  afterAll(async () => {
    await cleanupCelebration();
  });

  it('returns the default celebration level for a linked child', async () => {
    const { parentA, child } = await seedCelebrationFixture();
    const db = createIntegrationDb();

    const level = await getChildCelebrationLevel(db, parentA.id, child.id);
    expect(level).toBe('big_only');
  });

  it('rejects access when the caller is not the linked parent', async () => {
    const { parentB, child } = await seedCelebrationFixture();
    const db = createIntegrationDb();

    await expect(
      getChildCelebrationLevel(db, parentB.id, child.id),
    ).rejects.toThrow(ForbiddenError);
  });
});
