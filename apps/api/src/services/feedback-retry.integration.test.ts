/**
 * Integration: Feedback retry queue — profileId scoping (WI-1992)
 *
 * feedback-retry.ts's own header documents `getFeedbackRetry` /
 * `deleteFeedbackRetry` as profileId-scoped so "a leaked/forged retry id
 * cannot read another user's feedback text" — a genuine security property.
 * Before this test, that property was never checked against a real database:
 * the only existing coverage (feedback-delivery-failed.test.ts) stubs the db
 * with a `.where()` chain that ignores its arguments and always returns the
 * seeded row regardless of which profileId is passed in, so a regression
 * that dropped the profileId predicate from the WHERE clause would pass
 * every existing test untouched.
 *
 * No mocks of internal services or the database — real Postgres, real
 * `feedback_retry_queue` table.
 */

import { sql } from 'drizzle-orm';
import {
  feedbackRetryQueue,
  createDatabase,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import {
  enqueueFeedbackRetry,
  getFeedbackRetry,
  deleteFeedbackRetry,
  purgeExpiredFeedbackRetries,
} from './feedback-retry';

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

function createIntegrationDb(): Database {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Seed helpers — unique prefix so parallel test files don't collide.
// profileId on this table is bare TEXT (not an FK — see support.ts), so no
// identity-v2 seeding is required.
// ---------------------------------------------------------------------------

const PREFIX = `integration-feedback-retry-${generateUUIDv7()}`;
const PROFILE_A = `${PREFIX}-profile-a`;
const PROFILE_B = `${PREFIX}-profile-b`;

async function cleanupTestRows() {
  const db = createIntegrationDb();
  await db
    .delete(feedbackRetryQueue)
    .where(sql`${feedbackRetryQueue.profileId} LIKE ${`${PREFIX}-%`}`);
}

beforeEach(async () => {
  await cleanupTestRows();
});

afterAll(async () => {
  await cleanupTestRows();
});

function feedbackInput(profileId: string) {
  return {
    profileId,
    userId: `${profileId}-user`,
    category: 'bug',
    message: 'A feedback message that must not leak across profiles',
    metaLines: `Profile ID: ${profileId.slice(0, 8)}…`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('feedback-retry service (integration) [WI-1992]', () => {
  it('round-trips a parked row for the owning profileId', async () => {
    const db = createIntegrationDb();
    const retryId = await enqueueFeedbackRetry(db, feedbackInput(PROFILE_A));
    expect(retryId).not.toBeNull();

    const row = await getFeedbackRetry(db, PROFILE_A, retryId!);
    expect(row).not.toBeNull();
    expect(row!.profileId).toBe(PROFILE_A);
    expect(row!.message).toBe(feedbackInput(PROFILE_A).message);
  });

  it('getFeedbackRetry returns null when a different profileId requests the row (cross-profile isolation)', async () => {
    const db = createIntegrationDb();
    const retryId = await enqueueFeedbackRetry(db, feedbackInput(PROFILE_A));
    expect(retryId).not.toBeNull();

    const rowForOwner = await getFeedbackRetry(db, PROFILE_A, retryId!);
    expect(rowForOwner).not.toBeNull();

    const rowForOther = await getFeedbackRetry(db, PROFILE_B, retryId!);
    expect(rowForOther).toBeNull();
  });

  it('deleteFeedbackRetry scoped to a different profileId is a no-op — the row survives', async () => {
    const db = createIntegrationDb();
    const retryId = await enqueueFeedbackRetry(db, feedbackInput(PROFILE_A));
    expect(retryId).not.toBeNull();

    await deleteFeedbackRetry(db, PROFILE_B, retryId!);

    const stillThere = await getFeedbackRetry(db, PROFILE_A, retryId!);
    expect(stillThere).not.toBeNull();
  });

  it('deleteFeedbackRetry scoped to the owning profileId removes the row', async () => {
    const db = createIntegrationDb();
    const retryId = await enqueueFeedbackRetry(db, feedbackInput(PROFILE_A));
    expect(retryId).not.toBeNull();

    await deleteFeedbackRetry(db, PROFILE_A, retryId!);

    const gone = await getFeedbackRetry(db, PROFILE_A, retryId!);
    expect(gone).toBeNull();
  });

  it('purgeExpiredFeedbackRetries deletes rows older than the cutoff and leaves newer rows', async () => {
    const db = createIntegrationDb();
    const oldRetryId = generateUUIDv7();
    const freshRetryId = generateUUIDv7();
    const now = new Date();
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

    await db.insert(feedbackRetryQueue).values([
      {
        id: oldRetryId,
        ...feedbackInput(PROFILE_A),
        createdAt: eightDaysAgo,
      },
      {
        id: freshRetryId,
        ...feedbackInput(PROFILE_B),
        createdAt: now,
      },
    ]);

    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const deletedCount = await purgeExpiredFeedbackRetries(db, cutoff);
    expect(deletedCount).toBe(1);

    expect(await getFeedbackRetry(db, PROFILE_A, oldRetryId)).toBeNull();
    expect(await getFeedbackRetry(db, PROFILE_B, freshRetryId)).not.toBeNull();
  });
});
