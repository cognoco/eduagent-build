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
  options: CreateDatabaseModuleMockOptions<TDb> = {},
): {
  db: TDb;
  createDatabase: jest.Mock;
  closeDatabase: jest.Mock;
  module: MockDatabaseRecord;
} {
  const db = (options.db ?? (createMockDb() as TDb)) as TDb;
  const createDatabase = jest.fn().mockReturnValue(db);
  const closeDatabase = jest.fn().mockResolvedValue(undefined);

  // [F-078] When the mock DB is used, withProfileScope must be overridden to
  // skip the UUID validation (test profiles use non-UUID ids like 'test-profile-id')
  // and to call fn(db) directly — the mock db.transaction handles the pass-through.
  // The actual RLS GUC behavior is tested in the integration suite (rls.integration.test.ts).
  const withProfileScope = jest
    .fn()
    .mockImplementation(
      async <T>(
        _db: unknown,
        _profileId: string,
        fn: (tx: unknown) => Promise<T>,
      ) => fn(db),
    );

  return {
    db,
    createDatabase,
    closeDatabase,
    module: {
      ...(options.includeActual
        ? jest.requireActual('@eduagent/database')
        : {}),
      createDatabase,
      closeDatabase,
      withProfileScope,
      ...(options.exports ?? {}),
    },
  };
}

export function createTransactionalMockDb<TDb extends MockDatabaseRecord>(
  overrides: Partial<TDb> = {},
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
