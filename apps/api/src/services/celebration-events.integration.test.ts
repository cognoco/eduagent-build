import { resolve } from 'path';
import { inArray } from 'drizzle-orm';
import {
  accounts,
  celebrationEvents,
  createDatabase,
  profiles,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { recordCelebrationEvent } from './celebration-events';

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

const PREFIX = 'integration-celebration-events';
const TEST_ACCOUNT = {
  clerkUserId: `${PREFIX}-user`,
  email: `${PREFIX}@integration.test`,
};
const OTHER_TEST_ACCOUNT = {
  clerkUserId: `${PREFIX}-other-user`,
  email: `${PREFIX}-other@integration.test`,
};

async function cleanupTestAccount(): Promise<void> {
  const db = createIntegrationDb();
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      inArray(accounts.clerkUserId, [
        TEST_ACCOUNT.clerkUserId,
        OTHER_TEST_ACCOUNT.clerkUserId,
      ]),
    );

  if (rows.length > 0) {
    await db.delete(accounts).where(
      inArray(
        accounts.id,
        rows.map((row) => row.id),
      ),
    );
  }
}

async function seedProfile(accountInput = TEST_ACCOUNT): Promise<string> {
  const db = createIntegrationDb();
  const [account] = await db.insert(accounts).values(accountInput).returning();
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Celebration Events Integration',
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

describe('recordCelebrationEvent (integration)', () => {
  it('dedupes duplicate profile/dedupeKey inserts through the real unique constraint', async () => {
    const profileId = await seedProfile();
    const db = createIntegrationDb();
    const input = {
      profileId,
      celebratedAt: new Date('2026-05-13T12:00:00.000Z'),
      celebrationType: 'comet',
      reason: 'topic_mastered',
      sourceType: 'session_event',
      sourceId: 'same-source-id',
      dedupeKey: 'integration-celebration-events:same-key',
      metadata: { test: true },
    };

    const first = await recordCelebrationEvent(db, input);
    const duplicate = await recordCelebrationEvent(db, input);

    expect(first).not.toBeNull();
    expect(duplicate).toBeNull();

    const rows = await db
      .select({ id: celebrationEvents.id })
      .from(celebrationEvents)
      .where(inArray(celebrationEvents.profileId, [profileId]));
    expect(rows).toHaveLength(1);
  });

  it('isolates dedupe keys by profile so one learner cannot suppress another learner celebration', async () => {
    const profileId = await seedProfile();
    const otherProfileId = await seedProfile(OTHER_TEST_ACCOUNT);
    const db = createIntegrationDb();
    const sharedInput = {
      celebratedAt: new Date('2026-05-13T12:00:00.000Z'),
      celebrationType: 'orions_belt',
      reason: 'curriculum_complete',
      sourceType: 'session_event',
      sourceId: 'shared-source-id',
      dedupeKey: 'integration-celebration-events:shared-key',
      metadata: { test: true },
    };

    const first = await recordCelebrationEvent(db, {
      ...sharedInput,
      profileId,
    });
    const secondProfile = await recordCelebrationEvent(db, {
      ...sharedInput,
      profileId: otherProfileId,
    });
    const duplicateFirst = await recordCelebrationEvent(db, {
      ...sharedInput,
      profileId,
    });

    expect(first).not.toBeNull();
    expect(secondProfile).not.toBeNull();
    expect(duplicateFirst).toBeNull();

    const rows = await db
      .select({ profileId: celebrationEvents.profileId })
      .from(celebrationEvents)
      .where(inArray(celebrationEvents.profileId, [profileId, otherProfileId]));
    expect(rows).toEqual(
      expect.arrayContaining([{ profileId }, { profileId: otherProfileId }]),
    );
    expect(rows).toHaveLength(2);
  });
});
