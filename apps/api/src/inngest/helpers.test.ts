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
  enterWithEnvBindings,
  getStepAppUrl,
  getStepDatabase,
  getStepSupportEmail,
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

  // Env bindings were previously module-level singletons: the middleware
  // pass of a concurrently-arriving invocation could overwrite the values a
  // running invocation would read in its next step. The bindings now live in
  // AsyncLocalStorage, scoped per async context.
  describe('env-binding isolation across concurrent invocations', () => {
    /**
     * Runs `fn` inside its own setImmediate callback — a fresh async
     * resource, modelling how each Inngest invocation arrives as its own
     * request with its own async root. enterWithEnvBindings inside one
     * detached invocation must not leak into a sibling.
     */
    function runDetached<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        setImmediate(() => {
          fn().then(resolve, reject);
        });
      });
    }

    it('two interleaved invocation contexts each read their own bindings', async () => {
      const reads: Record<string, { appUrl: string; supportEmail: string }> =
        {};

      const invocation = (id: string, appUrl: string, supportEmail: string) =>
        runDetached(async () => {
          enterWithEnvBindings({ appUrl, supportEmail });
          // Yield so the other invocation's enterWithEnvBindings runs in
          // between — with module-level singletons this would clobber ours.
          await new Promise((resolve) => setImmediate(resolve));
          reads[id] = {
            appUrl: getStepAppUrl(),
            supportEmail: getStepSupportEmail(),
          };
        });

      await Promise.all([
        invocation('a', 'https://a.example.com', 'a@example.com'),
        invocation('b', 'https://b.example.com', 'b@example.com'),
      ]);

      expect(reads['a']).toEqual({
        appUrl: 'https://a.example.com',
        supportEmail: 'a@example.com',
      });
      expect(reads['b']).toEqual({
        appUrl: 'https://b.example.com',
        supportEmail: 'b@example.com',
      });
    });

    it('a database URL bound in one invocation is invisible to a sibling invocation', async () => {
      const url =
        'postgresql://user:pw@ep-a.us-east-2.aws.neon.tech/db?sslmode=require';

      await Promise.all([
        runDetached(async () => {
          enterWithEnvBindings({ databaseUrl: url });
          await new Promise((resolve) => setImmediate(resolve));
          expect(getStepDatabase()).toEqual({ kind: 'db' });
          expect(mockCreateDatabase).toHaveBeenCalledWith(url, {
            cacheNeonPool: false,
          });
        }),
        runDetached(async () => {
          await new Promise((resolve) => setImmediate(resolve));
          // No bindings in this invocation and no process.env fallback — the
          // sibling's URL must NOT leak here.
          expect(() => getStepDatabase()).toThrow(/DATABASE_URL not available/);
        }),
      ]);
    });
  });
});
