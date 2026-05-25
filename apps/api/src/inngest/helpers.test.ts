const mockCreateDatabase = jest.fn(
  (_databaseUrl: string, _options?: unknown) => ({
    kind: 'db',
  }),
);
const mockCloseDatabase = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '@eduagent/database',
  /* gc1-allow: db-boundary: createDatabase opens real Neon WebSocket connections unavailable in unit test environment; real DB covered by integration tests */ () => ({
    createDatabase: (databaseUrl: string, options?: unknown) =>
      mockCreateDatabase(databaseUrl, options),
    closeDatabase: (db: unknown) => mockCloseDatabase(db),
  }),
);

import {
  closeStepDatabases,
  getStepDatabase,
  resetDatabaseUrl,
  runWithStepDatabaseScope,
  setDatabaseUrl,
} from './helpers';

describe('Inngest helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDatabaseUrl();
    delete process.env['DATABASE_URL'];
  });

  it('[WI-84 DS-228] creates step databases with Neon pool cache disabled', () => {
    const url =
      'postgresql://user:pw@ep-test.us-east-2.aws.neon.tech/db?sslmode=require';

    setDatabaseUrl(url);

    expect(getStepDatabase()).toEqual({ kind: 'db' });
    expect(mockCreateDatabase).toHaveBeenCalledWith(url, {
      cacheNeonPool: false,
    });
  });

  it('[WI-84 review] closes every step database created in a run scope', async () => {
    const url =
      'postgresql://user:pw@ep-test.us-east-2.aws.neon.tech/db?sslmode=require';

    await runWithStepDatabaseScope(async () => {
      setDatabaseUrl(url);
      getStepDatabase();
      getStepDatabase();
      await closeStepDatabases();
    });

    expect(mockCloseDatabase).toHaveBeenCalledTimes(2);
    expect(mockCloseDatabase).toHaveBeenCalledWith({ kind: 'db' });
  });
});
