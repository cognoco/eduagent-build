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

const mockCaptureException = jest.fn();

jest.mock(
  '../services/sentry' /* gc1-allow: sentry-boundary: @sentry/cloudflare SDK initializes a Worker-scoped client that cannot run in Node.js test environment; guards observable behavior via mock */,
  () => {
    const actual = jest.requireActual(
      '../services/sentry',
    ) as typeof import('../services/sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

import {
  closeStepDatabases,
  enterWithEnvBindings,
  getStepAppUrl,
  getStepClerkSecretKey,
  getStepDatabase,
  getStepEmailFrom,
  getStepMemoryFactsDedupConfig,
  getStepResendApiKey,
  getStepRetentionPurgeEnabled,
  getStepSupportEmail,
  isIdentityV2EnabledInStep,
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

  // ---------------------------------------------------------------------------
  // [WI-1045] Binding-absent guards: helpers that fall back to process.env
  // must call captureException when the AsyncLocalStorage binding is absent
  // outside NODE_ENV=test (i.e., when the Inngest middleware is not wired or
  // the async context is lost across a step boundary).
  //
  // Each test:
  //   1. Sets NODE_ENV to 'production' to enable the guard path.
  //   2. Calls the helper with no binding in the ALS context AND no process.env.
  //   3. Asserts captureException was called with the binding key in extras.
  //   4. Restores NODE_ENV and process.env in the finally block.
  //
  // Red-green: without the warnMissingBinding guard the helpers return a
  // default silently and captureException is never called.
  // ---------------------------------------------------------------------------
  describe('[WI-1045] env binding-absent guards fire captureException in prod', () => {
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      mockCaptureException.mockClear();
      originalNodeEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';
      // Ensure no process.env fallbacks are present
      delete process.env['APP_URL'];
      delete process.env['SUPPORT_EMAIL'];
      delete process.env['EMAIL_FROM'];
      delete process.env['RESEND_API_KEY'];
      delete process.env['RETENTION_PURGE_ENABLED'];
      delete process.env['CLERK_SECRET_KEY'];
      delete process.env['MEMORY_FACTS_DEDUP_ENABLED'];
      delete process.env['IDENTITY_V2_ENABLED'];
    });

    afterEach(() => {
      process.env['NODE_ENV'] = originalNodeEnv;
    });

    it('getStepAppUrl: captureException called when binding absent', () => {
      getStepAppUrl();
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('appUrl'),
        }),
        expect.objectContaining({
          extra: expect.objectContaining({ bindingKey: 'appUrl' }),
        }),
      );
    });

    it('getStepSupportEmail: captureException called when binding absent', () => {
      getStepSupportEmail();
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('supportEmail'),
        }),
        expect.objectContaining({
          extra: expect.objectContaining({ bindingKey: 'supportEmail' }),
        }),
      );
    });

    it('getStepEmailFrom: captureException called when binding absent', () => {
      getStepEmailFrom();
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('emailFrom'),
        }),
        expect.objectContaining({
          extra: expect.objectContaining({ bindingKey: 'emailFrom' }),
        }),
      );
    });

    it('getStepResendApiKey: captureException called when binding absent', () => {
      getStepResendApiKey();
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('resendApiKey'),
        }),
        expect.objectContaining({
          extra: expect.objectContaining({ bindingKey: 'resendApiKey' }),
        }),
      );
    });

    it('getStepRetentionPurgeEnabled: captureException called when binding absent', () => {
      getStepRetentionPurgeEnabled();
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('retentionPurgeEnabled'),
        }),
        expect.objectContaining({
          extra: expect.objectContaining({
            bindingKey: 'retentionPurgeEnabled',
          }),
        }),
      );
    });

    it('getStepClerkSecretKey: captureException called when binding absent', () => {
      getStepClerkSecretKey();
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('clerkSecretKey'),
        }),
        expect.objectContaining({
          extra: expect.objectContaining({ bindingKey: 'clerkSecretKey' }),
        }),
      );
    });

    it('getStepMemoryFactsDedupConfig: captureException called when binding absent', () => {
      getStepMemoryFactsDedupConfig();
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('memoryFactsDedupEnabled'),
        }),
        expect.objectContaining({
          extra: expect.objectContaining({
            bindingKey: 'memoryFactsDedupEnabled',
          }),
        }),
      );
    });

    it('isIdentityV2EnabledInStep: captureException called when binding absent', () => {
      isIdentityV2EnabledInStep();
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('identityV2Enabled'),
        }),
        expect.objectContaining({
          extra: expect.objectContaining({ bindingKey: 'identityV2Enabled' }),
        }),
      );
    });

    it('guards do NOT fire when NODE_ENV=test (normal unit test env)', () => {
      // Restore to test mode to verify the guard is skipped
      process.env['NODE_ENV'] = 'test';
      getStepAppUrl();
      getStepSupportEmail();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });
});
