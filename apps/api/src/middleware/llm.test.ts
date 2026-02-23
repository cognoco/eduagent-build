jest.mock('../services/llm', () => ({
  registerProvider: jest.fn(),
}));

jest.mock('../services/llm/providers/gemini', () => ({
  createGeminiProvider: jest.fn().mockReturnValue({ id: 'gemini' }),
}));

import { registerProvider } from '../services/llm';
import { createGeminiProvider } from '../services/llm/providers/gemini';
import { llmMiddleware, resetLlmMiddleware } from './llm';

function createMockContext(env: Record<string, string | undefined>) {
  return {
    env,
  } as unknown as Parameters<typeof llmMiddleware>[0];
}

const originalNodeEnv = process.env['NODE_ENV'];

beforeEach(() => {
  jest.clearAllMocks();
  resetLlmMiddleware();
  process.env['NODE_ENV'] = originalNodeEnv;
});

afterAll(() => {
  process.env['NODE_ENV'] = originalNodeEnv;
});

describe('llmMiddleware', () => {
  it('registers Gemini provider when key is present', async () => {
    const c = createMockContext({ GEMINI_API_KEY: 'test-key-123' });
    const next = jest.fn().mockResolvedValue(undefined);

    await llmMiddleware(c, next);

    expect(createGeminiProvider).toHaveBeenCalledWith('test-key-123');
    expect(registerProvider).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('throws in production when GEMINI_API_KEY is missing', async () => {
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({ ENVIRONMENT: 'production' });
    const next = jest.fn();

    await expect(llmMiddleware(c, next)).rejects.toThrow(
      'GEMINI_API_KEY is required (environment: production)'
    );
    expect(registerProvider).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('throws in staging when GEMINI_API_KEY is missing', async () => {
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({ ENVIRONMENT: 'staging' });
    const next = jest.fn();

    await expect(llmMiddleware(c, next)).rejects.toThrow(
      'GEMINI_API_KEY is required (environment: staging)'
    );
    expect(registerProvider).not.toHaveBeenCalled();
  });

  it('throws in development when key missing', async () => {
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({ ENVIRONMENT: 'development' });
    const next = jest.fn();

    await expect(llmMiddleware(c, next)).rejects.toThrow(
      'GEMINI_API_KEY is required (environment: development)'
    );
    expect(registerProvider).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('throws when ENVIRONMENT is not set', async () => {
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({});
    const next = jest.fn();

    await expect(llmMiddleware(c, next)).rejects.toThrow(
      'GEMINI_API_KEY is required (environment: development)'
    );
    expect(registerProvider).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('warns in test environment when key missing (no throw)', async () => {
    process.env['NODE_ENV'] = 'test';
    const c = createMockContext({});
    const next = jest.fn().mockResolvedValue(undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    await llmMiddleware(c, next);

    expect(registerProvider).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('GEMINI_API_KEY not set')
    );
    expect(next).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('only initializes once (subsequent calls skip provider registration)', async () => {
    const c = createMockContext({ GEMINI_API_KEY: 'key' });
    const next = jest.fn().mockResolvedValue(undefined);

    await llmMiddleware(c, next);
    await llmMiddleware(c, next);

    expect(registerProvider).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
