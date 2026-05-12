import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  learningSessions,
  subjects,
  vocabulary,
  type Database,
} from '@eduagent/database';
import { and, eq } from 'drizzle-orm';
import { resetDatabase, seedScenario } from './test-seed';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
const EMAIL_PREFIX = `seed-language-learner-${RUN_ID}-`;
const EMAIL = `${EMAIL_PREFIX}user@test.invalid`;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for language learner seed integration tests',
    );
  }

  db = createDatabase(databaseUrl);
});

afterAll(async () => {
  await resetDatabase(db, {}, { prefix: EMAIL_PREFIX });
});

describe('language-learner seed scenario integration', () => {
  it('creates a language subject with vocabulary inventory and completed sessions', async () => {
    const result = await seedScenario(db, 'language-learner', EMAIL);

    expect(result.scenario).toBe('language-learner');
    expect(typeof result.ids.subjectId).toBe('string');

    const [subject] = await db
      .select()
      .from(subjects)
      .where(eq(subjects.id, result.ids.subjectId));

    expect(subject).toEqual(
      expect.objectContaining({
        id: result.ids.subjectId,
        profileId: result.profileId,
        name: 'Spanish',
        pedagogyMode: 'four_strands',
        languageCode: 'es',
      }),
    );

    const vocabRows = await db
      .select()
      .from(vocabulary)
      .where(
        and(
          eq(vocabulary.profileId, result.profileId),
          eq(vocabulary.subjectId, result.ids.subjectId),
        ),
      );

    expect(vocabRows).toHaveLength(3);
    expect(
      vocabRows
        .map((row: typeof vocabulary.$inferSelect) => row.termNormalized)
        .sort(),
    ).toEqual(['biblioteca', 'gracias', 'hola']);
    expect(
      vocabRows.map((row: typeof vocabulary.$inferSelect) => row.cefrLevel),
    ).toEqual(expect.arrayContaining(['A1', 'A2']));

    const sessions = await db
      .select()
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.profileId, result.profileId),
          eq(learningSessions.status, 'completed'),
        ),
      );

    expect(sessions).toHaveLength(4);
    expect(
      sessions.every(
        (session: typeof learningSessions.$inferSelect) =>
          session.subjectId === result.ids.subjectId,
      ),
    ).toBe(true);
  });
});
