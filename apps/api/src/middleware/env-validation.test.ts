jest.mock('../config', () => ({
  validateEnv: jest.fn(),
}));

import { validateEnv } from '../config';
import { envValidationMiddleware, resetEnvValidation } from './env-validation';

const mockValidateEnv = validateEnv as jest.MockedFunction<typeof validateEnv>;

function createMockContext(
  env: Record<string, string | undefined>
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
    const env = { ENVIRONMENT: 'development', DATABASE_URL: 'postgresql://x' };
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

    const result = await envValidationMiddleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(c.json).toHaveBeenCalledWith(
      {
        code: 'ENV_VALIDATION_ERROR',
        message: 'Invalid environment: {"DATABASE_URL":["Required"]}',
      },
      500
    );
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('only validates once (skips on subsequent requests)', async () => {
    process.env['NODE_ENV'] = 'development';
    const env = { ENVIRONMENT: 'development', DATABASE_URL: 'postgresql://x' };
    const c = createMockContext(env);
    const next = jest.fn().mockResolvedValue(undefined);
    mockValidateEnv.mockReturnValue(env as any);

    await envValidationMiddleware(c, next);
    await envValidationMiddleware(c, next);

    expect(mockValidateEnv).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
