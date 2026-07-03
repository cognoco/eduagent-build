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

import { resolve } from 'path';
import {
  curricula,
  curriculumBooks,
  curriculumTopics,
  createDatabase,
  generateUUIDv7,
  learningSessions,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import {
  fetchCrossSubjectHighlights,
  fetchPriorTopics,
} from './prior-learning';

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
  topicTitle: string;
}

async function seedProfileWithCompletedSession(
  database: Database,
  label: string,
): Promise<SeededProfile> {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId,
    profileId,
    displayName: `CR059 ${label}`,
    birthYear: 2000,
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

  const topicTitle = `Topic ${label} — ${RUN_ID}`;
  const [topic] = await database
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum.id,
      bookId: book.id,
      title: topicTitle,
      description: `Confidential topic for ${label}`,
      sortOrder: 0,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });
  if (!topic) throw new Error('topic insert failed');

  await database.insert(learningSessions).values({
    profileId,
    subjectId: subject.id,
    topicId: topic.id,
    status: 'completed',
    exchangeCount: 3,
  });

  return {
    profileId,
    subjectId: subject.id,
    topicId: topic.id,
    topicTitle,
  };
}

async function seedSubjectForProfile(
  database: Database,
  profileId: string,
  label: string,
): Promise<string> {
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
  return subject.id;
}

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function cleanupByPrefix(database: Database): Promise<void> {
  await deleteV2IdentitiesForTest(database, {
    accountIds: [...seededAccountIds],
    profileIds: [...seededProfileIds],
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
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

    it('[WI-80] excludes stale prior-session topic IDs that are not owned by the profile subject', async () => {
      const profileA = await seedProfileWithCompletedSession(db, 'D');
      const profileB = await seedProfileWithCompletedSession(db, 'E');

      await db.insert(learningSessions).values({
        profileId: profileA.profileId,
        subjectId: profileA.subjectId,
        topicId: profileB.topicId,
        status: 'completed',
        exchangeCount: 2,
      });

      const result = await fetchPriorTopics(
        db,
        profileA.profileId,
        profileA.subjectId,
      );

      expect(result.map((topic) => topic.topicId)).toContain(profileA.topicId);
      expect(result.map((topic) => topic.topicId)).not.toContain(
        profileB.topicId,
      );
      expect(result.map((topic) => topic.title)).not.toContain(
        profileB.topicTitle,
      );
    });

    it('[WI-80] excludes cross-subject highlights whose topic is not owned by the session subject', async () => {
      const profileA = await seedProfileWithCompletedSession(db, 'F');
      const profileB = await seedProfileWithCompletedSession(db, 'G');
      const ownedOtherSubjectId = await seedSubjectForProfile(
        db,
        profileA.profileId,
        'F-other',
      );

      await db.insert(learningSessions).values({
        profileId: profileA.profileId,
        subjectId: ownedOtherSubjectId,
        topicId: profileB.topicId,
        status: 'completed',
        exchangeCount: 2,
      });

      const result = await fetchCrossSubjectHighlights(
        db,
        profileA.profileId,
        profileA.subjectId,
        10,
      );

      expect(result.map((highlight) => highlight.title)).not.toContain(
        profileB.topicTitle,
      );
    });
  },
);
