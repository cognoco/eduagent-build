/**
 * Integration: retrieval_events 37-day retention TTL [Flow 2 / EU-3 / T8 / D-2=a]
 *
 * Verifies the whole-row TTL deletes rows older than 37 days and leaves newer
 * rows untouched. Uses a real database and the real delete path. No mocks of
 * repository, services, or schema.
 */

import { resolve } from 'path';
import { and, eq, like } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  profiles,
  retrievalEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { deleteAgedRetrievalEvents } from './retrieval-events-retention-cron';

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

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integ-retrieval-ttl-${RUN_ID}`;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Seeded {
  profileId: string;
  subjectId: string;
  topicId: string;
}

async function seedProfileWithTopic(database: Database): Promise<Seeded> {
  const [account] = await database
    .insert(accounts)
    .values({
      clerkUserId: CLERK_PREFIX,
      email: `${CLERK_PREFIX}@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [profile] = await database
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Retention TTL Test',
      birthYear: 2010,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  const [subject] = await database
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: 'Subject TTL',
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
    .values({ subjectId: subject!.id, title: 'Book TTL', sortOrder: 0 })
    .returning({ id: curriculumBooks.id });

  const [topic] = await database
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: 'Topic TTL',
      description: 'Description TTL',
      sortOrder: 0,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });

  return {
    profileId: profile!.id,
    subjectId: subject!.id,
    topicId: topic!.id,
  };
}

async function insertRowAged(
  database: Database,
  seed: Seeded,
  createdAt: Date,
  gradedBy: 'llm' | 'fallback_heuristic',
): Promise<string> {
  const [row] = await database
    .insert(retrievalEvents)
    .values({
      profileId: seed.profileId,
      subjectId: seed.subjectId,
      topicId: seed.topicId,
      promptText: 'prompt',
      learnerAnswer: 'answer',
      nextAction: 'reschedule_soon',
      gradedBy,
      createdAt,
    })
    .returning({ id: retrievalEvents.id });
  return row!.id;
}

async function cleanupByPrefix(database: Database): Promise<void> {
  await database
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
}

let db: Database;

beforeAll(async () => {
  db = createDatabase(requireDatabaseUrl());
  await cleanupByPrefix(db);
});

afterAll(async () => {
  await cleanupByPrefix(db);
});

describe('retrieval_events retention TTL (integration) [Flow 2 / EU-3 / T8]', () => {
  it('deletes rows older than 37 days and leaves newer rows untouched', async () => {
    const seed = await seedProfileWithTopic(db);
    const now = new Date();

    // 40 days old → past the 37-day window → deleted.
    const oldId = await insertRowAged(
      db,
      seed,
      new Date(now.getTime() - 40 * DAY_MS),
      'llm',
    );
    // 5 days old → inside the window → kept.
    const recentId = await insertRowAged(
      db,
      seed,
      new Date(now.getTime() - 5 * DAY_MS),
      'fallback_heuristic',
    );

    const deleted = await deleteAgedRetrievalEvents(db, now);
    expect(deleted).toBeGreaterThanOrEqual(1);

    const survivors = await db
      .select({ id: retrievalEvents.id })
      .from(retrievalEvents)
      .where(
        and(
          eq(retrievalEvents.profileId, seed.profileId),
          eq(retrievalEvents.topicId, seed.topicId),
        ),
      );

    const survivorIds = survivors.map((r) => r.id);
    expect(survivorIds).toContain(recentId);
    expect(survivorIds).not.toContain(oldId);
  });
});
