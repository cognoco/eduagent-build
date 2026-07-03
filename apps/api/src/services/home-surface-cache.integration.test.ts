/**
 * Integration: Home Surface Cache — concurrent merge guard (BUG-859)
 *
 * Before the neon-serverless driver swap db.transaction() was a no-op,
 * so the SELECT FOR UPDATE that protects mergeHomeSurfaceCacheData had no
 * effect ("Bug #25" in the code comment).  Two concurrent merges could each
 * read the same stale snapshot and the last write won, silently discarding
 * the other's increments.
 *
 * With real ACID transactions the FOR UPDATE row lock serialises concurrent
 * merges: the second waits for the first to commit, then reads the already-
 * updated row.  After N concurrent increments the final count must equal N,
 * not some smaller number.
 *
 * No mocks of internal services or database.
 */

import { eq } from 'drizzle-orm';
import { coachingCardCache, createDatabase, person } from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import {
  mergeHomeSurfaceCacheData,
  readHomeSurfaceCacheData,
} from './home-surface-cache';
import type { HomeSurfaceCacheData } from './home-surface-cache';
import type { HomeCard, HomeCardId } from '@eduagent/schemas';

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

// [WI-1128] Legacy `accounts`/`profiles` are dropped post-M-DROP, and v2
// `person` has no email column (email lives on `login`, which this test
// doesn't need — coaching_card_cache.profile_id FKs `person` directly). Use a
// deterministic id instead of an email-based lookup so cleanup() can find the
// row before the seed has run (beforeEach cleanup precedes the first seed).
const PROFILE_ID = 'a0000000-0000-4000-8000-000000000859';

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedAccountAndProfile() {
  const db = createIntegrationDb();
  const [profile] = await db
    .insert(person)
    .values({
      id: PROFILE_ID,
      displayName: 'Cache Test User',
      birthDate: '2000-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning();
  return { profile: profile! };
}

async function cleanup() {
  const db = createIntegrationDb();
  // Deleting person cascades coaching_card_cache (onDelete: 'cascade').
  await db.delete(person).where(eq(person.id, PROFILE_ID));
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

describe('[BUG-859] mergeHomeSurfaceCacheData concurrent lost-update guard (integration)', () => {
  it('[BUG-859] concurrent merges each increment rankedHomeCards length without lost updates', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    // Each merge appends one home card entry (simulating a concurrent
    // "record an interaction / add a card" operation).  After N=3 concurrent
    // merges the rankedHomeCards array must contain exactly N entries — not
    // fewer (which would happen if the last-writer-wins bug were still present).
    const makeCard = (id: HomeCardId, label: string): HomeCard => ({
      id,
      title: label,
      subtitle: label,
      primaryLabel: label,
      priority: 1,
    });

    const mergeAppend =
      (id: HomeCardId, label: string) =>
      (current: HomeSurfaceCacheData): HomeSurfaceCacheData => ({
        ...current,
        rankedHomeCards: [...current.rankedHomeCards, makeCard(id, label)],
      });

    // Fire 3 concurrent merges
    const results = await Promise.allSettled([
      mergeHomeSurfaceCacheData(db, profile.id, mergeAppend('study', 'alpha')),
      mergeHomeSurfaceCacheData(db, profile.id, mergeAppend('review', 'beta')),
      mergeHomeSurfaceCacheData(
        db,
        profile.id,
        mergeAppend('homework', 'gamma'),
      ),
    ]);

    // None should reject
    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures).toHaveLength(0);

    // Read the committed state and check the invariant
    const cacheResult = await readHomeSurfaceCacheData(db, profile.id);
    const data = cacheResult!.data;
    // With SELECT FOR UPDATE serialising merges each card must appear exactly once.
    expect(data.rankedHomeCards).toHaveLength(3);
    const labels = data.rankedHomeCards.map((c: HomeCard) => c.id).sort();
    expect(labels).toEqual(['homework', 'review', 'study']);
  });

  it('[BUG-859] first-write idempotency — concurrent merges on a non-existent row create exactly one cache row', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    // No prior cache row; two concurrent merges both trigger the
    // INSERT … ON CONFLICT DO NOTHING bootstrap path.
    await Promise.all([
      mergeHomeSurfaceCacheData(db, profile.id, (c: HomeSurfaceCacheData) => c),
      mergeHomeSurfaceCacheData(db, profile.id, (c: HomeSurfaceCacheData) => c),
    ]);

    const rows = await db.query.coachingCardCache.findMany({
      where: eq(coachingCardCache.profileId, profile.id),
    });
    // Exactly one cache row — the ON CONFLICT DO NOTHING guard holds.
    expect(rows).toHaveLength(1);
  });
});
