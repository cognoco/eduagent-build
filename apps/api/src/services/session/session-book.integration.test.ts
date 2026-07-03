import { resolve } from 'path';
import { eq } from 'drizzle-orm';
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
import { getBookSessions, markSessionFiled } from './session-book';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();

describeIfDb('getBookSessions (integration)', () => {
  let db: Database;
  let accountId: string;
  let profileId: string;
  let subjectId: string;
  let ownedBookId: string;
  let ownedTopicId: string;
  let ownedSessionId: string;
  let foreignBookId: string;
  let foreignProfileId: string;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);

    accountId = generateUUIDv7();
    profileId = generateUUIDv7();

    await ensureV2IdentityForLegacyProfileTest(db, {
      accountId,
      profileId,
      clerkUserId: `clerk_integ_booksess_${RUN_ID}`,
      email: `booksess_${RUN_ID}@test.invalid`,
      displayName: 'Book Sessions User',
      birthYear: 2012,
      isOwner: true,
    });

    const [subject] = await db
      .insert(subjects)
      .values({
        profileId,
        name: 'History',
        status: 'active',
        pedagogyMode: 'socratic',
      })
      .returning({ id: subjects.id });
    subjectId = subject!.id;

    const [ownedCurriculum] = await db
      .insert(curricula)
      .values({ subjectId, version: 1 })
      .returning({ id: curricula.id });
    const [ownedBook] = await db
      .insert(curriculumBooks)
      .values({
        subjectId,
        title: 'Owned Book',
        sortOrder: 0,
      })
      .returning({ id: curriculumBooks.id });
    ownedBookId = ownedBook!.id;
    const [ownedTopic] = await db
      .insert(curriculumTopics)
      .values({
        curriculumId: ownedCurriculum!.id,
        bookId: ownedBookId,
        title: 'Owned Topic',
        description: 'Owned Topic description',
        chapter: 'Chapter 1',
        sortOrder: 0,
        estimatedMinutes: 20,
      })
      .returning({ id: curriculumTopics.id });
    ownedTopicId = ownedTopic!.id;

    const [ownedSession] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId: ownedTopicId,
        status: 'completed',
        exchangeCount: 3,
      })
      .returning({ id: learningSessions.id });
    ownedSessionId = ownedSession!.id;

    foreignProfileId = generateUUIDv7();
    await ensureV2IdentityForLegacyProfileTest(db, {
      accountId,
      profileId: foreignProfileId,
      clerkUserId: `clerk_integ_booksess_foreign_${RUN_ID}`,
      email: `booksess_foreign_${RUN_ID}@test.invalid`,
      displayName: 'Foreign Book User',
      birthYear: 2013,
      isOwner: false,
    });
    const [foreignSubject] = await db
      .insert(subjects)
      .values({
        profileId: foreignProfileId,
        name: 'Private History',
        status: 'active',
        pedagogyMode: 'socratic',
      })
      .returning({ id: subjects.id });
    const [foreignCurriculum] = await db
      .insert(curricula)
      .values({ subjectId: foreignSubject!.id, version: 1 })
      .returning({ id: curricula.id });
    const [foreignBook] = await db
      .insert(curriculumBooks)
      .values({
        subjectId: foreignSubject!.id,
        title: 'Foreign Book',
        sortOrder: 0,
      })
      .returning({ id: curriculumBooks.id });
    foreignBookId = foreignBook!.id;
    const [foreignTopic] = await db
      .insert(curriculumTopics)
      .values({
        curriculumId: foreignCurriculum!.id,
        bookId: foreignBookId,
        title: 'Foreign Book Topic',
        description: 'Foreign Book Topic description',
        sortOrder: 0,
        estimatedMinutes: 20,
      })
      .returning({ id: curriculumTopics.id });

    await db.insert(learningSessions).values({
      profileId,
      subjectId,
      topicId: foreignTopic!.id,
      status: 'completed',
      exchangeCount: 2,
    });
  });

  afterAll(async () => {
    if (accountId) {
      await deleteV2IdentitiesForTest(db, {
        accountIds: [accountId],
        profileIds: [profileId, foreignProfileId],
      });
    }
  });

  it('returns sessions for an owned book', async () => {
    const sessions = await getBookSessions(db, profileId, ownedBookId);

    expect(sessions.map((session) => session.id)).toContain(ownedSessionId);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        topicId: ownedTopicId,
        topicTitle: 'Owned Topic',
        chapter: 'Chapter 1',
      }),
    );
  });

  it('[WI-80] does not return profile-owned stale sessions for a foreign book', async () => {
    const sessions = await getBookSessions(db, profileId, foreignBookId);

    expect(sessions).toEqual([]);
  });

  it('[CRITICAL-2] markSessionFiled writes topicId and filedAt together', async () => {
    const [session] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId: null,
        filedAt: null,
        status: 'completed',
        exchangeCount: 2,
      })
      .returning({ id: learningSessions.id });

    await markSessionFiled(db, profileId, session!.id, ownedTopicId);

    const stored = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, session!.id),
    });

    expect(stored!.topicId).toBe(ownedTopicId);
    expect(stored!.filedAt).toEqual(expect.any(Date));
    expect(stored!.updatedAt).toEqual(expect.any(Date));
  });
});
