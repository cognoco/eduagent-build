jest.mock('../config' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../config'),
  validateEnv: jest.fn(),
  validateProductionBindings: jest.fn(),
}));

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
