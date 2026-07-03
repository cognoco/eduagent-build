/**
 * Integration: findLaterInBook SQL correctness [PR-FIX-06]
 *
 * Verifies that createScopedRepository → curriculumTopics.findLaterInBook
 * executes the correct SQL against a real database:
 *   - Returns the next topic(s) in sort-order within the same book.
 *   - Excludes topics from other books.
 *   - Returns empty when the current topic is the last in the book.
 *   - Correctly crosses chapter boundaries (chapter is a text label; the
 *     SQL uses sortOrder, so the first topic of the next chapter is returned
 *     as long as it has a higher sortOrder).
 *
 * Uses a real database. No mocks of repository, services, or schema.
 */

import { resolve } from 'path';
import {
  curricula,
  curriculumBooks,
  curriculumTopics,
  createDatabase,
  createScopedRepository,
  generateUUIDv7,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { eq } from 'drizzle-orm';
import { explainTopicOrdering, moveTopicToBook } from './curriculum';
import { NotFoundError } from '../errors';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

type TopicSummary = Awaited<
  ReturnType<
    ReturnType<
      typeof createScopedRepository
    >['curriculumTopics']['findLaterInBook']
  >
>[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// Unique run prefix ensures parallel CI runs don't collide.
const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integ-find-later-${RUN_ID}`;

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

interface SeededBook {
  profileId: string;
  subjectId: string;
  bookId: string;
  /** topicIds[i] corresponds to sortOrder = i */
  topicIds: string[];
}

/**
 * Seeds an account → profile → subject → curriculum → book → topics tree.
 * Each topic gets sortOrder = index.  The optional `chapters` array sets the
 * `chapter` text label per topic (defaults to null if omitted).
 */
async function seedBook(
  database: Database,
  label: string,
  topicTitles: string[],
  chapters?: (string | null)[],
): Promise<SeededBook> {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId,
    profileId,
    displayName: `FindLater ${label}`,
    birthYear: 2010,
    clerkUserId: `${CLERK_PREFIX}-${label}`,
    email: `${CLERK_PREFIX}-${label}@test.invalid`,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  const [subject] = await database
    .insert(subjects)
    .values({
      profileId,
      name: `Subject ${label}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [curriculum] = await database
    .insert(curricula)
    .values({ subjectId: subject!.id, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `Book ${label}`,
      sortOrder: 0,
    })
    .returning({ id: curriculumBooks.id });

  const topicIds: string[] = [];
  for (const [i, title] of topicTitles.entries()) {
    const [row] = await database
      .insert(curriculumTopics)
      .values({
        curriculumId: curriculum!.id,
        bookId: book!.id,
        title,
        description: `${title} description`,
        sortOrder: i,
        estimatedMinutes: 30,
        chapter: chapters?.[i] ?? null,
      })
      .returning({ id: curriculumTopics.id });
    topicIds.push(row!.id);
  }

  return {
    profileId,
    subjectId: subject!.id,
    bookId: book!.id,
    topicIds,
  };
}

async function cleanupByPrefix(database: Database): Promise<void> {
  await deleteV2IdentitiesForTest(database, {
    accountIds: [...seededAccountIds],
    profileIds: [...seededProfileIds],
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

// ---------------------------------------------------------------------------
// Suite fixtures
// ---------------------------------------------------------------------------

let db: Database;

beforeAll(async () => {
  db = createIntegrationDb();
  // Pre-clean in case a previous run crashed before afterAll.
  await cleanupByPrefix(db);
});

afterAll(async () => {
  await cleanupByPrefix(db);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('findLaterInBook SQL correctness (integration) [PR-FIX-06]', () => {
  it('returns the next topic in sortOrder within the same book', async () => {
    const tree = await seedBook(db, 'A', ['Topic 0', 'Topic 1', 'Topic 2']);
    const repo = createScopedRepository(db, tree.profileId);

    // Ask for topics after sortOrder 0 → topics 1 and 2 should be returned.
    const results = await repo.curriculumTopics.findLaterInBook(
      tree.bookId,
      0,
      10,
    );

    expect(results.map((r: TopicSummary) => r.id)).toEqual([
      tree.topicIds[1],
      tree.topicIds[2],
    ]);
  });

  it('results are ordered ascending by sortOrder', async () => {
    const tree = await seedBook(db, 'B', [
      'Intro',
      'Basics',
      'Advanced',
      'Expert',
    ]);
    const repo = createScopedRepository(db, tree.profileId);

    const results = await repo.curriculumTopics.findLaterInBook(
      tree.bookId,
      0,
      50,
    );

    // sortOrder 1, 2, 3 returned in ascending order.
    expect(results.map((r: TopicSummary) => r.id)).toEqual([
      tree.topicIds[1],
      tree.topicIds[2],
      tree.topicIds[3],
    ]);
  });

  it('excludes topics from other books', async () => {
    const bookC = await seedBook(db, 'C1', ['C-Topic 0', 'C-Topic 1']);
    const bookD = await seedBook(db, 'C2', ['D-Topic 0', 'D-Topic 1']);

    // Query bookC with bookC's repo — must NOT see bookD topics.
    const repo = createScopedRepository(db, bookC.profileId);
    const results = await repo.curriculumTopics.findLaterInBook(
      bookC.bookId,
      0,
      50,
    );

    const returnedIds = results.map((r: TopicSummary) => r.id);
    expect(returnedIds).not.toContain(bookD.topicIds[0]);
    expect(returnedIds).not.toContain(bookD.topicIds[1]);
    // Only bookC's topic at sortOrder 1 should be present.
    expect(returnedIds).toEqual([bookC.topicIds[1]]);
  });

  it('returns empty array when the current topic is the last in the book', async () => {
    const tree = await seedBook(db, 'D', ['Topic 0', 'Topic 1']);
    const repo = createScopedRepository(db, tree.profileId);

    // Ask for topics after sortOrder 1 (the last topic) — nothing follows.
    const results = await repo.curriculumTopics.findLaterInBook(
      tree.bookId,
      1,
      10,
    );

    expect(results).toHaveLength(0);
  });

  it('returns empty array for a book with only one topic', async () => {
    const tree = await seedBook(db, 'E', ['Solo Topic']);
    const repo = createScopedRepository(db, tree.profileId);

    // sortOrder of the only topic is 0; ask for anything after it.
    const results = await repo.curriculumTopics.findLaterInBook(
      tree.bookId,
      0,
      10,
    );

    expect(results).toHaveLength(0);
  });

  it('crosses chapter boundary — returns first topic of next chapter', async () => {
    // Topics 0–1 are in "Chapter 1"; topics 2–3 are in "Chapter 2".
    // findLaterInBook is sortOrder-based, so crossing the chapter boundary
    // is identical to advancing past the last sortOrder in Chapter 1.
    const tree = await seedBook(
      db,
      'F',
      ['Ch1-Topic-A', 'Ch1-Topic-B', 'Ch2-Topic-A', 'Ch2-Topic-B'],
      ['Chapter 1', 'Chapter 1', 'Chapter 2', 'Chapter 2'],
    );
    const repo = createScopedRepository(db, tree.profileId);

    // Ask for topics after sortOrder 1 (last of Chapter 1).
    const results = await repo.curriculumTopics.findLaterInBook(
      tree.bookId,
      1,
      10,
    );

    expect(results.map((r: TopicSummary) => r.id)).toEqual([
      tree.topicIds[2], // first topic of Chapter 2
      tree.topicIds[3],
    ]);
    expect(results[0]!.title).toBe('Ch2-Topic-A');
  });

  it('respects the limit parameter', async () => {
    const tree = await seedBook(db, 'G', ['T0', 'T1', 'T2', 'T3', 'T4']);
    const repo = createScopedRepository(db, tree.profileId);

    // Ask for topics after sortOrder 0 but cap at 2.
    const results = await repo.curriculumTopics.findLaterInBook(
      tree.bookId,
      0,
      2,
    );

    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe(tree.topicIds[1]);
    expect(results[1]!.id).toBe(tree.topicIds[2]);
  });
});

// ---------------------------------------------------------------------------
// [BUG-458] Break test: moveTopicToBook IDOR — cross-profile topic theft
// ---------------------------------------------------------------------------

describe('[BUG-458] moveTopicToBook IDOR — cross-profile source book ownership (integration)', () => {
  /**
   * Attack scenario:
   *   Profile A has:  subjectA → bookA → topicA
   *   Profile B has:  subjectB → bookB → topicB
   *
   *   Attacker (Profile A) calls moveTopicToBook with:
   *     subjectId    = A.subjectId  (A owns this → ownership check passes)
   *     sourceBookId = B.bookId     (B owns this — THE ATTACK)
   *     topicId      = B.topicId    (belongs to B.bookId → topic-in-book check passes)
   *     targetBookId = A.bookId     (A owns this → target-book check passes)
   *
   *   Without the fix, all three checks pass and the UPDATE rebinds B's topic
   *   to A's book — cross-account data destruction + theft.
   *   After the fix, the source-book ownership check throws NotFoundError.
   */
  it('throws NotFoundError when sourceBookId belongs to a different profile', async () => {
    const treeA = await seedBook(db, 'BUG458-A', ['A-Topic', 'A-Topic2']);
    const treeB = await seedBook(db, 'BUG458-B', ['B-Secret-Topic']);

    // Capture B's topic's current book_id so we can verify it was not mutated.
    const [topicBefore] = await db
      .select({ bookId: curriculumTopics.bookId })
      .from(curriculumTopics)
      .where(eq(curriculumTopics.id, treeB.topicIds[0]!))
      .limit(1);

    // Profile A attacks: uses its own subjectId + targetBookId, but B's sourceBookId + topicId.
    await expect(
      moveTopicToBook(
        db,
        treeA.profileId, // attacker's profileId
        treeA.subjectId, // attacker's subjectId (passes ownership check)
        treeB.bookId, // VICTIM's bookId as sourceBookId
        treeB.topicIds[0]!, // VICTIM's topicId
        treeA.bookId, // attacker's targetBookId
      ),
    ).rejects.toThrow(NotFoundError);

    // B's topic must still point to B's book — not moved to A's book.
    const [topicAfter] = await db
      .select({ bookId: curriculumTopics.bookId })
      .from(curriculumTopics)
      .where(eq(curriculumTopics.id, treeB.topicIds[0]!))
      .limit(1);

    expect(topicAfter!.bookId).toBe(topicBefore!.bookId);
    expect(topicAfter!.bookId).toBe(treeB.bookId);
  });
});

// ---------------------------------------------------------------------------
// [BUG-459] Break test: explainTopicOrdering must not leak cross-account topic title
// ---------------------------------------------------------------------------

describe('[BUG-459] explainTopicOrdering cross-account topic disclosure (integration)', () => {
  it('throws NotFoundError when topicId belongs to a different profile', async () => {
    // Profile A owns subjectA and topicA.
    const treeA = await seedBook(db, 'BUG459-A', ['TopicA-Secret']);
    // Profile B owns subjectB and topicB.
    const treeB = await seedBook(db, 'BUG459-B', ['TopicB-Innocent']);

    // Profile B attempts to call explainTopicOrdering on their own subject
    // but passes Profile A's topicId. Before the fix, topicA's title would be
    // loaded and fed into the LLM prompt — an information disclosure. After
    // the fix the topic lookup is constrained to subjectB's curriculum, so the
    // topic is not found and the function throws NotFoundError.
    expect(treeA.topicIds.length).toBeGreaterThan(0);
    await expect(
      explainTopicOrdering(
        db,
        treeB.profileId,
        treeB.subjectId,
        treeA.topicIds[0]!,
      ),
    ).rejects.toThrow(NotFoundError);
  });
});
