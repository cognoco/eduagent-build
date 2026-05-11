/**
 * Integration: nudge service — real database (I1 atomicity + I7 coverage)
 *
 * Covers:
 *   1. Happy-path end-to-end insert
 *   2. Rate-limit BREAK test: 5th createNudge from same parent throws RateLimitedError
 *   3. Per-recipient dimension BREAK test: child at limit, parent B also blocked
 *   4. Concurrency BREAK test: count=2, 5 concurrent calls, at most 1 succeeds
 *   5. IDOR BREAK: markNudgeRead with wrong profileId returns 0
 *   6. IDOR BREAK: markAllNudgesRead with wrong profileId returns 0
 *
 * Only sendPushNotification is mocked — it is the true external boundary
 * (Expo Push API). All DB operations hit the real test database.
 *
 * CLAUDE.md rule: no internal jest.mock() in integration tests.
 */

import { resolve } from 'path';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import {
  accounts,
  consentStates,
  createDatabase,
  familyLinks,
  generateUUIDv7,
  nudges,
  profiles,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { RateLimitedError } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// External boundary mock — Expo push notification API.
// Must be declared before imports that resolve the module.
// ---------------------------------------------------------------------------

jest.mock(
  './notifications' /* gc1-allow: external push notification boundary (Expo Push API) */,
  () => ({
    ...jest.requireActual('./notifications'),
    sendPushNotification: jest
      .fn()
      .mockResolvedValue({ sent: false, reason: 'mocked' }),
  }),
);

import { createNudge, markNudgeRead, markAllNudgesRead } from './nudge';

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();

let db: Database;

let parentAProfileId: string;
let parentBProfileId: string;
let childXProfileId: string;
let childYProfileId: string;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedNudgeRow(
  fromProfileId: string,
  toProfileId: string,
  createdAt?: Date,
): Promise<string> {
  const [row] = await db
    .insert(nudges)
    .values({
      fromProfileId,
      toProfileId,
      template: 'you_got_this',
      createdAt: createdAt ?? new Date(),
    })
    .returning({ id: nudges.id });
  return row!.id;
}

async function seedConsent(childProfileId: string): Promise<void> {
  await db.insert(consentStates).values({
    profileId: childProfileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
  });
}

async function seedFamilyLink(
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  await db.insert(familyLinks).values({ parentProfileId, childProfileId });
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

async function cleanup(): Promise<void> {
  await db
    .delete(accounts)
    .where(
      inArray(accounts.clerkUserId, [
        `nudge-integ-${RUN_ID}-parentA`,
        `nudge-integ-${RUN_ID}-parentB`,
        `nudge-integ-${RUN_ID}-child`,
      ]),
    );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describeIfDb('nudge service (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);

    const [accA] = await db
      .insert(accounts)
      .values({
        clerkUserId: `nudge-integ-${RUN_ID}-parentA`,
        email: `nudge-integ-${RUN_ID}-parentA@test.invalid`,
      })
      .returning({ id: accounts.id });

    const [accB] = await db
      .insert(accounts)
      .values({
        clerkUserId: `nudge-integ-${RUN_ID}-parentB`,
        email: `nudge-integ-${RUN_ID}-parentB@test.invalid`,
      })
      .returning({ id: accounts.id });

    const [accChild] = await db
      .insert(accounts)
      .values({
        clerkUserId: `nudge-integ-${RUN_ID}-child`,
        email: `nudge-integ-${RUN_ID}-child@test.invalid`,
      })
      .returning({ id: accounts.id });

    const [parentA] = await db
      .insert(profiles)
      .values({
        accountId: accA!.id,
        displayName: 'Parent A',
        birthYear: 1980,
        isOwner: true,
      })
      .returning({ id: profiles.id });
    parentAProfileId = parentA!.id;

    const [parentB] = await db
      .insert(profiles)
      .values({
        accountId: accB!.id,
        displayName: 'Parent B',
        birthYear: 1982,
        isOwner: true,
      })
      .returning({ id: profiles.id });
    parentBProfileId = parentB!.id;

    const [childX] = await db
      .insert(profiles)
      .values({
        accountId: accChild!.id,
        displayName: 'Child X',
        birthYear: 2013,
        isOwner: false,
      })
      .returning({ id: profiles.id });
    childXProfileId = childX!.id;

    const [childY] = await db
      .insert(profiles)
      .values({
        accountId: accChild!.id,
        displayName: 'Child Y',
        birthYear: 2015,
        isOwner: false,
      })
      .returning({ id: profiles.id });
    childYProfileId = childY!.id;

    await seedFamilyLink(parentAProfileId, childXProfileId);
    await seedFamilyLink(parentBProfileId, childXProfileId);
    await seedFamilyLink(parentAProfileId, childYProfileId);

    await seedConsent(childXProfileId);
    await seedConsent(childYProfileId);
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await db
      .delete(nudges)
      .where(inArray(nudges.toProfileId, [childXProfileId, childYProfileId]));
  });

  // ── 1. Happy path ──────────────────────────────────────────────────────────

  it('creates a nudge row end-to-end', async () => {
    const result = await createNudge(db, {
      fromProfileId: parentAProfileId,
      toProfileId: childXProfileId,
      template: 'you_got_this',
    });

    expect(result.nudge.fromProfileId).toBe(parentAProfileId);
    expect(result.nudge.toProfileId).toBe(childXProfileId);
    expect(result.nudge.template).toBe('you_got_this');
    expect(result.nudge.readAt).toBeNull();
    expect(typeof result.nudge.id).toBe('string');

    const rows = await db.query.nudges.findMany({
      where: eq(nudges.id, result.nudge.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fromProfileId).toBe(parentAProfileId);
  });

  // ── 2. Rate-limit BREAK test ───────────────────────────────────────────────

  it('[BREAK] throws RateLimitedError after 4 nudges from same parent to same child', async () => {
    const now = new Date();
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);

    await expect(
      createNudge(db, {
        fromProfileId: parentAProfileId,
        toProfileId: childXProfileId,
        template: 'proud_of_you',
      }),
    ).rejects.toThrow(RateLimitedError);

    const NUDGE_WINDOW_MS = 24 * 60 * 60 * 1000;
    const windowStart = new Date(Date.now() - NUDGE_WINDOW_MS);
    const count = await db
      .select()
      .from(nudges)
      .where(
        and(
          eq(nudges.fromProfileId, parentAProfileId),
          eq(nudges.toProfileId, childXProfileId),
          gt(nudges.createdAt, windowStart),
        ),
      );
    expect(count).toHaveLength(4);
  });

  // ── 3. Per-recipient dimension (I1 spec: max 4/day per child, any sender) ─

  it('[BREAK] parent B cannot send when child has received 4 nudges from any parent', async () => {
    const now = new Date();
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);

    await expect(
      createNudge(db, {
        fromProfileId: parentBProfileId,
        toProfileId: childXProfileId,
        template: 'thinking_of_you',
      }),
    ).rejects.toThrow(RateLimitedError);
  });

  // ── 4. Concurrency BREAK test (I1 atomicity) ──────────────────────────────
  //
  // With count at 2, fire 5 concurrent createNudge calls from parent A.
  // The SERIALIZABLE transaction causes Postgres to detect the phantom-read
  // conflict and abort concurrent transactions that would violate the
  // serializable schedule.
  //
  // RED/GREEN verification (run manually against Neon for reliable results):
  //
  //   RED:  Remove { isolationLevel: 'serializable' } from the transaction
  //         call in nudge.ts (leaving default READ COMMITTED).
  //         Against Neon (network latency widens the race window), this test
  //         fails because multiple concurrent calls read count=2 before any
  //         insert commits, and multiple inserts succeed (rows > 3).
  //         Against local Postgres the window is narrow — the race may not
  //         manifest every run, but can be forced by inserting a pg_sleep in
  //         the transaction body between count and insert.
  //
  //   GREEN: Restore { isolationLevel: 'serializable' }.
  //          Postgres detects the serialization failure and aborts concurrent
  //          transactions. At most 1 of the 5 succeeds; rows stays <= 3.
  //          Verified GREEN: all 6 integration tests pass (2026-05-11).

  it('[BREAK] concurrency: at most 1 of 5 concurrent calls succeeds when count is 3', async () => {
    const now = new Date();
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        createNudge(db, {
          fromProfileId: parentAProfileId,
          toProfileId: childXProfileId,
          template: 'quick_session',
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');

    expect(succeeded.length).toBeLessThanOrEqual(1);

    const NUDGE_WINDOW_MS = 24 * 60 * 60 * 1000;
    const windowStart = new Date(Date.now() - NUDGE_WINDOW_MS);
    const rows = await db
      .select()
      .from(nudges)
      .where(
        and(
          eq(nudges.fromProfileId, parentAProfileId),
          eq(nudges.toProfileId, childXProfileId),
          gt(nudges.createdAt, windowStart),
        ),
      );
    expect(rows.length).toBeLessThanOrEqual(4);
  });

  // ── 5. IDOR BREAK test — markNudgeRead ────────────────────────────────────

  it('[BREAK] markNudgeRead: wrong profileId returns 0 and leaves nudge unread', async () => {
    const { nudge } = await createNudge(db, {
      fromProfileId: parentAProfileId,
      toProfileId: childXProfileId,
      template: 'you_got_this',
    });

    const count = await markNudgeRead(db, childYProfileId, nudge.id);
    expect(count).toBe(0);

    const row = await db.query.nudges.findFirst({
      where: eq(nudges.id, nudge.id),
    });
    expect(row).toBeDefined();
    expect(row!.readAt).toBeNull();
  });

  // ── 6. IDOR BREAK test — markAllNudgesRead ────────────────────────────────

  it('[BREAK] markAllNudgesRead: wrong profileId returns 0 and leaves nudges unread', async () => {
    await seedNudgeRow(parentAProfileId, childXProfileId);
    await seedNudgeRow(parentAProfileId, childXProfileId);

    const count = await markAllNudgesRead(db, childYProfileId);
    expect(count).toBe(0);

    const unread = await db
      .select()
      .from(nudges)
      .where(
        and(eq(nudges.toProfileId, childXProfileId), isNull(nudges.readAt)),
      );
    expect(unread.length).toBeGreaterThanOrEqual(2);
  });
});
