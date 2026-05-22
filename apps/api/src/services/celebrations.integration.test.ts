/**
 * Integration: queueCelebration nested-transaction guard (BUG-467)
 *
 * queueCelebration wraps its writes in db.transaction(). Internally it calls
 * writeHomeSurfacePendingCelebrations -> mergeHomeSurfaceCacheData, which
 * previously opened its OWN db.transaction(), producing a nested transaction
 * on neon-serverless. Nested transactions on neon-serverless either throw or
 * silently degrade the SELECT FOR UPDATE row lock that serialises concurrent
 * celebration writes, leading to lost-update clobbering of pendingCelebrations.
 *
 * After the fix, queueCelebration passes { inTransaction: true } so
 * mergeHomeSurfaceCacheData skips its inner db.transaction() and reuses the
 * outer one.
 *
 * No mocks of internal services or database.
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
import type { PendingCelebration } from '@eduagent/schemas';

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

const PREFIX = 'integration-celebrations-bug467';
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
      displayName: 'Celebration Test User',
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

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe('[BUG-467] queueCelebration nested-transaction guard (integration)', () => {
  it('[BUG-467] does not throw on first queueCelebration call (nested-tx smoke)', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    await expect(
      queueCelebration(db, profile.id, 'comet', 'topic_mastered', 'Algebra'),
    ).resolves.not.toThrow();

    const row = await db.query.coachingCardCache.findFirst({
      where: eq(coachingCardCache.profileId, profile.id),
    });
    const pending =
      (row?.pendingCelebrations as PendingCelebration[] | null) ?? [];
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      celebration: 'comet',
      reason: 'topic_mastered',
      detail: 'Algebra',
    });
  });

  it('[BUG-467] concurrent queueCelebration calls both persist without lost update', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    const results = await Promise.allSettled([
      queueCelebration(db, profile.id, 'comet', 'topic_mastered', 'Algebra'),
      queueCelebration(
        db,
        profile.id,
        'polar_star',
        'evaluate_success',
        'Geometry',
      ),
    ]);

    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures).toHaveLength(0);

    const row = await db.query.coachingCardCache.findFirst({
      where: eq(coachingCardCache.profileId, profile.id),
    });
    const pending =
      (row?.pendingCelebrations as PendingCelebration[] | null) ?? [];

    expect(pending).toHaveLength(2);
    const reasons = pending.map((p) => p.reason).sort();
    expect(reasons).toEqual(['evaluate_success', 'topic_mastered']);
  });

  it('[BUG-467] celebration_events row is recorded atomically with pendingCelebrations', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    await queueCelebration(
      db,
      profile.id,
      'orions_belt',
      'curriculum_complete',
      'Physics',
    );

    const events = await db
      .select({ id: celebrationEvents.id, detail: celebrationEvents.sourceId })
      .from(celebrationEvents)
      .where(eq(celebrationEvents.profileId, profile.id));

    expect(events).toHaveLength(1);
    expect(events[0]!.detail).toBe('Physics');
  });
});
