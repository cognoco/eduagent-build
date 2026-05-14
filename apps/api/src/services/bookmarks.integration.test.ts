import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  bookmarks,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  profiles,
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import { like } from 'drizzle-orm';
import {
  createBookmark,
  deleteBookmark,
  listBookmarks,
  listSessionBookmarks,
} from './bookmarks';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();
let db: Database;

let profileId: string;
let otherProfileId: string;
let subjectId: string;
let otherSubjectId: string;
let sessionId: string;
let aiEventId: string;
let aiEventId2: string;
let topicId: string;

async function seedTestData(): Promise<void> {
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `clerk_integ_bkmk_${RUN_ID}_1`,
      email: `bkmk_${RUN_ID}_1@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Bookmark Test User',
      birthYear: 2012,
      isOwner: true,
    })
    .returning({ id: profiles.id });
  profileId = profile!.id;

  const [otherAccount] = await db
    .insert(accounts)
    .values({
      clerkUserId: `clerk_integ_bkmk_${RUN_ID}_2`,
      email: `bkmk_${RUN_ID}_2@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [otherProfile] = await db
    .insert(profiles)
    .values({
      accountId: otherAccount!.id,
      displayName: 'Other User',
      birthYear: 2010,
      isOwner: true,
    })
    .returning({ id: profiles.id });
  otherProfileId = otherProfile!.id;

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: 'Mathematics',
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });
  subjectId = subject!.id;

  // Seed a curriculum chain so we can attach a real topicId to bookmarks.
  // bookmarks.topicId references curriculum_topics(id) with ON DELETE SET NULL,
  // so a non-null topicId must point at an existing row.
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId,
      title: 'Algebra I',
      sortOrder: 0,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: 'Linear equations',
      description: 'Solving equations of the form ax + b = c.',
      sortOrder: 0,
      estimatedMinutes: 20,
    })
    .returning({ id: curriculumTopics.id });
  topicId = topic!.id;

  // Seed a subject for the other profile so we can write a cross-profile
  // bookmark row directly into the bookmarks table without triggering the
  // subjects FK ON DELETE CASCADE.
  const [otherSubject] = await db
    .insert(subjects)
    .values({
      profileId: otherProfileId,
      name: 'Mathematics (other)',
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });
  otherSubjectId = otherSubject!.id;

  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      status: 'completed',
    })
    .returning({ id: learningSessions.id });
  sessionId = session!.id;

  const [event1] = await db
    .insert(sessionEvents)
    .values({
      sessionId,
      profileId,
      subjectId,
      eventType: 'ai_response',
      content:
        'The Calvin cycle uses CO₂ to build glucose through carbon fixation.',
    })
    .returning({ id: sessionEvents.id });
  aiEventId = event1!.id;

  const [event2] = await db
    .insert(sessionEvents)
    .values({
      sessionId,
      profileId,
      subjectId,
      eventType: 'ai_response',
      content: 'Photosynthesis converts light energy into chemical energy.',
    })
    .returning({ id: sessionEvents.id });
  aiEventId2 = event2!.id;
}

describeIfDb('Bookmarks (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
    await seedTestData();
  });

  afterAll(async () => {
    await db
      .delete(accounts)
      .where(like(accounts.clerkUserId, `clerk_integ_bkmk_${RUN_ID}%`));
  });
  let createdBookmarkId: string;

  it('creates bookmark with snapshotted content', async () => {
    const bookmark = await createBookmark(db, profileId, aiEventId);
    createdBookmarkId = bookmark.id;

    expect(bookmark.eventId).toBe(aiEventId);
    expect(bookmark.sessionId).toBe(sessionId);
    expect(bookmark.subjectId).toBe(subjectId);
    expect(bookmark.content).toBe(
      'The Calvin cycle uses CO₂ to build glucose through carbon fixation.',
    );
    expect(bookmark.subjectName).toBe('Mathematics');
    expect(bookmark.topicTitle).toBeNull();
    expect(bookmark.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('rejects duplicate eventId for same profile', async () => {
    await expect(createBookmark(db, profileId, aiEventId)).rejects.toThrow(
      'Bookmark already exists',
    );
  });

  it('404 for nonexistent eventId', async () => {
    await expect(
      createBookmark(db, profileId, generateUUIDv7()),
    ).rejects.toThrow('Session event not found');
  });

  // Break test for the scoping guarantee the service makes: the event WHERE
  // clause pins on `sessionEvents.profileId = profileId`, so another
  // profile attempting to bookmark the same event should see it as missing.
  it("scoped to profileId — cannot bookmark another profile's event", async () => {
    await expect(createBookmark(db, otherProfileId, aiEventId)).rejects.toThrow(
      'Session event not found',
    );
  });

  it('lists bookmarks for profile, newest first', async () => {
    // Create a second bookmark so we can assert ordering.
    await createBookmark(db, profileId, aiEventId2);

    const result = await listBookmarks(db, profileId, {});
    expect(result.bookmarks.length).toBe(2);
    // UUIDv7 ids are time-ordered; listBookmarks orders desc(bookmarks.id)
    // so the most recently created bookmark is first.
    expect(result.bookmarks[0]!.content).toContain('Photosynthesis');
    expect(result.bookmarks[1]!.content).toContain('Calvin cycle');
    expect(result.nextCursor).toBeNull();
  });

  it('cursor pagination', async () => {
    const page1 = await listBookmarks(db, profileId, { limit: 1 });
    expect(page1.bookmarks.length).toBe(1);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listBookmarks(db, profileId, {
      limit: 1,
      cursor: page1.nextCursor!,
    });
    expect(page2.bookmarks.length).toBe(1);
    expect(page2.bookmarks[0]!.id).not.toBe(page1.bookmarks[0]!.id);
    expect(page2.nextCursor).toBeNull();
  });

  it('lists session bookmarks as (eventId, bookmarkId) pairs', async () => {
    const sessionBookmarks = await listSessionBookmarks(
      db,
      profileId,
      sessionId,
    );
    expect(sessionBookmarks.length).toBe(2);
    const eventIds = sessionBookmarks.map((b) => b.eventId).sort();
    expect(eventIds).toEqual([aiEventId, aiEventId2].sort());
    for (const row of sessionBookmarks) {
      expect(typeof row.bookmarkId).toBe('string');
    }
  });

  it('listSessionBookmarks is profile-scoped', async () => {
    const otherSessionBookmarks = await listSessionBookmarks(
      db,
      otherProfileId,
      sessionId,
    );
    expect(otherSessionBookmarks).toEqual([]);
  });

  it('deletes bookmark', async () => {
    await deleteBookmark(db, profileId, createdBookmarkId);
    const result = await listBookmarks(db, profileId, {});
    expect(result.bookmarks.every((b) => b.id !== createdBookmarkId)).toBe(
      true,
    );
  });

  // Break test for the delete scoping guarantee: the DELETE WHERE clause
  // pins on `bookmarks.profileId = profileId`, so a cross-profile delete
  // should find no row and raise NotFoundError rather than silently
  // succeeding or reporting 204.
  it('delete scoped to profileId', async () => {
    const bookmark = await createBookmark(db, profileId, aiEventId);
    await expect(
      deleteBookmark(db, otherProfileId, bookmark.id),
    ).rejects.toThrow('Bookmark not found');
    // Cleanup to keep the suite self-contained.
    await deleteBookmark(db, profileId, bookmark.id);
  });

  describe('listBookmarks topicId filter', () => {
    // Direct-insert bookmark rows so we can assign explicit topicIds without
    // having to drag session_events.topicId wiring through this test. The
    // service-under-test only reads from `bookmarks`, so this is sufficient.
    let inScopeBookmarkId: string;
    let outOfScopeBookmarkId: string;
    let nullTopicBookmarkId: string;
    let crossProfileBookmarkId: string;

    beforeAll(async () => {
      const [inScope] = await db
        .insert(bookmarks)
        .values({
          profileId,
          sessionId,
          eventId: generateUUIDv7(),
          subjectId,
          topicId,
          content: 'In-scope bookmark for the active topic',
        })
        .returning({ id: bookmarks.id });
      inScopeBookmarkId = inScope!.id;

      const [outOfScope] = await db
        .insert(bookmarks)
        .values({
          profileId,
          sessionId,
          eventId: generateUUIDv7(),
          subjectId,
          topicId: null,
          content: 'Same profile, but no topic set',
        })
        .returning({ id: bookmarks.id });
      outOfScopeBookmarkId = outOfScope!.id;

      const [nullTopic] = await db
        .insert(bookmarks)
        .values({
          profileId,
          sessionId,
          eventId: generateUUIDv7(),
          subjectId,
          topicId: null,
          content: 'Another null-topic bookmark for the same profile',
        })
        .returning({ id: bookmarks.id });
      nullTopicBookmarkId = nullTopic!.id;

      // Break-test row: another profile owns a bookmark with the SAME topicId.
      // The service must not leak it when the active profile filters by topic.
      const [crossProfile] = await db
        .insert(bookmarks)
        .values({
          profileId: otherProfileId,
          sessionId,
          eventId: generateUUIDv7(),
          subjectId: otherSubjectId,
          topicId,
          content: "Other profile's bookmark on the same topic",
        })
        .returning({ id: bookmarks.id });
      crossProfileBookmarkId = crossProfile!.id;
    });

    it('returns only bookmarks for the active profile and topic', async () => {
      const result = await listBookmarks(db, profileId, { topicId });

      const ids = result.bookmarks.map((b) => b.id);
      expect(ids).toContain(inScopeBookmarkId);
      expect(ids).not.toContain(outOfScopeBookmarkId);
      expect(ids).not.toContain(nullTopicBookmarkId);
      // Profile-isolation break test: other profile's row with the SAME
      // topicId must not appear in this profile's results.
      expect(ids).not.toContain(crossProfileBookmarkId);

      // Sanity: the bookmark we got back must actually carry the requested topicId.
      for (const bookmark of result.bookmarks) {
        expect(bookmark.topicId).toBe(topicId);
      }
    });

    it('cross-profile request for the same topicId returns the other profile only', async () => {
      const result = await listBookmarks(db, otherProfileId, { topicId });
      const ids = result.bookmarks.map((b) => b.id);
      expect(ids).toContain(crossProfileBookmarkId);
      expect(ids).not.toContain(inScopeBookmarkId);
    });

    it('no topicId filter returns null-topic bookmarks too', async () => {
      const result = await listBookmarks(db, profileId, {});
      const ids = result.bookmarks.map((b) => b.id);
      expect(ids).toContain(inScopeBookmarkId);
      expect(ids).toContain(outOfScopeBookmarkId);
      expect(ids).toContain(nullTopicBookmarkId);
    });
  });
});
