import { resolve } from 'path';
import { inArray } from 'drizzle-orm';
import {
  createDatabase,
  generateUUIDv7,
  practiceActivityEvents,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

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

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function cleanupTestAccount(): Promise<void> {
  const db = createIntegrationDb();
  await deleteV2IdentitiesForTest(db, {
    accountIds: [...seededAccountIds],
    profileIds: [...seededProfileIds],
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

// [WI-1128] Key clerkUserId/email off the freshly-generated accountId —
// seedProfile() is called from multiple tests via beforeEach cleanup; a
// fixed string (even per "kind": test vs other) collides with legacy
// `accounts` unique columns across calls (the onConflictDoNothing
// silently no-ops, leaving profiles.account_id FK dangling for the fresh
// accountId).
async function seedProfile(kind: 'test' | 'other' = 'test'): Promise<string> {
  const db = createIntegrationDb();
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: 'Practice Activity Integration',
    birthYear: 2008,
    clerkUserId: `${PREFIX}-${kind}-${accountId}`,
    email: `${PREFIX}-${kind}-${accountId}@integration.test`,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  return profileId;
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

  it('isolates dedupe keys by profile so one learner cannot suppress another learner activity', async () => {
    const profileId = await seedProfile();
    const otherProfileId = await seedProfile('other');
    const db = createIntegrationDb();
    const sharedInput = {
      activityType: 'review' as const,
      activitySubtype: 'spaced_repetition',
      completedAt: new Date('2026-05-13T12:00:00.000Z'),
      pointsEarned: 6,
      score: 2,
      total: 3,
      sourceType: 'integration_test',
      sourceId: 'shared-source-id',
      dedupeKey: 'integration-practice-activity-events:shared-key',
      metadata: { test: true },
    };

    const first = await recordPracticeActivityEvent(db, {
      ...sharedInput,
      profileId,
    });
    const secondProfile = await recordPracticeActivityEvent(db, {
      ...sharedInput,
      profileId: otherProfileId,
    });
    const duplicateFirst = await recordPracticeActivityEvent(db, {
      ...sharedInput,
      profileId,
    });

    expect(first).not.toBeNull();
    expect(secondProfile).not.toBeNull();
    expect(duplicateFirst).toBeNull();

    const rows = await db
      .select({ profileId: practiceActivityEvents.profileId })
      .from(practiceActivityEvents)
      .where(
        inArray(practiceActivityEvents.profileId, [profileId, otherProfileId]),
      );
    expect(rows).toEqual(
      expect.arrayContaining([{ profileId }, { profileId: otherProfileId }]),
    );
    expect(rows).toHaveLength(2);
  });
});
