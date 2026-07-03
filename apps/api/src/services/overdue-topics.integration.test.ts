/**
 * Integration: merged relearn queue cross-profile isolation [Flow 3 / RR-10 / T10]
 *
 * Real-DB belt for the [T10] scoped-read break test in overdue-topics.test.ts:
 * the needs_deepening union in getOverdueTopicsGrouped must never surface a
 * sibling profile's flagged topics, and must reason-tag a profile's own rows
 * (both / flagged_weak). No mocks of repository, services, or schema.
 */

import { resolve } from 'path';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  needsDeepeningTopics,
  retentionCards,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import { getOverdueTopicsGrouped } from './overdue-topics';

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
const CLERK_PREFIX = `integ-overdue-merge-${RUN_ID}`;
const DAY_MS = 24 * 60 * 60 * 1000;

interface SeededProfile {
  profileId: string;
  subjectId: string;
  topicId: string;
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
    displayName: `Merge Test ${label}`,
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
    .values({ subjectId: subject!.id, title: `Book ${label}`, sortOrder: 0 })
    .returning({ id: curriculumBooks.id });

  const [topic] = await database
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: `Topic ${label}`,
      description: `Description ${label}`,
      sortOrder: 0,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });

  return {
    profileId,
    subjectId: subject!.id,
    topicId: topic!.id,
  };
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

let db: Database;
let profileA: SeededProfile;
let profileB: SeededProfile;

beforeAll(async () => {
  db = createDatabase(requireDatabaseUrl());

  profileA = await seedProfileWithTopic(db, 'A');
  profileB = await seedProfileWithTopic(db, 'B');

  // Profile A: topic is BOTH overdue (a due retention card) AND flagged.
  await db.insert(retentionCards).values({
    profileId: profileA.profileId,
    topicId: profileA.topicId,
    intervalDays: 1,
    lastReviewedAt: new Date(Date.now() - 5 * DAY_MS),
    nextReviewAt: new Date(Date.now() - 2 * DAY_MS),
  });
  await db.insert(needsDeepeningTopics).values({
    profileId: profileA.profileId,
    subjectId: profileA.subjectId,
    topicId: profileA.topicId,
    status: 'active',
    concept: 'Concept A',
  });

  // Profile B: a flagged-only topic. Must never leak into A's queue.
  await db.insert(needsDeepeningTopics).values({
    profileId: profileB.profileId,
    subjectId: profileB.subjectId,
    topicId: profileB.topicId,
    status: 'active',
    concept: 'Concept B',
  });
});

afterAll(async () => {
  await cleanupByPrefix(db);
});

describe('getOverdueTopicsGrouped merged queue (integration) [Flow 3 / RR-10 / T10]', () => {
  it("tags profile A's overdue+flagged topic as both and excludes profile B's flagged topic", async () => {
    const result = await getOverdueTopicsGrouped(db, profileA.profileId);

    const allTopicIds = result.subjects.flatMap((s) =>
      s.topics.map((t) => t.topicId),
    );
    expect(allTopicIds).toContain(profileA.topicId);
    expect(allTopicIds).not.toContain(profileB.topicId);

    const topicA = result.subjects
      .flatMap((s) => s.topics)
      .find((t) => t.topicId === profileA.topicId);
    expect(topicA?.reason).toBe('both');
    expect(topicA?.concept).toBe('Concept A');
  });

  it("surfaces profile B's flagged-only topic as flagged_weak and excludes profile A's topic", async () => {
    const result = await getOverdueTopicsGrouped(db, profileB.profileId);

    const allTopicIds = result.subjects.flatMap((s) =>
      s.topics.map((t) => t.topicId),
    );
    expect(allTopicIds).toContain(profileB.topicId);
    expect(allTopicIds).not.toContain(profileA.topicId);

    const topicB = result.subjects
      .flatMap((s) => s.topics)
      .find((t) => t.topicId === profileB.topicId);
    expect(topicB?.reason).toBe('flagged_weak');
    expect(topicB?.overdueDays).toBe(0);
    expect(topicB?.concept).toBe('Concept B');
    // B has no overdue retention card.
    expect(result.totalOverdue).toBe(0);
  });
});
