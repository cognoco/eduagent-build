import {
  bookmarks,
  guardianship,
  learningProfiles,
  learningSessions,
  monthlyReports,
  practiceActivityEvents,
  sessionSummaries,
  supportership,
  topicNotes,
  weeklyReports,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';

import { seedScenario } from './test-seed';

type InsertRecord = {
  table: unknown;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
};

function createRecordingDb(): {
  db: Database;
  inserts: InsertRecord[];
} {
  const inserts: InsertRecord[] = [];
  const selectChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([]),
    limit: jest.fn().mockResolvedValue([]),
  };

  const db = {
    insert: jest.fn((table: unknown) => ({
      values: jest.fn(
        (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
          if (table === practiceActivityEvents) {
            const persistedValues = {
              ...(values as Record<string, unknown>),
              id: generateUUIDv7(),
            };
            inserts.push({ table, values: persistedValues });
            return {
              onConflictDoNothing: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([persistedValues]),
              }),
            };
          }
          inserts.push({ table, values });
          return Promise.resolve(undefined);
        },
      ),
    })),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    select: jest.fn().mockReturnValue(selectChain),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([]),
      }),
    }),
    execute: jest.fn().mockResolvedValue({ rows: [{ reg: null }] }),
  } as unknown as Database;

  return { db, inserts };
}

function insertedRow(
  inserts: InsertRecord[],
  table: unknown,
  id: string,
): Record<string, unknown> {
  const values = inserts
    .filter((record) => record.table === table)
    .flatMap((record) =>
      Array.isArray(record.values) ? record.values : [record.values],
    );
  const row = values.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`No inserted row found for ${id}`);
  return row;
}

function requiredId(ids: Record<string, string>, key: string): string {
  const value = ids[key];
  if (!value) throw new Error(`Seed result omitted required id: ${key}`);
  return value;
}

describe('v2-journal-paper-trail seed', () => {
  it('returns learner-owned identities for every Journal paper-trail artifact', async () => {
    const { db, inserts } = createRecordingDb();

    const result = await seedScenario(
      db,
      'v2-journal-paper-trail',
      'v2-journal@example.com',
    );

    const subjectId = requiredId(result.ids, 'subjectId');
    const topicId = requiredId(result.ids, 'topicId');
    const sessionId = requiredId(result.ids, 'sessionId');
    const sessionSummaryId = requiredId(result.ids, 'sessionSummaryId');
    const learnerNoteId = requiredId(result.ids, 'learnerNoteId');
    const bookmarkId = requiredId(result.ids, 'bookmarkId');
    const practiceActivityEventId = requiredId(
      result.ids,
      'practiceActivityEventId',
    );
    const weeklyReportId = requiredId(result.ids, 'weeklyReportId');
    const monthlyReportId = requiredId(result.ids, 'monthlyReportId');
    const mentorMemoryId = requiredId(result.ids, 'mentorMemoryId');

    expect(result.scenario).toBe('v2-journal-paper-trail');
    expect(result.ids.learnerProfileId).toBe(result.profileId);
    expect(result.ids.recapId).toBe(sessionId);
    for (const id of [
      subjectId,
      topicId,
      sessionId,
      sessionSummaryId,
      learnerNoteId,
      bookmarkId,
      practiceActivityEventId,
      weeklyReportId,
      monthlyReportId,
      mentorMemoryId,
    ]) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
    expect(result.ids).toEqual(
      expect.objectContaining({
        subjectId: expect.any(String),
        topicId: expect.any(String),
        sessionId: expect.any(String),
        recapId: expect.any(String),
        sessionSummaryId: expect.any(String),
        learnerNoteId: expect.any(String),
        bookmarkId: expect.any(String),
        practiceActivityEventId: expect.any(String),
        weeklyReportId: expect.any(String),
        monthlyReportId: expect.any(String),
        mentorMemoryId: expect.any(String),
      }),
    );

    expect(insertedRow(inserts, learningSessions, sessionId)).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        subjectId,
        topicId,
        status: 'completed',
      }),
    );
    expect(insertedRow(inserts, sessionSummaries, sessionSummaryId)).toEqual(
      expect.objectContaining({
        sessionId,
        profileId: result.profileId,
        topicId,
        learnerRecap:
          'We traced how photosynthesis stores sunlight as chemical energy in glucose.',
      }),
    );
    expect(insertedRow(inserts, topicNotes, learnerNoteId)).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        sessionId,
        topicId,
      }),
    );
    expect(insertedRow(inserts, bookmarks, bookmarkId)).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        sessionId,
        subjectId,
        topicId,
      }),
    );

    expect(
      insertedRow(inserts, practiceActivityEvents, practiceActivityEventId),
    ).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        subjectId,
        metadata: expect.objectContaining({ topicId }),
      }),
    );

    for (const [table, id] of [
      [weeklyReports, weeklyReportId],
      [monthlyReports, monthlyReportId],
    ] as const) {
      expect(insertedRow(inserts, table, id)).toEqual(
        expect.objectContaining({
          profileId: result.profileId,
          childProfileId: result.profileId,
        }),
      );
    }

    expect(insertedRow(inserts, learningProfiles, mentorMemoryId)).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        memoryConsentStatus: 'granted',
        memoryCollectionEnabled: true,
        memoryInjectionEnabled: true,
      }),
    );
    expect(inserts.some((record) => record.table === guardianship)).toBe(false);
    expect(inserts.some((record) => record.table === supportership)).toBe(
      false,
    );
  });
});
