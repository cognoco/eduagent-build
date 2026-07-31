import { resolve } from 'path';
import { inArray } from 'drizzle-orm';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  person,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { getLatestCurricula } from './curriculum';
import { getContinueSuggestion } from './progress';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for integration tests');
  return url;
}

const seededPersonIds: string[] = [];
let db: Database;

async function seedPerson(label: string): Promise<string> {
  const [row] = await db
    .insert(person)
    .values({
      displayName: `Progress ${label}`,
      birthDate: '2010-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning({ id: person.id });
  seededPersonIds.push(row!.id);
  return row!.id;
}

async function seedSubject(
  profileId: string,
  label: string,
): Promise<{ subjectId: string; bookId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: `Progress ${label}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });
  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `Book ${label}`,
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });
  return { subjectId: subject!.id, bookId: book!.id };
}

beforeAll(() => {
  db = createDatabase(requireDatabaseUrl());
});

afterEach(async () => {
  if (seededPersonIds.length === 0) return;
  await db.delete(person).where(inArray(person.id, seededPersonIds));
  seededPersonIds.length = 0;
});

describe('progress version-sensitive reads [WI-2463]', () => {
  it('resumes a paused v1 topic after v2 exists', async () => {
    const profileId = await seedPerson('historical');
    const { subjectId, bookId } = await seedSubject(profileId, 'historical');
    const curriculumRows = await db
      .insert(curricula)
      .values([
        { subjectId, version: 1 },
        { subjectId, version: 2 },
      ])
      .returning({ id: curricula.id, version: curricula.version });
    const v1 = curriculumRows.find((row) => row.version === 1);
    const v2 = curriculumRows.find((row) => row.version === 2);
    if (!v1 || !v2) {
      throw new Error('Expected version 1 and version 2 curriculum fixtures');
    }
    const topicRows = await db
      .insert(curriculumTopics)
      .values([
        {
          curriculumId: v1.id,
          bookId,
          title: 'Historical algebra',
          description: 'Historical algebra description',
          sortOrder: 0,
          estimatedMinutes: 20,
          skipped: false,
        },
        {
          curriculumId: v2.id,
          bookId,
          title: 'Current geometry',
          description: 'Current geometry description',
          sortOrder: 0,
          estimatedMinutes: 20,
          skipped: false,
        },
      ])
      .returning({
        id: curriculumTopics.id,
        curriculumId: curriculumTopics.curriculumId,
      });
    const historicalTopic = topicRows.find((row) => row.curriculumId === v1.id);
    const latestTopic = topicRows.find((row) => row.curriculumId === v2.id);
    if (!historicalTopic || !latestTopic) {
      throw new Error('Expected one topic fixture for each curriculum version');
    }
    const sessionId = generateUUIDv7();
    const now = new Date();
    await db.insert(learningSessions).values({
      id: sessionId,
      profileId,
      subjectId,
      topicId: historicalTopic.id,
      sessionType: 'learning',
      status: 'paused',
      exchangeCount: 1,
      escalationRung: 1,
      startedAt: now,
      lastActivityAt: now,
    });

    const suggestion = await getContinueSuggestion(db, profileId);

    expect(suggestion).toMatchObject({
      subjectId,
      topicId: historicalTopic.id,
      lastSessionId: sessionId,
    });
    expect(suggestion?.topicId).not.toBe(latestTopic.id);

    const currentSessionId = generateUUIDv7();
    await db.insert(learningSessions).values({
      id: currentSessionId,
      profileId,
      subjectId,
      topicId: latestTopic.id,
      sessionType: 'learning',
      status: 'active',
      exchangeCount: 1,
      escalationRung: 1,
      startedAt: new Date(now.getTime() + 60_000),
      lastActivityAt: new Date(now.getTime() + 60_000),
    });

    const currentSuggestion = await getContinueSuggestion(db, profileId);

    expect(currentSuggestion).toMatchObject({
      subjectId,
      topicId: latestTopic.id,
      lastSessionId: currentSessionId,
    });
  });

  it('keeps bounded latest reads profile-scoped in real PostgreSQL', async () => {
    const ownerProfileId = await seedPerson('owner');
    const foreignProfileId = await seedPerson('foreign');
    const owner = await seedSubject(ownerProfileId, 'owner');
    const foreign = await seedSubject(foreignProfileId, 'foreign');
    const curriculumRows = await db
      .insert(curricula)
      .values([
        { subjectId: owner.subjectId, version: 1 },
        { subjectId: owner.subjectId, version: 2 },
        { subjectId: foreign.subjectId, version: 1 },
      ])
      .returning({
        id: curricula.id,
        subjectId: curricula.subjectId,
        version: curricula.version,
      });
    const ownerV1 = curriculumRows.find(
      (row) => row.subjectId === owner.subjectId && row.version === 1,
    );
    const ownerV2 = curriculumRows.find(
      (row) => row.subjectId === owner.subjectId && row.version === 2,
    );
    const foreignV1 = curriculumRows.find(
      (row) => row.subjectId === foreign.subjectId && row.version === 1,
    );
    if (!ownerV1 || !ownerV2 || !foreignV1) {
      throw new Error('Expected owner and foreign curriculum fixtures');
    }

    const latest = await getLatestCurricula(db, ownerProfileId, [
      owner.subjectId,
      foreign.subjectId,
    ]);

    expect([...latest.keys()]).toEqual([owner.subjectId]);
    expect(latest.get(owner.subjectId)?.id).toBe(ownerV2.id);
    expect(latest.get(owner.subjectId)?.id).not.toBe(ownerV1.id);
    expect([...latest.values()].map((row) => row.id)).not.toContain(
      foreignV1.id,
    );
  });
});
