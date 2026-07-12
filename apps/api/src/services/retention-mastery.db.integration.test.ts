// Real-DB integration tests for stampMasteryOnVerify (GC6 replacement for the
// internal-mock suite in retention-mastery.test.ts). Uses the same seeding
// helpers as apply-retention-update.db.integration.test.ts.
import { resolve } from 'path';
import { and, eq } from 'drizzle-orm';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  retentionCards,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import { stampMasteryOnVerify } from './retention-mastery';

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

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integ-mastery-${RUN_ID}`;
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

interface SeededFixture {
  profileId: string;
  topicId: string;
  bookId: string;
}

async function seedFixture(
  database: Database,
  label: string,
): Promise<SeededFixture> {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  const clerkUserId = `${CLERK_PREFIX}-${label}`;
  const email = `${CLERK_PREFIX}-${label}@test.invalid`;

  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: `Mastery Test ${label}`,
    birthYear: 2010,
    isOwner: true,
  });

  const [subject] = await database
    .insert(subjects)
    .values({
      profileId,
      name: `Subject ${label}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });
  if (!subject) throw new Error('subject insert failed');

  const [curriculum] = await database
    .insert(curricula)
    .values({ subjectId: subject.id, version: 1 })
    .returning({ id: curricula.id });
  if (!curriculum) throw new Error('curriculum insert failed');

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject.id,
      title: `Book ${label}`,
      sortOrder: 0,
    })
    .returning({ id: curriculumBooks.id });
  if (!book) throw new Error('book insert failed');

  const [topic] = await database
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum.id,
      bookId: book.id,
      title: `Topic ${label}`,
      description: `Description ${label}`,
      sortOrder: 0,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });
  if (!topic) throw new Error('topic insert failed');

  return { profileId, topicId: topic.id, bookId: book.id };
}

async function cleanupByPrefix(database: Database): Promise<void> {
  await deleteV2IdentitiesForTest(database, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

async function seedCard(
  database: Database,
  profileId: string,
  topicId: string,
): Promise<string> {
  const [card] = await database
    .insert(retentionCards)
    .values({
      profileId,
      topicId,
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 3,
      failureCount: 0,
      consecutiveSuccesses: 3,
      xpStatus: 'verified',
      masteredAt: null,
    })
    .returning({ id: retentionCards.id });
  if (!card) throw new Error('retention card insert failed');
  return card.id;
}

async function readCard(database: Database, cardId: string) {
  const [row] = await database
    .select()
    .from(retentionCards)
    .where(eq(retentionCards.id, cardId))
    .limit(1);
  if (!row) throw new Error(`retention card ${cardId} not found`);
  return row;
}

async function readBook(database: Database, bookId: string) {
  const [row] = await database
    .select()
    .from(curriculumBooks)
    .where(eq(curriculumBooks.id, bookId))
    .limit(1);
  if (!row) throw new Error(`curriculum book ${bookId} not found`);
  return row;
}

let db: Database;

beforeAll(async () => {
  db = createIntegrationDb();
  await cleanupByPrefix(db);
});

afterAll(async () => {
  await cleanupByPrefix(db);
});

describe('stampMasteryOnVerify — real DB', () => {
  it('stamps masteredAt on first verify and leaves SM-2 columns untouched', async () => {
    const { profileId, topicId } = await seedFixture(db, 'first-stamp');
    const cardId = await seedCard(db, profileId, topicId);
    const masteredAt = new Date('2026-06-01T12:00:00.000Z');

    const priorCard = await readCard(db, cardId);

    await stampMasteryOnVerify(db, {
      profileId,
      topicId,
      cardId,
      xpChange: 'verified',
      masteredAt,
    });

    const row = await readCard(db, cardId);
    expect(row.masteredAt?.toISOString()).toBe(masteredAt.toISOString());
    expect(row.updatedAt.toISOString()).toBe(masteredAt.toISOString());
    // SM-2 columns untouched
    expect(row.easeFactor).toBe(priorCard.easeFactor);
    expect(row.intervalDays).toBe(priorCard.intervalDays);
    expect(row.repetitions).toBe(priorCard.repetitions);
    expect(row.failureCount).toBe(priorCard.failureCount);
    expect(row.consecutiveSuccesses).toBe(priorCard.consecutiveSuccesses);
    expect(row.xpStatus).toBe(priorCard.xpStatus);
  });

  it('second stampMasteryOnVerify returns without changing masteredAt (idempotent)', async () => {
    const { profileId, topicId } = await seedFixture(db, 'second-stamp');
    const cardId = await seedCard(db, profileId, topicId);
    const firstStampAt = new Date('2026-06-01T12:00:00.000Z');
    const secondStampAt = new Date('2026-06-02T12:00:00.000Z');

    // First stamp
    await stampMasteryOnVerify(db, {
      profileId,
      topicId,
      cardId,
      xpChange: 'verified',
      masteredAt: firstStampAt,
    });

    const afterFirst = await readCard(db, cardId);
    expect(afterFirst.masteredAt?.toISOString()).toBe(
      firstStampAt.toISOString(),
    );

    // Second stamp with a later timestamp — must not overwrite
    await stampMasteryOnVerify(db, {
      profileId,
      topicId,
      cardId,
      xpChange: 'verified',
      masteredAt: secondStampAt,
    });

    const afterSecond = await readCard(db, cardId);
    expect(afterSecond.masteredAt?.toISOString()).toBe(
      firstStampAt.toISOString(),
      'masteredAt must not change on second stamp',
    );
    // updated: false means updatedAt also should not move
    expect(afterSecond.updatedAt.toISOString()).toBe(
      firstStampAt.toISOString(),
      'updatedAt must not change when masteredAtNull guard blocks second stamp',
    );
  });

  it('stamps the book masteredAt when the only topic in the book is mastered', async () => {
    const { profileId, topicId, bookId } = await seedFixture(
      db,
      'book-mastery',
    );
    const cardId = await seedCard(db, profileId, topicId);
    const masteredAt = new Date('2026-06-03T12:00:00.000Z');

    const bookBefore = await readBook(db, bookId);
    expect(bookBefore.masteredAt).toBeNull();

    await stampMasteryOnVerify(db, {
      profileId,
      topicId,
      cardId,
      xpChange: 'verified',
      masteredAt,
    });

    const bookAfter = await readBook(db, bookId);
    expect(bookAfter.masteredAt?.toISOString()).toBe(masteredAt.toISOString());
  });

  it('does NOT stamp book when a sibling topic has no mastered card', async () => {
    const {
      profileId,
      topicId: topic1Id,
      bookId,
    } = await seedFixture(db, 'book-partial');

    // Seed a second topic in the same book — no card seeded for it
    // (find curriculum and book from the fixture, then add sibling topic)
    const [book] = await db
      .select()
      .from(curriculumBooks)
      .where(eq(curriculumBooks.id, bookId))
      .limit(1);
    if (!book) throw new Error('book not found');

    const [curriculum] = await db
      .select()
      .from(curricula)
      .where(eq(curricula.subjectId, book.subjectId))
      .limit(1);
    if (!curriculum) throw new Error('curriculum not found');

    await db.insert(curriculumTopics).values({
      curriculumId: curriculum.id,
      bookId,
      title: 'Sibling Topic',
      description: 'Sibling',
      sortOrder: 1,
      estimatedMinutes: 15,
    });

    const cardId = await seedCard(db, profileId, topic1Id);
    const masteredAt = new Date('2026-06-04T12:00:00.000Z');

    await stampMasteryOnVerify(db, {
      profileId,
      topicId: topic1Id,
      cardId,
      xpChange: 'verified',
      masteredAt,
    });

    const bookAfter = await readBook(db, bookId);
    expect(bookAfter.masteredAt).toBeNull();
  });
});
