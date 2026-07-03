/**
 * Integration (break test): BUG-354 — cross-profile topic leak via evaluate-eligibility
 *
 * Registers two profiles (A and B), seeds a curriculum topic for each, then
 * calls checkEvaluateEligibility as profile A passing profile B's topicId.
 *
 * Before the fix: the query used db.query.curriculumTopics.findFirst(topicId)
 * with no parent-chain join — it would return B's topic title to A.
 * After the fix:  the query enforces subjects.profileId = profileId, so B's
 * topic is invisible to A and topicTitle falls back to the raw topicId.
 *
 * Red-green pattern verified: the test was written and seen to fail against
 * the unfixed code (raw findFirst), then pass after the parent-chain join was
 * added.
 */

import { resolve } from 'path';
import {
  curricula,
  curriculumBooks,
  curriculumTopics,
  createDatabase,
  generateUUIDv7,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { checkEvaluateEligibility } from './evaluate-data';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

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
const CLERK_PREFIX = `integ-bug354-${RUN_ID}`;

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

interface SeededProfile {
  profileId: string;
  topicId: string;
  topicTitle: string;
}

async function seedProfileWithTopic(
  database: Database,
  label: string,
): Promise<SeededProfile> {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId,
    profileId,
    displayName: `BUG354 ${label}`,
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

  const topicTitle = `SECRET topic of profile ${label} — ${RUN_ID}`;
  const [topic] = await database
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum.id,
      bookId: book.id,
      title: topicTitle,
      description: `Confidential content for ${label}`,
      sortOrder: 0,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });
  if (!topic) throw new Error('topic insert failed');

  return { profileId, topicId: topic.id, topicTitle };
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
// Suite
// ---------------------------------------------------------------------------

let db: Database;

beforeAll(async () => {
  db = createIntegrationDb();
  await cleanupByPrefix(db);
});

afterAll(async () => {
  await cleanupByPrefix(db);
});

describe('BUG-354: checkEvaluateEligibility cross-profile topic leak (integration)', () => {
  it("does not expose another profile's topic title when profileId does not own the topic", async () => {
    const profileA = await seedProfileWithTopic(db, 'A');
    const profileB = await seedProfileWithTopic(db, 'B');

    // Profile A requests eligibility using profile B's topicId.
    // No retention card exists for A on B's topic, so eligible = false is expected.
    // The critical assertion: topicTitle must NOT be B's secret topic title.
    const result = await checkEvaluateEligibility(
      db,
      profileA.profileId,
      profileB.topicId, // foreign topic
    );

    // eligible = false because A has no retention card for B's topic
    expect(result.eligible).toBe(false);

    // topicTitle must NOT leak B's topic title to A
    expect(result.topicTitle).not.toBe(profileB.topicTitle);

    // Falls back to raw topicId (the sentinel value used when topic not found)
    expect(result.topicTitle).toBe(profileB.topicId);
  });

  it('returns the correct topic title when the topic belongs to the requesting profile', async () => {
    const profileA = await seedProfileWithTopic(db, 'C');

    // Profile A requests eligibility for their OWN topic — should see title
    const result = await checkEvaluateEligibility(
      db,
      profileA.profileId,
      profileA.topicId,
    );

    // eligible = false (no retention card seeded), but title must be visible
    expect(result.eligible).toBe(false);
    expect(result.topicTitle).toBe(profileA.topicTitle);
  });
});
