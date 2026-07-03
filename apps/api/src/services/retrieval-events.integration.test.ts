/**
 * Integration: recordRetrievalEvent round-trip [review-continuity Flow 2 / T3]
 *
 * Verifies the recall-log writer persists every enum/text/jsonb field and that
 * both the graded (`llm`) and ungraded (`fallback_heuristic`) shapes survive a
 * round-trip. Uses a real database. No mocks of repository, services, or schema.
 */

import { resolve } from 'path';
import { and, eq } from 'drizzle-orm';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  retrievalEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import { recordRetrievalEvent } from './retrieval-events';

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
const CLERK_PREFIX = `integ-retrieval-${RUN_ID}`;

interface Seeded {
  profileId: string;
  subjectId: string;
  topicId: string;
}

async function seedProfileWithTopic(
  database: Database,
  label: string,
): Promise<Seeded> {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  // [ic-362] retrievalEvents.profileId FKs to person (see
  // packages/database/src/schema/retrieval-events.ts) — the app writes
  // person ids into this column. ensureV2IdentityForLegacyProfileTest seeds
  // person with id === profileId, mirroring the identity-v2 bridge.
  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId,
    profileId,
    displayName: `${CLERK_PREFIX}-${label}`,
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

beforeAll(async () => {
  db = createDatabase(requireDatabaseUrl());
});

afterAll(async () => {
  await cleanupByPrefix(db);
});

describe('recordRetrievalEvent round-trip (integration) [Flow 2 / T3]', () => {
  it('persists a fully-populated graded (llm) row', async () => {
    const seed = await seedProfileWithTopic(db, 'graded');

    await recordRetrievalEvent(db, {
      profileId: seed.profileId,
      subjectId: seed.subjectId,
      topicId: seed.topicId,
      sessionId: null,
      answerEventId: null,
      promptText: 'Explain photosynthesis',
      learnerAnswer: 'Plants make food from sunlight, water, and CO2.',
      quality: 4,
      verdict: 'partial',
      nextAction: 'advance',
      gradedBy: 'llm',
      rubricRationale: 'Captured the inputs but omitted chlorophyll.',
      misconception: null,
      evidenceUsed: ['event-1', 'event-2'],
      llmRoutingRung: 1,
    });

    const rows = await db
      .select()
      .from(retrievalEvents)
      .where(
        and(
          eq(retrievalEvents.profileId, seed.profileId),
          eq(retrievalEvents.topicId, seed.topicId),
        ),
      );

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.subjectId).toBe(seed.subjectId);
    expect(row.promptText).toBe('Explain photosynthesis');
    expect(row.learnerAnswer).toBe(
      'Plants make food from sunlight, water, and CO2.',
    );
    expect(row.quality).toBe(4);
    expect(row.verdict).toBe('partial');
    expect(row.nextAction).toBe('advance');
    expect(row.gradedBy).toBe('llm');
    expect(row.rubricRationale).toBe(
      'Captured the inputs but omitted chlorophyll.',
    );
    expect(row.misconception).toBeNull();
    expect(row.evidenceUsed).toEqual(['event-1', 'event-2']);
    expect(row.llmRoutingRung).toBe(1);
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('persists an ungraded fallback_heuristic row with null structured fields', async () => {
    const seed = await seedProfileWithTopic(db, 'fallback');

    await recordRetrievalEvent(db, {
      profileId: seed.profileId,
      subjectId: seed.subjectId,
      topicId: seed.topicId,
      promptText: 'Explain mitosis',
      learnerAnswer: 'It is when cells split.',
      nextAction: 'reschedule_soon',
      gradedBy: 'fallback_heuristic',
    });

    const rows = await db
      .select()
      .from(retrievalEvents)
      .where(
        and(
          eq(retrievalEvents.profileId, seed.profileId),
          eq(retrievalEvents.topicId, seed.topicId),
        ),
      );

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.gradedBy).toBe('fallback_heuristic');
    expect(row.nextAction).toBe('reschedule_soon');
    expect(row.quality).toBeNull();
    expect(row.verdict).toBeNull();
    expect(row.rubricRationale).toBeNull();
    expect(row.misconception).toBeNull();
    expect(row.evidenceUsed).toEqual([]);
    expect(row.llmRoutingRung).toBeNull();
  });
});
