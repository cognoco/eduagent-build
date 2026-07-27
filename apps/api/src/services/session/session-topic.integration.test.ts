import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  subjects,
  type Database,
} from '@eduagent/database';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../../test-utils/legacy-identity-anchors';
import { getTopicSessions } from './session-topic';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();

describeIfDb('getTopicSessions (integration)', () => {
  let db: Database;
  let accountId: string;
  let profileId: string;
  let otherProfileId: string;
  let topicId: string;
  let olderCompletedSessionId: string;
  let newerAutoClosedSessionId: string;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
    accountId = generateUUIDv7();
    profileId = generateUUIDv7();
    otherProfileId = generateUUIDv7();

    await ensureV2IdentityForLegacyProfileTest(db, {
      accountId,
      profileId,
      clerkUserId: `clerk_integ_topicsess_${RUN_ID}`,
      email: `topicsess_${RUN_ID}@test.invalid`,
      displayName: 'Topic Sessions User',
      birthYear: 2012,
      isOwner: true,
    });
    await ensureV2IdentityForLegacyProfileTest(db, {
      accountId,
      profileId: otherProfileId,
      clerkUserId: `clerk_integ_topicsess_other_${RUN_ID}`,
      email: `topicsess_other_${RUN_ID}@test.invalid`,
      displayName: 'Other Topic Sessions User',
      birthYear: 2014,
      isOwner: false,
    });

    const [subject] = await db
      .insert(subjects)
      .values({
        profileId,
        name: 'Science',
        status: 'active',
        pedagogyMode: 'socratic',
      })
      .returning({ id: subjects.id });
    const [curriculum] = await db
      .insert(curricula)
      .values({ subjectId: subject!.id, version: 1 })
      .returning({ id: curricula.id });
    const [book] = await db
      .insert(curriculumBooks)
      .values({
        subjectId: subject!.id,
        title: 'Space',
        sortOrder: 0,
      })
      .returning({ id: curriculumBooks.id });
    const [topic] = await db
      .insert(curriculumTopics)
      .values({
        curriculumId: curriculum!.id,
        bookId: book!.id,
        title: 'Gravity',
        description: 'How gravity shapes motion',
        sortOrder: 0,
        estimatedMinutes: 20,
      })
      .returning({ id: curriculumTopics.id });
    topicId = topic!.id;

    const [olderCompletedSession] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId: subject!.id,
        topicId,
        status: 'completed',
        exchangeCount: 3,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      })
      .returning({ id: learningSessions.id });
    olderCompletedSessionId = olderCompletedSession!.id;

    const [newerAutoClosedSession] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId: subject!.id,
        topicId,
        status: 'auto_closed',
        exchangeCount: 2,
        createdAt: new Date('2026-01-02T10:00:00.000Z'),
      })
      .returning({ id: learningSessions.id });
    newerAutoClosedSessionId = newerAutoClosedSession!.id;

    await db.insert(learningSessions).values([
      {
        profileId,
        subjectId: subject!.id,
        topicId,
        status: 'completed',
        exchangeCount: 0,
        createdAt: new Date('2026-01-04T10:00:00.000Z'),
      },
      {
        profileId,
        subjectId: subject!.id,
        topicId,
        status: 'active',
        exchangeCount: 5,
        createdAt: new Date('2026-01-03T10:00:00.000Z'),
      },
    ]);

    const [otherSubject] = await db
      .insert(subjects)
      .values({
        profileId: otherProfileId,
        name: 'Private Science',
        status: 'active',
        pedagogyMode: 'socratic',
      })
      .returning({ id: subjects.id });
    await db.insert(learningSessions).values({
      profileId: otherProfileId,
      subjectId: otherSubject!.id,
      topicId,
      status: 'completed',
      exchangeCount: 6,
      createdAt: new Date('2026-01-05T10:00:00.000Z'),
    });
  });

  afterAll(async () => {
    if (accountId) {
      await deleteV2IdentitiesForTest(db, {
        accountIds: [accountId],
        profileIds: [profileId, otherProfileId],
      });
    }
  });

  it('[WI-2184] returns only owned completed history with exchanges, newest first', async () => {
    const sessions = await getTopicSessions(db, profileId, topicId);

    expect(sessions.map((session) => session.id)).toEqual([
      newerAutoClosedSessionId,
      olderCompletedSessionId,
    ]);
    expect(sessions.map((session) => session.createdAt)).toEqual([
      '2026-01-02T10:00:00.000Z',
      '2026-01-01T10:00:00.000Z',
    ]);
  });
});
