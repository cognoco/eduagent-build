/**
 * Integration: queueCelebration lost-update guards (F-170, F-171)
 *
 * F-171 — the read that fed the dedup/append computation used to happen OUTSIDE
 *   the SELECT ... FOR UPDATE lock (a pre-transaction findHomeSurfaceCache), so
 *   concurrent calls computed their merged array from the same stale snapshot.
 * F-170 — even inside the transaction, the write supplied a precomputed
 *   pendingCelebrations array that bypassed the locked row's current value, so
 *   the held lock did not actually merge — the second writer overwrote the
 *   first's append.
 *
 * Both are closed by computing the read-dedup-append INSIDE the lock (the
 * computePending reducer). After N concurrent distinct queueCelebration calls
 * the persisted pendingCelebrations must contain ALL N entries.
 *
 * No mocks of internal services or database — real Neon connection.
 */

import { resolve } from 'path';
import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  celebrationEvents,
  coachingCardCache,
  createDatabase,
  profiles,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import type {
  CelebrationName,
  CelebrationReason,
  PendingCelebration,
} from '@eduagent/schemas';

import { queueCelebration } from './celebrations';

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

const PREFIX = 'integration-celebrations-race';
const ACCOUNT = {
  clerkUserId: `${PREFIX}-user`,
  email: `${PREFIX}@integration.test`,
};

async function seedAccountAndProfile() {
  const db = createIntegrationDb();
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId: ACCOUNT.clerkUserId, email: ACCOUNT.email })
    .returning();
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Celebration Race User',
      birthYear: 2000,
      isOwner: true,
    })
    .returning();
  return { account: account!, profile: profile! };
}

async function cleanup() {
  const db = createIntegrationDb();
  const found = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.email, ACCOUNT.email));
  const ids = found.map((a) => a.id);
  if (ids.length > 0) {
    await db.delete(accounts).where(inArray(accounts.id, ids));
  }
}

async function readPending(
  db: ReturnType<typeof createIntegrationDb>,
  profileId: string,
): Promise<PendingCelebration[]> {
  const row = await db.query.coachingCardCache.findFirst({
    where: eq(coachingCardCache.profileId, profileId),
  });
  return (row?.pendingCelebrations as PendingCelebration[] | null) ?? [];
}

async function countCelebrationEvents(
  db: ReturnType<typeof createIntegrationDb>,
  profileId: string,
): Promise<number> {
  const rows = await db
    .select({ id: celebrationEvents.id })
    .from(celebrationEvents)
    .where(eq(celebrationEvents.profileId, profileId));
  return rows.length;
}

// Distinct (celebration, reason, detail) tuples so none dedupes against another.
const DISTINCT: Array<[CelebrationName, CelebrationReason, string]> = [
  ['comet', 'topic_mastered', 'Algebra'],
  ['polar_star', 'evaluate_success', 'Geometry'],
  ['orions_belt', 'curriculum_complete', 'Physics'],
  ['comet', 'teach_back_success', 'Chemistry'],
  ['polar_star', 'streak_7', 'Biology'],
  ['orions_belt', 'streak_30', 'History'],
  ['comet', 'evaluate_success', 'Latin'],
  ['polar_star', 'topic_mastered', 'Music'],
  ['orions_belt', 'teach_back_success', 'Art'],
  ['comet', 'curriculum_complete', 'Coding'],
];

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe('[F-170/F-171] queueCelebration concurrent lost-update guard (integration)', () => {
  it('[F-170] N concurrent distinct queueCelebration calls all persist (no lost append)', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    const N = 5;
    const batch = DISTINCT.slice(0, N);
    const results = await Promise.allSettled(
      batch.map(([celebration, reason, detail]) =>
        queueCelebration(db, profile.id, celebration, reason, detail),
      ),
    );

    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures).toHaveLength(0);

    const pending = await readPending(db, profile.id);
    // Pre-fix: < N (concurrent appends overwrite each other). Post-fix: exactly N.
    expect(pending).toHaveLength(N);
    const details = pending.map((p) => p.detail).sort();
    expect(details).toEqual(batch.map(([, , d]) => d).sort());

    // Each non-duplicate append must atomically record one celebration event —
    // confirms `appended` was set correctly for all N inside the lock.
    expect(await countCelebrationEvents(db, profile.id)).toBe(N);
  });

  it('[F-171] read-compute-write window is inside the lock across two concurrent waves', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    // Two back-to-back concurrent waves maximise the pre-lock-read interleave
    // that the old outside-the-lock read exhibited.
    const all = DISTINCT.slice(0, 10);
    const fire = (slice: Array<[CelebrationName, CelebrationReason, string]>) =>
      Promise.allSettled(
        slice.map(([celebration, reason, detail]) =>
          queueCelebration(db, profile.id, celebration, reason, detail),
        ),
      );

    const [waveA, waveB] = await Promise.all([
      fire(all.slice(0, 5)),
      fire(all.slice(5, 10)),
    ]);

    const failures = [...waveA, ...waveB].filter(
      (r) => r.status === 'rejected',
    );
    expect(failures).toHaveLength(0);

    const pending = await readPending(db, profile.id);
    // Pre-fix loses entries (each call's computing read predates the lock).
    // Post-fix the lock serialises all 10 distinct appends.
    expect(pending).toHaveLength(10);
    const details = pending.map((p) => p.detail).sort();
    expect(details).toEqual(all.map(([, , d]) => d).sort());

    expect(await countCelebrationEvents(db, profile.id)).toBe(10);
  });
});
