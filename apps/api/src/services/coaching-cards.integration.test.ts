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
import { precomputeCoachingCard } from './coaching-cards';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for integration tests');
  return url;
}

const seededPersonIds: string[] = [];
let db: Database;

async function seedVersionedCurriculum(input: {
  label: string;
  v1Topic: string;
  v2Topic: string;
  topicsGenerated: boolean;
}) {
  const [profile] = await db
    .insert(person)
    .values({
      displayName: `Coaching ${input.label}`,
      birthDate: '2010-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning({ id: person.id });
  seededPersonIds.push(profile!.id);

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: `Subject ${input.label}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });
  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `Book ${input.label}`,
      emoji: '📚',
      sortOrder: 0,
      topicsGenerated: input.topicsGenerated,
    })
    .returning({ id: curriculumBooks.id });
  const [v1, v2] = await db
    .insert(curricula)
    .values([
      { subjectId: subject!.id, version: 1 },
      { subjectId: subject!.id, version: 2 },
    ])
    .returning({ id: curricula.id, version: curricula.version });
  const [v1Topic, v2Topic] = await db
    .insert(curriculumTopics)
    .values([
      {
        curriculumId: v1!.id,
        bookId: book!.id,
        title: input.v1Topic,
        description: `${input.v1Topic} description`,
        sortOrder: 0,
        estimatedMinutes: 20,
        skipped: false,
      },
      {
        curriculumId: v2!.id,
        bookId: book!.id,
        title: input.v2Topic,
        description: `${input.v2Topic} description`,
        sortOrder: 0,
        estimatedMinutes: 20,
        skipped: false,
      },
    ])
    .returning({ id: curriculumTopics.id });

  return {
    profileId: profile!.id,
    subjectId: subject!.id,
    v1TopicId: v1Topic!.id,
    v2TopicId: v2Topic!.id,
  };
}

async function seedHomework(
  profileId: string,
  subjectId: string,
  practicedSkill: string,
): Promise<void> {
  const now = new Date();
  await db.insert(learningSessions).values({
    id: generateUUIDv7(),
    profileId,
    subjectId,
    topicId: null,
    sessionType: 'homework',
    status: 'completed',
    exchangeCount: 1,
    escalationRung: 1,
    startedAt: now,
    lastActivityAt: now,
    endedAt: now,
    metadata: {
      homeworkSummary: { practicedSkills: [practicedSkill] },
    },
  });
}

beforeAll(() => {
  db = createDatabase(requireDatabaseUrl());
});

afterEach(async () => {
  if (seededPersonIds.length === 0) return;
  await db.delete(person).where(inArray(person.id, seededPersonIds));
  seededPersonIds.length = 0;
});

describe('coaching cards use latest curricula [WI-2463]', () => {
  it('ignores a homework match that exists only in v1 and matches v2 when the current skill changes', async () => {
    const seeded = await seedVersionedCurriculum({
      label: 'homework',
      v1Topic: 'Fractions',
      v2Topic: 'Geometry',
      topicsGenerated: false,
    });
    await seedHomework(seeded.profileId, seeded.subjectId, 'fractions');

    const staleMatch = await precomputeCoachingCard(db, seeded.profileId);

    expect(staleMatch.type).not.toBe('homework_connection');
    expect(JSON.stringify(staleMatch)).not.toContain(seeded.v1TopicId);

    await seedHomework(seeded.profileId, seeded.subjectId, 'geometry');
    const latestMatch = await precomputeCoachingCard(db, seeded.profileId);

    expect(latestMatch).toMatchObject({
      type: 'homework_connection',
      topicId: seeded.v2TopicId,
      homeworkSkill: 'geometry',
    });
  });

  it('selects an uncovered continue-book topic from v2, not the first-encountered v1 row', async () => {
    const seeded = await seedVersionedCurriculum({
      label: 'continue',
      v1Topic: 'Obsolete arithmetic',
      v2Topic: 'Current algebra',
      topicsGenerated: true,
    });

    const card = await precomputeCoachingCard(db, seeded.profileId);

    expect(card).toMatchObject({
      type: 'continue_book',
      topicId: seeded.v2TopicId,
    });
    expect(JSON.stringify(card)).not.toContain(seeded.v1TopicId);
  });
});
