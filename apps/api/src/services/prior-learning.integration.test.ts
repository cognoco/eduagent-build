/**
 * Integration (break test): CR-059 — cross-profile subjectId leak in fetchPriorTopics
 *
 * Profile A owns a subject with completed sessions. Profile B calls
 * fetchPriorTopics passing profile A's subjectId and their own profileId.
 *
 * Before the fix: only learningSessions.profileId guarded the query.
 * If that predicate were ever dropped, curriculumTopics would be readable
 * across profiles because the join carried no subjects.profileId check.
 *
 * After the fix: subjects is joined with eq(subjects.profileId, profileId),
 * so the query returns [] for any caller who does not own the subject —
 * independently of the learningSessions.profileId predicate.
 *
 * Red-green pattern: written, seen to fail against the unfixed query (which
 * filters only via learningSessions.profileId — removing that predicate
 * would have returned A's topics to B), then verified passing after the
 * subjects join was added.
 */

import { like } from 'drizzle-orm';
import { resolve } from 'path';
import {
  accounts,
  curricula,
  curriculumBooks,
  curriculumTopics,
  createDatabase,
  generateUUIDv7,
  learningSessions,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { fetchPriorTopics } from './prior-learning';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

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

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integ-cr059-${RUN_ID}`;

interface SeededProfile {
  profileId: string;
  subjectId: string;
  topicId: string;
}

async function seedProfileWithCompletedSession(
  database: Database,
  label: string,
): Promise<SeededProfile> {
  const [account] = await database
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}-${label}`,
      email: `${CLERK_PREFIX}-${label}@test.invalid`,
    })
    .returning({ id: accounts.id });
  if (!account) throw new Error('account insert failed');

  const [profile] = await database
    .insert(profiles)
    .values({
      accountId: account.id,
      displayName: `CR059 ${label}`,
      birthYear: 2000,
      isOwner: true,
    })
    .returning({ id: profiles.id });
  if (!profile) throw new Error('profile insert failed');

  const [subject] = await database
    .insert(subjects)
    .values({
      profileId: profile.id,
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
    .values({ subjectId: subject.id, title: `Book ${label}`, sortOrder: 0 })
    .returning({ id: curriculumBooks.id });
  if (!book) throw new Error('book insert failed');

  const [topic] = await database
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum.id,
      bookId: book.id,
      title: `Topic ${label} — ${RUN_ID}`,
      description: `Confidential topic for ${label}`,
      sortOrder: 0,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });
  if (!topic) throw new Error('topic insert failed');

  await database.insert(learningSessions).values({
    profileId: profile.id,
    subjectId: subject.id,
    topicId: topic.id,
    status: 'completed',
    exchangeCount: 3,
  });

  return { profileId: profile.id, subjectId: subject.id, topicId: topic.id };
}

async function cleanupByPrefix(database: Database): Promise<void> {
  await database
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

let db: Database;

beforeAll(async () => {
  db = createIntegrationDb();
  await cleanupByPrefix(db);
});

afterAll(async () => {
  await cleanupByPrefix(db);
});

describeIfDb(
  'CR-059: fetchPriorTopics cross-profile ownership guard (integration)',
  () => {
    it('returns [] when profileId does not own the subjectId (cross-profile break test)', async () => {
      const profileA = await seedProfileWithCompletedSession(db, 'A');
      const profileB = await seedProfileWithCompletedSession(db, 'B');

      // Profile B calls fetchPriorTopics with profile A's subjectId.
      // The subjects join enforces subjects.profileId = profileB.profileId,
      // which A's subject does not satisfy — so no rows come back.
      const result = await fetchPriorTopics(
        db,
        profileB.profileId,
        profileA.subjectId, // profile A's subject — not owned by B
      );

      expect(result).toEqual([]);
    });

    it('returns topics when the caller owns the subjectId', async () => {
      const profileA = await seedProfileWithCompletedSession(db, 'C');

      const result = await fetchPriorTopics(
        db,
        profileA.profileId,
        profileA.subjectId,
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.topicId).toBe(profileA.topicId);
    });
  },
);
