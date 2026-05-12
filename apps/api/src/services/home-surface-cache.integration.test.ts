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

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  profiles,
  coachingCardCache,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import {
  mergeHomeSurfaceCacheData,
  readHomeSurfaceCacheData,
} from './home-surface-cache';
import type { HomeSurfaceCacheData } from './home-surface-cache';
import type { HomeCard } from '@eduagent/schemas';

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

const PREFIX = 'integration-home-cache-bug859';
const ACCOUNT = {
  clerkUserId: `${PREFIX}-user`,
  email: `${PREFIX}@integration.test`,
};

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

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
      displayName: 'Cache Test User',
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
  const ids = found.map((a: typeof accounts.$inferSelect) => a.id);
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

describe('[BUG-859] mergeHomeSurfaceCacheData concurrent lost-update guard (integration)', () => {
  it('[BUG-859] concurrent merges each increment rankedHomeCards length without lost updates', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    // Each merge appends one home card entry (simulating a concurrent
    // "record an interaction / add a card" operation).  After N=3 concurrent
    // merges the rankedHomeCards array must contain exactly N entries — not
    // fewer (which would happen if the last-writer-wins bug were still present).
    const makeCard = (label: string) => ({
      id: `card-${label}` as import('@eduagent/schemas').HomeCardId,
      type: 'streak' as const,
      priority: 1,
      title: label,
      body: label,
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    });

    const mergeAppend =
      (label: string) =>
      (current: HomeSurfaceCacheData): HomeSurfaceCacheData => ({
        ...current,
        rankedHomeCards: [...current.rankedHomeCards, makeCard(label)],
      });

    // Fire 3 concurrent merges
    const results = await Promise.allSettled([
      mergeHomeSurfaceCacheData(db, profile.id, mergeAppend('alpha')),
      mergeHomeSurfaceCacheData(db, profile.id, mergeAppend('beta')),
      mergeHomeSurfaceCacheData(db, profile.id, mergeAppend('gamma')),
    ]);

    // None should reject
    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures).toHaveLength(0);

    // Read the committed state and check the invariant
    const { data } = await readHomeSurfaceCacheData(db, profile.id);
    // With SELECT FOR UPDATE serialising merges each card must appear exactly once.
    expect(data.rankedHomeCards).toHaveLength(3);
    const labels = data.rankedHomeCards.map((c: HomeCard) => c.id).sort();
    expect(labels).toEqual(['card-alpha', 'card-beta', 'card-gamma']);
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
