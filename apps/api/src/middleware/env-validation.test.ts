jest.mock('../config' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../config') as typeof import('../config');
  return {
    ...actual,
    validateEnv: jest.fn(),
    validateProductionBindings: jest.fn(),
  };
});

import { validateEnv, validateProductionBindings } from '../config';
import { envValidationMiddleware, resetEnvValidation } from './env-validation';

const mockValidateEnv = validateEnv as jest.MockedFunction<typeof validateEnv>;
const mockValidateProductionBindings =
  validateProductionBindings as jest.MockedFunction<
    typeof validateProductionBindings
  >;

function createMockContext(
  env: Record<string, string | undefined>,
): Parameters<typeof envValidationMiddleware>[0] {
  let responseBody: unknown = undefined;
  let responseStatus: number | undefined = undefined;

  return {
    env,
    json: jest.fn((body: unknown, status?: number) => {
      responseBody = body;
      responseStatus = status;
      return { _body: body, _status: status } as any;
    }),
    get _responseBody() {
      return responseBody;
    },
    get _responseStatus() {
      return responseStatus;
    },
  } as any;
}

const originalNodeEnv = process.env['NODE_ENV'];

beforeEach(() => {
  jest.clearAllMocks();
  resetEnvValidation();
  process.env['NODE_ENV'] = originalNodeEnv;
  mockValidateProductionBindings.mockReturnValue({
    missing: [],
    overrideApplied: false,
    warnings: [],
  });
});

afterAll(() => {
  process.env['NODE_ENV'] = originalNodeEnv;
});

describe('envValidationMiddleware', () => {
  it('skips validation in test environment', async () => {
    process.env['NODE_ENV'] = 'test';
    const c = createMockContext({});
    const next = jest.fn().mockResolvedValue(undefined);

    await envValidationMiddleware(c, next);

    expect(mockValidateEnv).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('calls validateEnv with c.env in non-test environment', async () => {
    process.env['NODE_ENV'] = 'development';
    const env = { ENVIRONMENT: 'staging', DATABASE_URL: 'postgresql://x' };
    const c = createMockContext(env);
    const next = jest.fn().mockResolvedValue(undefined);
    mockValidateEnv.mockReturnValue(env as any);

    await envValidationMiddleware(c, next);

    expect(mockValidateEnv).toHaveBeenCalledWith(env);
    expect(next).toHaveBeenCalled();
  });

  // [CR-2026-05-21-099] Zod validation must run even when ENVIRONMENT=development
  // so that misconfigured local bindings (wrong CLERK_JWKS_URL, missing
  // DATABASE_URL, etc.) surface immediately rather than as cryptic errors on
  // the first DB query.
  it('[CR-099] runs validateEnv in Wrangler dev (ENVIRONMENT=development)', async () => {
    process.env['NODE_ENV'] = 'development';
    const env = {
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://dev/db',
    };
    const c = createMockContext(env);
    const next = jest.fn().mockResolvedValue(undefined);
    mockValidateEnv.mockReturnValue(env as any);

    await envValidationMiddleware(c, next);

    expect(mockValidateEnv).toHaveBeenCalledWith(env);
    expect(next).toHaveBeenCalled();
  });

  // [CR-2026-05-21-099] A misconfigured dev env must return 500, not silently
  // proceed to the first DB query.
  it('[CR-099] returns 500 when validateEnv throws in Wrangler dev (ENVIRONMENT=development)', async () => {
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({ ENVIRONMENT: 'development' });
    const next = jest.fn();
    mockValidateEnv.mockImplementation(() => {
      throw new Error('Invalid environment: {"DATABASE_URL":["Required"]}');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    await envValidationMiddleware(c, next);

    expect(mockValidateEnv).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(c.json).toHaveBeenCalledWith(
      {
        code: 'ENV_VALIDATION_ERROR',
        message: 'Invalid environment: {"DATABASE_URL":["Required"]}',
      },
      500,
    );

    errorSpy.mockRestore();
  });

  it('returns 500 when validation fails', async () => {
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({});
    const next = jest.fn();
    mockValidateEnv.mockImplementation(() => {
      throw new Error('Invalid environment: {"DATABASE_URL":["Required"]}');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    await envValidationMiddleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(c.json).toHaveBeenCalledWith(
      {
        code: 'ENV_VALIDATION_ERROR',
        message: 'Invalid environment: {"DATABASE_URL":["Required"]}',
      },
      500,
    );
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('only validates once (skips on subsequent requests)', async () => {
    process.env['NODE_ENV'] = 'development';
    const env = { ENVIRONMENT: 'staging', DATABASE_URL: 'postgresql://x' };
    const c = createMockContext(env);
    const next = jest.fn().mockResolvedValue(undefined);
    mockValidateEnv.mockReturnValue(env as any);

    await envValidationMiddleware(c, next);
    await envValidationMiddleware(c, next);

    expect(mockValidateEnv).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });

  // [BUG-486] Break test: a transient validation failure must NOT permanently
  // lock the isolate into "validated" state.  The second request with the same
  // env must still run validation (i.e. not be skipped as a no-op).
  it('[BUG-486] retries validation on the next request after a transient failure', async () => {
    process.env['NODE_ENV'] = 'development';
    const env = {
      ENVIRONMENT: 'staging',
      DATABASE_URL: 'postgresql://transient',
    };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    // First request: validation throws.
    const c1 = createMockContext(env);
    const next1 = jest.fn();
    mockValidateEnv.mockImplementationOnce(() => {
      throw new Error('transient failure');
    });
    await envValidationMiddleware(c1, next1);
    expect(next1).not.toHaveBeenCalled();
    expect(mockValidateEnv).toHaveBeenCalledTimes(1);

    // Second request: validation succeeds.  Must RE-RUN validation, not skip it.
    const c2 = createMockContext(env);
    const next2 = jest.fn().mockResolvedValue(undefined);
    mockValidateEnv.mockReturnValueOnce(env as any);
    await envValidationMiddleware(c2, next2);

    // validateEnv called again — the failure on request 1 did not permanently
    // set the "validated" flag.
    expect(mockValidateEnv).toHaveBeenCalledTimes(2);
    expect(next2).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  // [BUG-486] On success, subsequent requests with the SAME env are no-ops.
  it('[BUG-486] skips validation on the second request after a successful first request', async () => {
    process.env['NODE_ENV'] = 'development';
    const env = {
      ENVIRONMENT: 'staging',
      DATABASE_URL: 'postgresql://stable',
    };
    const c1 = createMockContext(env);
    const next1 = jest.fn().mockResolvedValue(undefined);
    mockValidateEnv.mockReturnValue(env as any);

    await envValidationMiddleware(c1, next1);
    await envValidationMiddleware(
      createMockContext(env),
      jest.fn().mockResolvedValue(undefined),
    );

    // validateEnv called exactly once across both requests.
    expect(mockValidateEnv).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Production deploy gate — refuse to serve traffic when a required KV
  // binding (IDEMPOTENCY_KV) is missing without an explicit prelaunch
  // override. Binding-level validation runs AFTER zod env parse.
  // -------------------------------------------------------------------------

  describe('production binding gate', () => {
    it('returns 500 ENV_VALIDATION_ERROR when production is missing IDEMPOTENCY_KV without override', async () => {
      process.env['NODE_ENV'] = 'production';
      const env = {
        ENVIRONMENT: 'production',
        DATABASE_URL: 'postgresql://prod/db',
      };
      const c = createMockContext(env);
      const next = jest.fn();
      mockValidateEnv.mockReturnValue(env as any);
      mockValidateProductionBindings.mockReturnValue({
        missing: ['IDEMPOTENCY_KV'],
        overrideApplied: false,
        warnings: [],
      });

      await envValidationMiddleware(c, next);

      expect(next).not.toHaveBeenCalled();
      expect(c.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'ENV_VALIDATION_ERROR',
          message: expect.stringContaining('IDEMPOTENCY_KV'),
        }),
        500,
      );
      // Error message points operators at the explicit override path so
      // they can't claim they didn't know how to bypass during prelaunch.
      const [body] = (c.json as jest.Mock).mock.calls[0];
      expect(body.message).toMatch(/ALLOW_MISSING_IDEMPOTENCY_KV/);
    });

    it('passes through when the binding is present', async () => {
      process.env['NODE_ENV'] = 'production';
      const env = {
        ENVIRONMENT: 'production',
        DATABASE_URL: 'postgresql://prod/db',
      };
      const c = createMockContext(env);
      const next = jest.fn().mockResolvedValue(undefined);
      mockValidateEnv.mockReturnValue(env as any);
      mockValidateProductionBindings.mockReturnValue({
        missing: [],
        overrideApplied: false,
        warnings: [],
      });

      await envValidationMiddleware(c, next);

      expect(next).toHaveBeenCalled();
      expect(c.json).not.toHaveBeenCalled();
    });

    it('passes through with override but the override usage is queryable in telemetry', async () => {
      process.env['NODE_ENV'] = 'production';
      const env = {
        ENVIRONMENT: 'production',
        DATABASE_URL: 'postgresql://prod/db',
      };
      const c = createMockContext(env);
      const next = jest.fn().mockResolvedValue(undefined);
      mockValidateEnv.mockReturnValue(env as any);
      mockValidateProductionBindings.mockReturnValue({
        missing: [],
        overrideApplied: true,
        warnings: [],
      });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await envValidationMiddleware(c, next);

      expect(next).toHaveBeenCalled();
      expect(c.json).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      const warnArgs = warnSpy.mock.calls.flat().join(' ');
      expect(warnArgs).toMatch(/idempotency_kv_override_active/);

      warnSpy.mockRestore();
    });
  });
});
