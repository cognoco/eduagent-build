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
  accounts,
  profiles,
  notificationLog,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { checkAndLogRateLimit } from './settings';

// ---------------------------------------------------------------------------
// DB setup — real connection
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.'
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
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId: ACCOUNT.clerkUserId, email: ACCOUNT.email })
    .returning();
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Settings Test User',
      birthYear: 2000,
      isOwner: true,
    })
    .returning();
  return { account: account!, profile: profile! };
}

async function cleanup() {
  const db = createIntegrationDb();
  const found = await db.query.accounts.findMany({
    where: eq(accounts.email, ACCOUNT.email),
  });
  const ids = found.map((a) => a.id);
  if (ids.length > 0) {
    await db.delete(accounts).where(inArray(accounts.id, ids));
  }
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
        { hours: HOURS, maxCount: MAX_COUNT }
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
          gte(notificationLog.sentAt, since)
        )
      );
    expect(before!.n).toBe(MAX_COUNT - 1);

    // Fire 15 concurrent rate-limit checks.  The advisory lock serializes them,
    // so exactly ONE should be allowed; the other 14 must be rate-limited.
    const CONCURRENT = 15;
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT }, () =>
        checkAndLogRateLimit(db, profile.id, account.id, NOTIFICATION_TYPE, {
          hours: HOURS,
          maxCount: MAX_COUNT,
        })
      )
    );

    // None should throw
    const rejections = results.filter((r) => r.status === 'rejected');
    expect(rejections).toHaveLength(0);

    // Count how many calls were NOT rate-limited (i.e., logged an entry)
    const allowed = results.filter(
      (r) => r.status === 'fulfilled' && r.value === false
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
          gte(notificationLog.sentAt, sinceNow)
        )
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
        { hours: HOURS, maxCount: MAX_COUNT }
      );
      expect(limited).toBe(false);
    }

    // Next call must be rate-limited
    const rateLimited = await checkAndLogRateLimit(
      db,
      profile.id,
      account.id,
      NOTIFICATION_TYPE,
      { hours: HOURS, maxCount: MAX_COUNT }
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
          gte(notificationLog.sentAt, since)
        )
      );
    expect(row!.n).toBe(MAX_COUNT);
  });
});
