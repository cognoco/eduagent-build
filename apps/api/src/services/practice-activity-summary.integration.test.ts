import { resolve } from 'path';
import { inArray } from 'drizzle-orm';
import {
  accounts,
  celebrationEvents,
  createDatabase,
  practiceActivityEvents,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { getPracticeActivitySummary } from './practice-activity-summary';

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

const PREFIX = 'integration-practice-activity-summary';
const TEST_ACCOUNT = {
  clerkUserId: `${PREFIX}-user`,
  email: `${PREFIX}@integration.test`,
};
const OTHER_TEST_ACCOUNT = {
  clerkUserId: `${PREFIX}-other-user`,
  email: `${PREFIX}-other@integration.test`,
};

async function cleanupTestAccounts(): Promise<void> {
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

async function seedProfile(
  accountInput = TEST_ACCOUNT,
  displayName = 'Practice Summary Integration',
): Promise<string> {
  const db = createIntegrationDb();
  const [account] = await db.insert(accounts).values(accountInput).returning();
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName,
      birthYear: 2008,
      isOwner: true,
    })
    .returning();

  return profile!.id;
}

async function seedSubject(profileId: string, name: string): Promise<string> {
  const db = createIntegrationDb();
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name,
      rawInput: name,
    })
    .returning();

  return subject!.id;
}

beforeEach(async () => {
  await cleanupTestAccounts();
});

afterAll(async () => {
  await cleanupTestAccounts();
});

describe('getPracticeActivitySummary (integration)', () => {
  it('aggregates practice events, subject names, celebrations, and previous-period comparison from the real database', async () => {
    const profileId = await seedProfile();
    const otherProfileId = await seedProfile(
      OTHER_TEST_ACCOUNT,
      'Other Practice Summary Integration',
    );
    const mathSubjectId = await seedSubject(profileId, 'Mathematics');
    const biologySubjectId = await seedSubject(profileId, 'Biology');
    const otherSubjectId = await seedSubject(otherProfileId, 'Chemistry');
    const db = createIntegrationDb();

    await db.insert(practiceActivityEvents).values([
      {
        profileId,
        subjectId: mathSubjectId,
        activityType: 'quiz',
        activitySubtype: 'multiple_choice',
        completedAt: new Date('2026-05-10T12:00:00.000Z'),
        pointsEarned: 7,
        score: 2,
        total: 3,
        sourceType: 'integration_test',
        sourceId: 'current-quiz',
        dedupeKey: 'summary:current-quiz',
      },
      {
        profileId,
        subjectId: biologySubjectId,
        activityType: 'review',
        activitySubtype: 'spaced_repetition',
        completedAt: new Date('2026-05-11T12:00:00.000Z'),
        pointsEarned: 5,
        score: 1,
        total: 2,
        sourceType: 'integration_test',
        sourceId: 'current-review',
        dedupeKey: 'summary:current-review',
      },
      {
        profileId,
        subjectId: mathSubjectId,
        activityType: 'quiz',
        activitySubtype: 'multiple_choice',
        completedAt: new Date('2026-05-01T12:00:00.000Z'),
        pointsEarned: 4,
        score: 1,
        total: 2,
        sourceType: 'integration_test',
        sourceId: 'previous-quiz',
        dedupeKey: 'summary:previous-quiz',
      },
      {
        profileId,
        subjectId: mathSubjectId,
        activityType: 'dictation',
        activitySubtype: null,
        completedAt: new Date('2026-05-20T12:00:00.000Z'),
        pointsEarned: 99,
        score: 9,
        total: 9,
        sourceType: 'integration_test',
        sourceId: 'future-out-of-range',
        dedupeKey: 'summary:future-out-of-range',
      },
      {
        profileId: otherProfileId,
        subjectId: otherSubjectId,
        activityType: 'assessment',
        activitySubtype: 'diagnostic',
        completedAt: new Date('2026-05-10T12:00:00.000Z'),
        pointsEarned: 100,
        score: 10,
        total: 10,
        sourceType: 'integration_test',
        sourceId: 'other-profile',
        dedupeKey: 'summary:other-profile',
      },
    ]);

    await db.insert(celebrationEvents).values([
      {
        profileId,
        celebratedAt: new Date('2026-05-10T12:05:00.000Z'),
        celebrationType: 'milestone',
        reason: 'Current period milestone',
        sourceType: 'integration_test',
        sourceId: 'current-celebration',
        dedupeKey: 'summary:current-celebration',
      },
      {
        profileId,
        celebratedAt: new Date('2026-05-01T12:05:00.000Z'),
        celebrationType: 'milestone',
        reason: 'Previous period milestone',
        sourceType: 'integration_test',
        sourceId: 'previous-celebration',
        dedupeKey: 'summary:previous-celebration',
      },
      {
        profileId: otherProfileId,
        celebratedAt: new Date('2026-05-10T12:05:00.000Z'),
        celebrationType: 'milestone',
        reason: 'Other learner milestone',
        sourceType: 'integration_test',
        sourceId: 'other-celebration',
        dedupeKey: 'summary:other-celebration',
      },
    ]);

    const summary = await getPracticeActivitySummary(db, {
      profileId,
      period: {
        start: new Date('2026-05-08T00:00:00.000Z'),
        endExclusive: new Date('2026-05-15T00:00:00.000Z'),
      },
      previousPeriod: {
        start: new Date('2026-05-01T00:00:00.000Z'),
        endExclusive: new Date('2026-05-08T00:00:00.000Z'),
      },
    });

    expect(summary.totals).toEqual({
      activitiesCompleted: 2,
      reviewsCompleted: 1,
      pointsEarned: 12,
      celebrations: 1,
      distinctActivityTypes: 2,
    });
    expect(summary.quizzesCompleted).toBe(1);
    expect(summary.reviewsCompleted).toBe(1);
    expect(summary.scores).toEqual({
      scoredActivities: 2,
      score: 3,
      total: 5,
      accuracy: 0.6,
    });
    expect(summary.byType).toEqual([
      {
        activityType: 'quiz',
        activitySubtype: 'multiple_choice',
        count: 1,
        pointsEarned: 7,
        scoredActivities: 1,
        score: 2,
        total: 3,
      },
      {
        activityType: 'review',
        activitySubtype: 'spaced_repetition',
        count: 1,
        pointsEarned: 5,
        scoredActivities: 1,
        score: 1,
        total: 2,
      },
    ]);
    expect(summary.bySubject).toEqual([
      {
        subjectId: biologySubjectId,
        subjectName: 'Biology',
        count: 1,
        pointsEarned: 5,
        byType: [
          {
            activityType: 'review',
            activitySubtype: 'spaced_repetition',
            count: 1,
            pointsEarned: 5,
            scoredActivities: 1,
            score: 1,
            total: 2,
          },
        ],
      },
      {
        subjectId: mathSubjectId,
        subjectName: 'Mathematics',
        count: 1,
        pointsEarned: 7,
        byType: [
          {
            activityType: 'quiz',
            activitySubtype: 'multiple_choice',
            count: 1,
            pointsEarned: 7,
            scoredActivities: 1,
            score: 2,
            total: 3,
          },
        ],
      },
    ]);
    expect(summary.comparison).toEqual({
      previous: {
        activitiesCompleted: 1,
        reviewsCompleted: 0,
        pointsEarned: 4,
        celebrations: 1,
        distinctActivityTypes: 1,
      },
      delta: {
        activitiesCompleted: 1,
        reviewsCompleted: 1,
        pointsEarned: 8,
        celebrations: 0,
        distinctActivityTypes: 1,
      },
    });
  });
});
