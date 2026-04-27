/**
 * Integration: Parking Lot Data Service — concurrent cap enforcement (BUG-860)
 *
 * Before the neon-serverless driver swap, db.transaction() was a no-op.
 * The TOCTOU guard in addParkingLotItem (count-check then insert) ran as
 * three separate auto-committed statements, so concurrent requests could
 * each pass the count check at the same stale value and collectively exceed
 * MAX_ITEMS_PER_TOPIC.
 *
 * NOTE on isolation level: the current implementation uses a plain READ
 * COMMITTED transaction with a tx.query.findMany (no SELECT FOR UPDATE).
 * At READ COMMITTED, concurrent transactions can still both read the same
 * pre-insert count and both proceed.  The test below documents the expected
 * invariant; if it fails on the current code, that points to a remaining
 * weakness in the guard (needs FOR UPDATE or SERIALIZABLE isolation) that
 * the driver swap alone does not close.
 *
 * No mocks of internal services or database.
 */

import { eq, inArray, and, count } from 'drizzle-orm';
import {
  accounts,
  profiles,
  subjects,
  learningSessions,
  parkingLotItems,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { addParkingLotItem, MAX_ITEMS_PER_TOPIC } from './parking-lot-data';

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

const PREFIX = 'integration-parking-bug860';
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
      displayName: 'ParkingLot Test User',
      birthYear: 2000,
      isOwner: true,
    })
    .returning();
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: `${PREFIX}-subject`,
      status: 'active',
    })
    .returning();
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: profile!.id,
      subjectId: subject!.id,
    })
    .returning();
  return {
    account: account!,
    profile: profile!,
    subject: subject!,
    session: session!,
  };
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

describe('[BUG-860] addParkingLotItem concurrent cap enforcement (integration)', () => {
  it('[BUG-860] enforces MAX_ITEMS_PER_TOPIC under concurrent inserts — final count must not exceed cap', async () => {
    const { profile, session } = await seedFixture();
    const db = createIntegrationDb();

    // Pre-fill to MAX - 1 items
    const cap = MAX_ITEMS_PER_TOPIC;
    for (let i = 0; i < cap - 1; i++) {
      const result = await addParkingLotItem(
        db,
        profile.id,
        session.id,
        `Pre-filled question ${i + 1}`
      );
      expect(result).not.toBeNull();
    }

    // Count before the concurrent attempt — should be cap - 1
    const [before] = await db
      .select({ n: count() })
      .from(parkingLotItems)
      .where(
        and(
          eq(parkingLotItems.sessionId, session.id),
          eq(parkingLotItems.profileId, profile.id)
        )
      );
    expect(before!.n).toBe(cap - 1);

    // Fire 15 concurrent inserts.  The advisory lock serializes them, so
    // exactly ONE should succeed; the other 14 should return null.
    const CONCURRENT = 15;
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT }, (_, i) =>
        addParkingLotItem(db, profile.id, session.id, `Racing question ${i}`)
      )
    );

    // None should reject — the service returns null for over-cap, not throws
    const rejections = results.filter((r) => r.status === 'rejected');
    expect(rejections).toHaveLength(0);

    // Count how many of the concurrent calls actually inserted a row
    const inserted = results.filter(
      (r) => r.status === 'fulfilled' && r.value !== null
    );

    // The final count must equal the cap exactly — the advisory lock must
    // serialize all concurrent transactions so only the first one can insert.
    // LessThanOrEqual is NOT sufficient here; if the lock is missing the count
    // can still be exactly cap by accident.  We assert strict equality because
    // the pre-filled count was cap - 1 and exactly one more insert must win.
    const [after] = await db
      .select({ n: count() })
      .from(parkingLotItems)
      .where(
        and(
          eq(parkingLotItems.sessionId, session.id),
          eq(parkingLotItems.profileId, profile.id)
        )
      );

    // Hard invariant: exactly 1 of the concurrent calls must have inserted,
    // and the DB count must equal cap (not merely <= cap).
    expect(inserted).toHaveLength(1);
    expect(after!.n).toBe(cap);
  });
});
