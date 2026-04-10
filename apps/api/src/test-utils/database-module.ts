/// <reference types="jest" />
import { createMockDb } from '@eduagent/test-utils';

type MockDatabaseRecord = Record<string, unknown>;

type CreateDatabaseModuleMockOptions<TDb extends MockDatabaseRecord> = {
  db?: TDb;
  includeActual?: boolean;
  exports?: MockDatabaseRecord;
};

/**
 * Shared factory for tests that still replace `@eduagent/database`.
 *
 * This keeps today's mock-based unit/route suites consistent while making
 * the eventual migration to real DB-backed integration tests cheaper:
 * each suite can later delete one helper usage instead of unwinding a bespoke
 * inline module factory.
 */
export function createDatabaseModuleMock<TDb extends MockDatabaseRecord>(
  options: CreateDatabaseModuleMockOptions<TDb> = {}
): {
  db: TDb;
  createDatabase: jest.Mock;
  module: MockDatabaseRecord;
} {
  const db = (options.db ?? (createMockDb() as TDb)) as TDb;
  const createDatabase = jest.fn().mockReturnValue(db);

  return {
    db,
    createDatabase,
    module: {
      ...(options.includeActual
        ? jest.requireActual('@eduagent/database')
        : {}),
      createDatabase,
      ...(options.exports ?? {}),
    },
  };
}

export function createTransactionalMockDb<TDb extends MockDatabaseRecord>(
  overrides: Partial<TDb> = {}
): TDb & { transaction: jest.Mock } {
  const db = {
    ...(createMockDb() as MockDatabaseRecord),
    ...overrides,
  } as TDb & { transaction?: jest.Mock };

  db.transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));

  return db as TDb & { transaction: jest.Mock };
}
