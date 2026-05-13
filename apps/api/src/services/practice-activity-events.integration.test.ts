import { resolve } from 'path';
import { inArray } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
  practiceActivityEvents,
  profiles,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { recordPracticeActivityEvent } from './practice-activity-events';

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

const PREFIX = 'integration-practice-activity-events';
const TEST_ACCOUNT = {
  clerkUserId: `${PREFIX}-user`,
  email: `${PREFIX}@integration.test`,
};

async function cleanupTestAccount(): Promise<void> {
  const db = createIntegrationDb();
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(inArray(accounts.clerkUserId, [TEST_ACCOUNT.clerkUserId]));

  if (rows.length > 0) {
    await db.delete(accounts).where(
      inArray(
        accounts.id,
        rows.map((row) => row.id),
      ),
    );
  }
}

async function seedProfile(): Promise<string> {
  const db = createIntegrationDb();
  const [account] = await db.insert(accounts).values(TEST_ACCOUNT).returning();
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Practice Activity Integration',
      birthYear: 2008,
      isOwner: true,
    })
    .returning();

  return profile!.id;
}

beforeEach(async () => {
  await cleanupTestAccount();
});

afterAll(async () => {
  await cleanupTestAccount();
});

describe('recordPracticeActivityEvent (integration)', () => {
  it('dedupes duplicate profile/dedupeKey inserts through the real unique constraint', async () => {
    const profileId = await seedProfile();
    const db = createIntegrationDb();
    const input = {
      profileId,
      activityType: 'quiz' as const,
      activitySubtype: 'multiple_choice',
      completedAt: new Date('2026-05-13T12:00:00.000Z'),
      pointsEarned: 10,
      score: 1,
      total: 1,
      sourceType: 'integration_test',
      sourceId: 'same-source-id',
      dedupeKey: 'integration-practice-activity-events:same-key',
      metadata: { test: true },
    };

    const first = await recordPracticeActivityEvent(db, input);
    const duplicate = await recordPracticeActivityEvent(db, input);

    expect(first).not.toBeNull();
    expect(duplicate).toBeNull();

    const rows = await db
      .select({ id: practiceActivityEvents.id })
      .from(practiceActivityEvents)
      .where(inArray(practiceActivityEvents.profileId, [profileId]));
    expect(rows).toHaveLength(1);
  });
});
