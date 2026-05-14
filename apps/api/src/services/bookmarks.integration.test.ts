import { resolve } from 'path';
import { like } from 'drizzle-orm';

import {
  accounts,
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
import type { Bookmark, SessionBookmark } from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';

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
let sessionId: string;
let aiEventId: string;
let aiEventId2: string;
let topicId: string;
let otherTopicId: string;

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

  const [curriculum] = await db
    .insert(curricula)
    .values({
      subjectId,
      version: 1,
    })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId,
      title: 'Biology foundations',
      sortOrder: 0,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: 'Calvin cycle',
      description: 'Carbon fixation and glucose building',
      sortOrder: 0,
      estimatedMinutes: 12,
    })
    .returning({ id: curriculumTopics.id });
  topicId = topic!.id;

  const [otherTopic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: 'Light reactions',
      description: 'Converting light energy',
      sortOrder: 1,
      estimatedMinutes: 10,
    })
    .returning({ id: curriculumTopics.id });
  otherTopicId = otherTopic!.id;

  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      topicId,
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
      topicId,
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
      topicId: otherTopicId,
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
    expect(bookmark.topicId).toBe(topicId);
    expect(bookmark.topicTitle).toBe('Calvin cycle');
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

  it('filters bookmarks by topicId', async () => {
    const result = await listBookmarks(db, profileId, { topicId });

    expect(result.bookmarks).toHaveLength(1);
    expect(result.bookmarks[0]).toMatchObject({
      eventId: aiEventId,
      topicId,
      topicTitle: 'Calvin cycle',
    });
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
    const eventIds = sessionBookmarks
      .map((b: SessionBookmark) => b.eventId)
      .sort();
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
    expect(
      result.bookmarks.every((b: Bookmark) => b.id !== createdBookmarkId),
    ).toBe(true);
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
});
