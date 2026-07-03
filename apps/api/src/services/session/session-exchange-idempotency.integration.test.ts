import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  learningSessions,
  subjects,
  curricula,
  curriculumBooks,
  curriculumTopics,
  sessionEvents,
  type Database,
} from '@eduagent/database';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../../test-utils/legacy-identity-anchors';
import { persistExchangeResult } from './session-exchange';
import { createBookmark, listBookmarks } from '../bookmarks';
import { mapSessionRow } from './session-events';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();

let seedCounter = 0;
// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded ids for v2 cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedProfile(
  db: Database,
): Promise<{ profileId: string; subjectId: string }> {
  const idx = ++seedCounter;
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    clerkUserId: `clerk_exchange_idem_${RUN_ID}_${idx}`,
    email: `exchange-idem-${RUN_ID}-${idx}@test.invalid`,
    displayName: `Exchange Idempotency ${idx}`,
    birthYear: 2010,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: `Exchange Subject ${idx}`,
    })
    .returning({ id: subjects.id });

  return { profileId, subjectId: subject!.id };
}

async function seedSession(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId?: string | null,
) {
  const [sessionRow] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      topicId: topicId ?? null,
      sessionType: 'learning',
      inputMode: 'text',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      metadata: {
        continuationOpenerActive: true,
        continuationOpenerStartedExchange: 0,
      },
    })
    .returning();
  return mapSessionRow(sessionRow!);
}

async function readSessionMetadata(db: Database, sessionId: string) {
  const [row] = await db
    .select({ metadata: learningSessions.metadata })
    .from(learningSessions)
    .where(eq(learningSessions.id, sessionId));
  return row!.metadata as Record<string, unknown>;
}

async function seedTopic(db: Database, subjectId: string): Promise<string> {
  const [{ id: curriculumId }] = await db
    .insert(curricula)
    .values({
      subjectId,
    })
    .returning({ id: curricula.id });

  const [{ id: bookId }] = await db
    .insert(curriculumBooks)
    .values({
      subjectId,
      title: `Test Book ${generateUUIDv7()}`,
      sortOrder: 1,
    })
    .returning({ id: curriculumBooks.id });

  const [{ id: topicId }] = await db
    .insert(curriculumTopics)
    .values({
      bookId,
      curriculumId,
      title: `Test Topic ${generateUUIDv7()}`,
      description: 'test',
      sortOrder: 1,
      estimatedMinutes: 10,
    })
    .returning({ id: curriculumTopics.id });

  return topicId;
}

async function readAiEventTopicId(
  db: Database,
  eventId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ topicId: sessionEvents.topicId })
    .from(sessionEvents)
    .where(eq(sessionEvents.id, eventId));
  return row?.topicId ?? null;
}

async function persistAndBookmark(input: {
  db: Database;
  profileId: string;
  session: ReturnType<typeof mapSessionRow>;
  userMessage: string;
  aiResponse: string;
  clientId?: string;
}) {
  const result = await persistExchangeResult(
    input.db,
    input.profileId,
    input.session.id,
    input.session,
    input.userMessage,
    input.aiResponse,
    1,
    { isUnderstandingCheck: false },
    input.clientId,
  );
  expect(result.persistedUserMessage).toBe(true);
  expect(result.aiEventId).toBeDefined();
  const bookmark = await createBookmark(
    input.db,
    input.profileId,
    result.aiEventId!,
  );
  return { aiEventId: result.aiEventId!, bookmark };
}

describeIfDb('persistExchangeResult idempotency side effects', () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await deleteV2IdentitiesForTest(db, {
      accountIds: seededAccountIds,
      profileIds: seededProfileIds,
    });
  });

  it('[WI-78 review] applies continuation scoring only for newly persisted client turns', async () => {
    const { profileId, subjectId } = await seedProfile(db);
    const session = await seedSession(db, profileId, subjectId);

    const first = await persistExchangeResult(
      db,
      profileId,
      session.id,
      session,
      'First attempt',
      'First answer',
      1,
      {
        isUnderstandingCheck: false,
        retrievalScore: 0.9,
      },
      'client-turn-1',
    );

    expect(first.persistedUserMessage).toBe(true);
    await expect(readSessionMetadata(db, session.id)).resolves.toMatchObject({
      continuationDepth: 'high',
    });

    const duplicate = await persistExchangeResult(
      db,
      profileId,
      session.id,
      session,
      'Duplicate attempt',
      'Duplicate answer',
      1,
      {
        isUnderstandingCheck: false,
        retrievalScore: 0.1,
      },
      'client-turn-1',
    );

    expect(duplicate.persistedUserMessage).toBe(false);
    await expect(readSessionMetadata(db, session.id)).resolves.toMatchObject({
      continuationDepth: 'high',
    });
  });

  it('[WI-195] carries session.topicId into clientId ai_response events and bookmarks', async () => {
    const { profileId, subjectId } = await seedProfile(db);
    const topicId = await seedTopic(db, subjectId);
    const session = await seedSession(db, profileId, subjectId, topicId);

    const { aiEventId, bookmark } = await persistAndBookmark({
      db,
      profileId,
      session,
      userMessage: 'Explain linear equations',
      aiResponse: 'A linear equation balances both sides.',
      clientId: 'wi-195-client-topic',
    });

    await expect(readAiEventTopicId(db, aiEventId)).resolves.toBe(topicId);
    expect(bookmark.topicId).toBe(topicId);

    const listed = await listBookmarks(db, profileId, { topicId });
    expect(listed.bookmarks.map((row) => row.id)).toContain(bookmark.id);
    expect(
      listed.bookmarks.find((row) => row.id === bookmark.id)!.topicId,
    ).toBe(topicId);
  });

  it('[WI-195] carries session.topicId into paired ai_response events and bookmarks', async () => {
    const { profileId, subjectId } = await seedProfile(db);
    const topicId = await seedTopic(db, subjectId);
    const session = await seedSession(db, profileId, subjectId, topicId);

    const { aiEventId, bookmark } = await persistAndBookmark({
      db,
      profileId,
      session,
      userMessage: 'Explain photosynthesis',
      aiResponse: 'Photosynthesis stores light energy as chemical energy.',
    });

    await expect(readAiEventTopicId(db, aiEventId)).resolves.toBe(topicId);
    expect(bookmark.topicId).toBe(topicId);

    const listed = await listBookmarks(db, profileId, { topicId });
    expect(listed.bookmarks.map((row) => row.id)).toContain(bookmark.id);
    expect(
      listed.bookmarks.find((row) => row.id === bookmark.id)!.topicId,
    ).toBe(topicId);
  });

  it.each([
    ['clientId branch', 'wi-195-client-null'],
    ['paired insert branch', undefined],
  ] as const)(
    '[WI-195] preserves null topicId for %s',
    async (_label, clientId) => {
      const { profileId, subjectId } = await seedProfile(db);
      const session = await seedSession(db, profileId, subjectId, null);

      const { aiEventId, bookmark } = await persistAndBookmark({
        db,
        profileId,
        session,
        userMessage: 'Open-ended question',
        aiResponse: 'Here is a freeform answer.',
        clientId,
      });

      await expect(readAiEventTopicId(db, aiEventId)).resolves.toBeNull();
      expect(bookmark.topicId).toBeNull();

      const listedWithoutTopicFilter = await listBookmarks(db, profileId, {});
      expect(listedWithoutTopicFilter.bookmarks.map((row) => row.id)).toContain(
        bookmark.id,
      );
    },
  );
});
