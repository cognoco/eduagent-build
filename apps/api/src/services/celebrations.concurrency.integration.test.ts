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
import { eq } from 'drizzle-orm';
import {
  celebrationEvents,
  coachingCardCache,
  createDatabase,
  generateUUIDv7,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import type {
  CelebrationName,
  CelebrationReason,
  PendingCelebration,
} from '@eduagent/schemas';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

import {
  getPendingCelebrations,
  markCelebrationsSeen,
  queueCelebration,
} from './celebrations';

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

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedAccountAndProfile() {
  const db = createIntegrationDb();
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  // [WI-1128] Key clerkUserId/email off the freshly-generated accountId —
  // this is called once per test via beforeEach cleanup; a fixed string
  // (even with a per-run suffix) collides with legacy `accounts` unique
  // columns across calls within the same run (the onConflictDoNothing
  // silently no-ops, leaving profiles.account_id FK dangling for the
  // fresh accountId).
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: 'Celebration Race User',
    birthYear: 2000,
    clerkUserId: `integration-celebrations-race-${accountId}`,
    email: `integration-celebrations-race-${accountId}@integration.test`,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);
  return { account: { id: accountId }, profile: { id: profileId } };
}

async function cleanup() {
  const db = createIntegrationDb();
  await deleteV2IdentitiesForTest(db, {
    accountIds: [...seededAccountIds],
    profileIds: [...seededProfileIds],
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
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

  it('[F-171] a celebration queued after markCelebrationsSeen stays visible to the child', async () => {
    // Forward guard for the queue-vs-seen interleave (CodeRabbit #1126). The
    // appended entry's queuedAt is stamped INSIDE the row lock, so a celebration
    // committed after a markCelebrationsSeen('child') carries a queuedAt strictly
    // later than seenAt and is not hidden by filterPendingCelebrations (which
    // drops entries with queuedAt <= seenAt). If queuedAt were captured before
    // acquiring the lock and a seen-update committed in the interim, the entry
    // would persist with queuedAt <= seenAt and vanish from the child's view.
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    // Seed an earlier celebration so a coaching_card_cache row exists (a bare
    // markCelebrationsSeen is a no-op when no row exists yet) and so the child
    // has something to "see".
    await queueCelebration(db, profile.id, 'polar_star', 'streak_7', 'Warmup');
    await markCelebrationsSeen(db, profile.id, 'child');
    // Strictly-later wall clock than the seen timestamp, independent of clock
    // resolution, so the assertion isolates the stamp-location invariant.
    await new Promise((r) => setTimeout(r, 1100));
    await queueCelebration(
      db,
      profile.id,
      'comet',
      'topic_mastered',
      'Algebra',
    );

    // Only the post-seen celebration is visible to the child; the warmup was
    // marked seen.
    const visible = await getPendingCelebrations(db, profile.id, 'child');
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({
      celebration: 'comet',
      reason: 'topic_mastered',
      detail: 'Algebra',
    });

    // The persisted queuedAt must be later than the seen timestamp — proving it
    // was stamped at/after lock-acquisition, not before the seen-update.
    const row = await db.query.coachingCardCache.findFirst({
      where: eq(coachingCardCache.profileId, profile.id),
    });
    const seenAt = row?.celebrationsSeenByChild ?? null;
    const entry = (
      (row?.pendingCelebrations as PendingCelebration[] | null) ?? []
    ).find((e) => e.detail === 'Algebra');
    expect(seenAt).not.toBeNull();
    expect(entry).toBeDefined();
    expect(new Date(entry!.queuedAt).getTime()).toBeGreaterThan(
      seenAt!.getTime(),
    );
  });
});
