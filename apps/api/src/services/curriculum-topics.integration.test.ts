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

import { like } from 'drizzle-orm';
import { resolve } from 'path';
import {
  accounts,
  curricula,
  curriculumBooks,
  curriculumTopics,
  createDatabase,
  createScopedRepository,
  generateUUIDv7,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.'
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

interface SeededBook {
  profileId: string;
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
  chapters?: (string | null)[]
): Promise<SeededBook> {
  const [account] = await database
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}-${label}`,
      email: `${CLERK_PREFIX}-${label}@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [profile] = await database
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `FindLater ${label}`,
      birthYear: 2010,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  const [subject] = await database
    .insert(subjects)
    .values({
      profileId: profile!.id,
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

  return { profileId: profile!.id, bookId: book!.id, topicIds };
}

async function cleanupByPrefix(database: Database): Promise<void> {
  await database
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
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
      10
    );

    expect(results.map((r) => r.id)).toEqual([
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
      50
    );

    // sortOrder 1, 2, 3 returned in ascending order.
    expect(results.map((r) => r.id)).toEqual([
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
      50
    );

    const returnedIds = results.map((r) => r.id);
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
      10
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
      10
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
      ['Chapter 1', 'Chapter 1', 'Chapter 2', 'Chapter 2']
    );
    const repo = createScopedRepository(db, tree.profileId);

    // Ask for topics after sortOrder 1 (last of Chapter 1).
    const results = await repo.curriculumTopics.findLaterInBook(
      tree.bookId,
      1,
      10
    );

    expect(results.map((r) => r.id)).toEqual([
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
      2
    );

    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe(tree.topicIds[1]);
    expect(results[1]!.id).toBe(tree.topicIds[2]);
  });
});
