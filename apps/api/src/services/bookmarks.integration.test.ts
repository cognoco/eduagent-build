import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  bookmarks,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import { eq } from 'drizzle-orm';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import {
  createBookmark,
  deleteBookmark,
  listBookmarks,
  listSessionBookmarks,
} from './bookmarks';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

let db: Database;

let profileId: string;
let otherProfileId: string;
let subjectId: string;
let otherSubjectId: string;
let sessionId: string;
let aiEventId: string;
let aiEventId2: string;
let topicId: string;

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedTestData(): Promise<void> {
  const accountId = generateUUIDv7();
  profileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: 'Bookmark Test User',
    birthYear: 2012,
    // [WI-1128] seedTestData() is called from multiple beforeAll blocks in
    // this file. Legacy `accounts` has unique clerkUserId/email columns; a
    // RUN_ID-only (file-scoped, not call-scoped) suffix collided across
    // calls when the legacy tables are present (the 2nd+ call's onConflictDoNothing
    // silently no-op'd on the email collision, leaving profiles' account_id FK
    // dangling). Keyed on the freshly-generated accountId so every call is unique.
    clerkUserId: `clerk_integ_bkmk_${accountId}_1`,
    email: `bkmk_${accountId}_1@test.invalid`,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  const otherAccountId = generateUUIDv7();
  otherProfileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId: otherAccountId,
    profileId: otherProfileId,
    displayName: 'Other User',
    birthYear: 2010,
    clerkUserId: `clerk_integ_bkmk_${otherAccountId}_2`,
    email: `bkmk_${otherAccountId}_2@test.invalid`,
    isOwner: true,
  });
  seededAccountIds.push(otherAccountId);
  seededProfileIds.push(otherProfileId);

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
    await deleteV2IdentitiesForTest(db, {
      accountIds: [...seededAccountIds],
      profileIds: [...seededProfileIds],
    });
    seededAccountIds.length = 0;
    seededProfileIds.length = 0;
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

// ---------------------------------------------------------------------------
// Additional integration tests — pagination stability, orphaned topic rows
// ---------------------------------------------------------------------------

describeIfDb('Bookmarks — pagination stability (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
    await seedTestData();
  });

  afterAll(async () => {
    await deleteV2IdentitiesForTest(db, {
      accountIds: [...seededAccountIds],
      profileIds: [...seededProfileIds],
    });
    seededAccountIds.length = 0;
    seededProfileIds.length = 0;
  });

  it('cursor pagination across multiple pages yields no duplicates', async () => {
    // Create a fresh session + 5 ai_response events and bookmark them all.
    const [freshSession] = await db
      .insert(learningSessions)
      .values({ profileId, subjectId, status: 'completed' })
      .returning({ id: learningSessions.id });

    const eventIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const [ev] = await db
        .insert(sessionEvents)
        .values({
          sessionId: freshSession!.id,
          profileId,
          subjectId,
          eventType: 'ai_response',
          content: `Stable pagination event ${i}`,
        })
        .returning({ id: sessionEvents.id });
      eventIds.push(ev!.id);
    }

    // Bookmark all 5 events.
    for (const evId of eventIds) {
      await createBookmark(db, profileId, evId);
    }

    // Page through 2 at a time — collect all ids.
    const collected: string[] = [];
    let cursor: string | null = null;

    let attempts = 0;
    do {
      const page = await listBookmarks(db, profileId, {
        limit: 2,
        cursor: cursor ?? undefined,
      });
      for (const bm of page.bookmarks) {
        expect(collected).not.toContain(bm.id); // no duplicates
        collected.push(bm.id);
      }
      cursor = page.nextCursor;
      attempts++;
      if (attempts > 20) break; // safety guard against infinite loop
    } while (cursor !== null);

    // Must have visited at least the 5 newly created bookmarks (plus any
    // bookmarks seeded by earlier tests in the same suite run).
    expect(collected.length).toBeGreaterThanOrEqual(5);
  });

  it('cursor pagination returns correct nextCursor on boundary', async () => {
    const [freshSession] = await db
      .insert(learningSessions)
      .values({ profileId, subjectId, status: 'completed' })
      .returning({ id: learningSessions.id });

    const [ev1] = await db
      .insert(sessionEvents)
      .values({
        sessionId: freshSession!.id,
        profileId,
        subjectId,
        eventType: 'ai_response',
        content: 'Boundary cursor event A',
      })
      .returning({ id: sessionEvents.id });

    const bm1 = await createBookmark(db, profileId, ev1!.id);

    // A single-item page at limit=1 must have a non-null cursor pointing
    // to the id of the last emitted item so the next page starts after it.
    const page = await listBookmarks(db, profileId, { limit: 1 });
    // The cursor equals the id of the last item in this page.
    expect(page.nextCursor).toBe(page.bookmarks[page.bookmarks.length - 1]!.id);

    // Cleanup
    await deleteBookmark(db, profileId, bm1.id);
  });
});

describeIfDb('Bookmarks — orphaned topic references (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
    await seedTestData();
  });

  afterAll(async () => {
    await deleteV2IdentitiesForTest(db, {
      accountIds: [...seededAccountIds],
      profileIds: [...seededProfileIds],
    });
    seededAccountIds.length = 0;
    seededProfileIds.length = 0;
  });

  it('listBookmarks includes bookmark even when topicId is null (ON DELETE SET NULL)', async () => {
    // The bookmarks table has topicId ON DELETE SET NULL, so after a topic is
    // deleted the row survives with topicId=null. listBookmarks uses leftJoin
    // on curriculum_topics so it must still return the row.
    const [nullTopicRow] = await db
      .insert(bookmarks)
      .values({
        profileId,
        sessionId,
        eventId: generateUUIDv7(),
        subjectId,
        topicId: null,
        content: 'Orphaned topic bookmark',
      })
      .returning({ id: bookmarks.id });

    const result = await listBookmarks(db, profileId, {});
    const ids = result.bookmarks.map((b) => b.id);
    expect(ids).toContain(nullTopicRow!.id);

    // topicTitle must be null (leftJoin yields null for missing join row)
    const found = result.bookmarks.find((b) => b.id === nullTopicRow!.id);
    expect(found!.topicTitle).toBeNull();

    // Cleanup
    await db.delete(bookmarks).where(eq(bookmarks.id, nullTopicRow!.id));
  });

  it('listSessionBookmarks returns empty array for session with no bookmarks', async () => {
    const [emptySession] = await db
      .insert(learningSessions)
      .values({ profileId, subjectId, status: 'active' })
      .returning({ id: learningSessions.id });

    const result = await listSessionBookmarks(db, profileId, emptySession!.id);
    expect(result).toEqual([]);
  });
});

describeIfDb(
  'Bookmarks — subjectId filter profile isolation (integration)',
  () => {
    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);
      await seedTestData();
    });

    afterAll(async () => {
      await deleteV2IdentitiesForTest(db, {
        accountIds: [...seededAccountIds],
        profileIds: [...seededProfileIds],
      });
      seededAccountIds.length = 0;
      seededProfileIds.length = 0;
    });

    it('subjectId filter does not leak cross-profile bookmarks sharing a subjectId row', async () => {
      // Direct insert: a cross-profile bookmark referencing subjectId
      // (the subject is owned by profileId, but we assign it to otherProfileId).
      // This tests that the listBookmarks WHERE clause includes profileId AND subjectId.
      const [xpBm] = await db
        .insert(bookmarks)
        .values({
          profileId: otherProfileId,
          sessionId,
          eventId: generateUUIDv7(),
          subjectId,
          topicId: null,
          content: 'Cross-profile bookmark on same subjectId',
        })
        .returning({ id: bookmarks.id });

      // Active profile filtered by subjectId should not see otherProfile's bookmark.
      const result = await listBookmarks(db, profileId, { subjectId });
      const ids = result.bookmarks.map((b) => b.id);
      expect(ids).not.toContain(xpBm!.id);

      // Cleanup
      await db.delete(bookmarks).where(eq(bookmarks.id, xpBm!.id));
    });
  },
);
