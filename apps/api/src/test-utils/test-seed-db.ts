/// <reference types="jest" />

import { practiceActivityEvents, type Database } from '@eduagent/database';

export type TestSeedInsertRecord = {
  table: unknown;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
};

export function createRecordingDb(): {
  db: Database;
  inserts: TestSeedInsertRecord[];
} {
  const inserts: TestSeedInsertRecord[] = [];
  const deleteWhere = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue([]),
  });
  const selectChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([]),
    innerJoin: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([]),
      }),
    }),
    limit: jest.fn().mockResolvedValue([]),
  };
  const updateChain = {
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  };

  const db = {
    insert: jest.fn((table: unknown) => ({
      values: jest.fn(
        (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
          if (table === practiceActivityEvents && !Array.isArray(values)) {
            const persistedValues = {
              ...values,
              id: '019d14f4-735f-7e11-8800-000000000001',
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
    update: jest.fn().mockReturnValue(updateChain),
    select: jest.fn().mockReturnValue(selectChain),
    delete: jest.fn().mockReturnValue({
      where: deleteWhere,
    }),
    execute: jest.fn().mockResolvedValue({ rows: [{ reg: null }] }),
    query: {
      curricula: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'mock-curriculum-id',
          subjectId: 'mock-subject-id',
        }),
      },
      curriculumTopics: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'mock-topic-id',
          curriculumId: 'mock-curriculum-id',
        }),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'mock-topic-id', curriculumId: 'mock-curriculum-id' },
          ]),
      },
      subjects: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    },
  } as unknown as Database;

  return { db, inserts };
}
