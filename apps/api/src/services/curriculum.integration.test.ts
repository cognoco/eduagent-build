import { eq, like } from 'drizzle-orm';
import { resolve } from 'path';
import {
  accounts,
  assessments,
  curriculumBooks,
  curricula,
  curriculumTopics,
  createDatabase,
  generateUUIDv7,
  learningSessions,
  needsDeepeningTopics,
  profiles,
  retentionCards,
  sessionSummaries,
  subjects,
  xpLedger,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  deleteTopicIfSafe,
  releaseBookGenerationClaimIfEmpty,
} from './curriculum';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

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

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integration-curriculum-release-${RUN_ID}`;

async function cleanupByPrefix(database: Database): Promise<void> {
  await database
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
}

async function seedProfiles(database: Database, suffix = generateUUIDv7()) {
  const [ownerAccount] = await database
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}-${suffix}-owner`,
      email: `${CLERK_PREFIX}-${suffix}-owner@test.invalid`,
    })
    .returning({ id: accounts.id });
  const [attackerAccount] = await database
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}-${suffix}-attacker`,
      email: `${CLERK_PREFIX}-${suffix}-attacker@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [ownerProfile] = await database
    .insert(profiles)
    .values({
      accountId: ownerAccount!.id,
      displayName: 'Claim Owner',
      birthYear: 2011,
      isOwner: true,
    })
    .returning({ id: profiles.id });
  const [attackerProfile] = await database
    .insert(profiles)
    .values({
      accountId: attackerAccount!.id,
      displayName: 'Claim Attacker',
      birthYear: 2011,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  return {
    ownerProfileId: ownerProfile!.id,
    attackerProfileId: attackerProfile!.id,
  };
}

async function seedClaimedEmptyBook(database: Database, profileId: string) {
  const [subject] = await database
    .insert(subjects)
    .values({
      profileId,
      name: `Release Guard ${RUN_ID}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: 'Guarded Book',
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });

  return { subjectId: subject!.id, bookId: book!.id };
}

async function seedFiledTopicFixture(
  database: Database,
  profileId: string,
  options: {
    filedFrom?: 'pre_generated' | 'session_filing' | 'freeform_filing';
    topicSessionId?: string;
  } = {},
) {
  const suffix = generateUUIDv7();
  const [subject] = await database
    .insert(subjects)
    .values({
      profileId,
      name: `Safe Delete ${suffix}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [curriculum] = await database
    .insert(curricula)
    .values({
      subjectId: subject!.id,
      version: 1,
    })
    .returning({ id: curricula.id });

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `Filed Book ${suffix}`,
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });

  const [session] = await database
    .insert(learningSessions)
    .values({
      profileId,
      subjectId: subject!.id,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 3,
      metadata: { effectiveMode: 'freeform' },
    })
    .returning({ id: learningSessions.id });

  const [topic] = await database
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: `Filed Topic ${suffix}`,
      description: 'Auto-created from a filing result.',
      sortOrder: 0,
      relevance: 'recommended',
      source: 'generated',
      estimatedMinutes: 20,
      filedFrom: options.filedFrom ?? 'freeform_filing',
      sessionId: options.topicSessionId ?? session!.id,
    })
    .returning({ id: curriculumTopics.id });

  return {
    subjectId: subject!.id,
    sessionId: session!.id,
    topicId: topic!.id,
  };
}

async function expectTopicExists(
  database: Database,
  topicId: string,
): Promise<boolean> {
  const row = await database.query.curriculumTopics.findFirst({
    where: eq(curriculumTopics.id, topicId),
  });
  return !!row;
}

describeIfDb('releaseBookGenerationClaimIfEmpty (integration)', () => {
  let db: Database;

  beforeAll(async () => {
    db = createIntegrationDb();
    await cleanupByPrefix(db);
  });

  afterAll(async () => {
    await cleanupByPrefix(db);
  });

  it('[WI-78 review] does not clear another profile generation claim', async () => {
    const { ownerProfileId, attackerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedClaimedEmptyBook(
      db,
      ownerProfileId,
    );

    await releaseBookGenerationClaimIfEmpty(
      db,
      subjectId,
      bookId,
      attackerProfileId,
    );

    const row = await db.query.curriculumBooks.findFirst({
      where: eq(curriculumBooks.id, bookId),
    });
    expect(row!.topicsGenerated).toBe(true);
  });
});

describeIfDb('deleteTopicIfSafe (integration)', () => {
  let db: Database;

  beforeAll(async () => {
    db = createIntegrationDb();
    await cleanupByPrefix(db);
  });

  afterAll(async () => {
    await cleanupByPrefix(db);
  });

  it('deletes an auto-created freeform filing topic for the owning profile and session when it has no references', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { sessionId, topicId } = await seedFiledTopicFixture(
      db,
      ownerProfileId,
    );

    const result = await deleteTopicIfSafe(
      db,
      ownerProfileId,
      sessionId,
      topicId,
    );

    expect(result).toEqual({ deleted: true });
    await expect(expectTopicExists(db, topicId)).resolves.toBe(false);
  });

  it('refuses to delete another profile topic', async () => {
    const { ownerProfileId, attackerProfileId } = await seedProfiles(db);
    const { sessionId, topicId } = await seedFiledTopicFixture(
      db,
      ownerProfileId,
    );

    const result = await deleteTopicIfSafe(
      db,
      attackerProfileId,
      sessionId,
      topicId,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_not_found_or_not_owned',
    });
    await expect(expectTopicExists(db, topicId)).resolves.toBe(true);
  });

  it('refuses to delete a topic filed for a different session', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const otherSessionId = generateUUIDv7();
    const { sessionId, topicId } = await seedFiledTopicFixture(
      db,
      ownerProfileId,
      { topicSessionId: otherSessionId },
    );

    const result = await deleteTopicIfSafe(
      db,
      ownerProfileId,
      sessionId,
      topicId,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_session_mismatch',
    });
    await expect(expectTopicExists(db, topicId)).resolves.toBe(true);
  });

  it('refuses to delete a hand-created or pre-generated topic', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { sessionId, topicId } = await seedFiledTopicFixture(
      db,
      ownerProfileId,
      { filedFrom: 'pre_generated' },
    );

    const result = await deleteTopicIfSafe(
      db,
      ownerProfileId,
      sessionId,
      topicId,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_not_auto_filed',
    });
    await expect(expectTopicExists(db, topicId)).resolves.toBe(true);
  });

  it('refuses to delete a topic still referenced by a learning session', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const fixture = await seedFiledTopicFixture(db, ownerProfileId);
    await db.insert(learningSessions).values({
      profileId: ownerProfileId,
      subjectId: fixture.subjectId,
      topicId: fixture.topicId,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 1,
    });

    const result = await deleteTopicIfSafe(
      db,
      ownerProfileId,
      fixture.sessionId,
      fixture.topicId,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_has_session_references',
    });
    await expect(expectTopicExists(db, fixture.topicId)).resolves.toBe(true);
  });

  it.each([
    [
      'retention card',
      async (
        database: Database,
        fixture: Awaited<ReturnType<typeof seedFiledTopicFixture>>,
        profileId: string,
      ) => {
        await database.insert(retentionCards).values({
          profileId,
          topicId: fixture.topicId,
          xpStatus: 'pending',
        });
      },
    ],
    [
      'assessment',
      async (
        database: Database,
        fixture: Awaited<ReturnType<typeof seedFiledTopicFixture>>,
        profileId: string,
      ) => {
        await database.insert(assessments).values({
          profileId,
          subjectId: fixture.subjectId,
          topicId: fixture.topicId,
          sessionId: fixture.sessionId,
          status: 'passed',
          masteryScore: 0.8,
        });
      },
    ],
    [
      'needs-deepening topic',
      async (
        database: Database,
        fixture: Awaited<ReturnType<typeof seedFiledTopicFixture>>,
        profileId: string,
      ) => {
        await database.insert(needsDeepeningTopics).values({
          profileId,
          subjectId: fixture.subjectId,
          topicId: fixture.topicId,
          status: 'active',
          source: 'challenge_round',
        });
      },
    ],
    [
      'XP ledger row',
      async (
        database: Database,
        fixture: Awaited<ReturnType<typeof seedFiledTopicFixture>>,
        profileId: string,
      ) => {
        await database.insert(xpLedger).values({
          profileId,
          subjectId: fixture.subjectId,
          topicId: fixture.topicId,
          amount: 10,
          status: 'pending',
        });
      },
    ],
    [
      'session summary',
      async (
        database: Database,
        fixture: Awaited<ReturnType<typeof seedFiledTopicFixture>>,
        profileId: string,
      ) => {
        await database.insert(sessionSummaries).values({
          profileId,
          sessionId: fixture.sessionId,
          topicId: fixture.topicId,
          status: 'accepted',
          content: 'Learner summary',
        });
      },
    ],
  ])(
    'refuses to delete a topic referenced by a %s',
    async (_label, seedReference) => {
      const { ownerProfileId } = await seedProfiles(db);
      const fixture = await seedFiledTopicFixture(db, ownerProfileId);
      await seedReference(db, fixture, ownerProfileId);

      const result = await deleteTopicIfSafe(
        db,
        ownerProfileId,
        fixture.sessionId,
        fixture.topicId,
      );

      expect(result).toEqual({
        deleted: false,
        reason: 'topic_has_progress_references',
      });
      await expect(expectTopicExists(db, fixture.topicId)).resolves.toBe(true);
    },
  );
});
