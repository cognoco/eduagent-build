const mockDb = { kind: 'db' };
const mockCreateDatabase = jest.fn(
  (_databaseUrl: string, _options?: unknown) => mockDb,
);

jest.mock('@eduagent/database', () => ({
  createDatabase: (databaseUrl: string, options?: unknown) =>
    mockCreateDatabase(databaseUrl, options),
}));

import { getStepDatabase, resetDatabaseUrl, setDatabaseUrl } from './helpers';

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

    expect(getStepDatabase()).toBe(mockDb);
    expect(mockCreateDatabase).toHaveBeenCalledWith(url, {
      cacheNeonPool: false,
    });
  });
});
