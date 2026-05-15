jest.mock('../services/llm', () => ({
  ...jest.requireActual('../services/llm'),
  registerProvider: jest.fn(),
}));

jest.mock('../services/llm/providers/gemini', () => ({
  ...jest.requireActual('../services/llm/providers/gemini'),
  createGeminiProvider: jest.fn().mockReturnValue({ id: 'gemini' }),
}));

jest.mock('../services/llm/providers/openai', () => ({
  ...jest.requireActual('../services/llm/providers/openai'),
  createOpenAIProvider: jest.fn().mockReturnValue({ id: 'openai' }),
}));

import { registerProvider } from '../services/llm';
import { createGeminiProvider } from '../services/llm/providers/gemini';
import { createOpenAIProvider } from '../services/llm/providers/openai';
import { llmMiddleware, resetLlmMiddleware } from './llm';

function createMockContext(env: Record<string, string | undefined>) {
  return {
    env,
  } as unknown as Parameters<typeof llmMiddleware>[0];
}

const originalNodeEnv = process.env['NODE_ENV'];

// NOTE: resetLlmMiddleware() only clears the middleware's `initialized` flag.
// Router state (registered providers, circuit breakers) lives in router.ts and
// requires separate _clearProviders() / _resetCircuits() calls. In this file
// we mock the entire llm barrel so router state is irrelevant; but integration
// tests must call both to get a clean slate. See router.test.ts for examples.
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

  it('registers OpenAI provider when key is present', async () => {
    const c = createMockContext({ OPENAI_API_KEY: 'oai-key-456' });
    const next = jest.fn().mockResolvedValue(undefined);

    await llmMiddleware(c, next);

    expect(createOpenAIProvider).toHaveBeenCalledWith('oai-key-456');
    expect(registerProvider).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('registers both providers when both keys are present', async () => {
    const c = createMockContext({
      GEMINI_API_KEY: 'gem-key',
      OPENAI_API_KEY: 'oai-key',
    });
    const next = jest.fn().mockResolvedValue(undefined);

    await llmMiddleware(c, next);

    expect(createGeminiProvider).toHaveBeenCalledWith('gem-key');
    expect(createOpenAIProvider).toHaveBeenCalledWith('oai-key');
    expect(registerProvider).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalled();
  });

  it('throws in production when no LLM keys are set', async () => {
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({ ENVIRONMENT: 'production' });
    const next = jest.fn();

    await expect(llmMiddleware(c, next)).rejects.toThrow(
      'At least one LLM API key is required',
    );
    expect(registerProvider).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('throws in staging when no LLM keys are set', async () => {
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({ ENVIRONMENT: 'staging' });
    const next = jest.fn();

    await expect(llmMiddleware(c, next)).rejects.toThrow(
      'At least one LLM API key is required',
    );
    expect(registerProvider).not.toHaveBeenCalled();
  });

  it('throws in development when no keys set', async () => {
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({ ENVIRONMENT: 'development' });
    const next = jest.fn();

    await expect(llmMiddleware(c, next)).rejects.toThrow(
      'At least one LLM API key is required',
    );
    expect(registerProvider).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('throws when ENVIRONMENT is not set', async () => {
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({});
    const next = jest.fn();

    await expect(llmMiddleware(c, next)).rejects.toThrow(
      'At least one LLM API key is required',
    );
    expect(registerProvider).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('warns in test environment when no keys set (no throw) — process.env fallback', async () => {
    process.env['NODE_ENV'] = 'test';
    const c = createMockContext({});
    const next = jest.fn().mockResolvedValue(undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    await llmMiddleware(c, next);

    expect(registerProvider).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No LLM API keys set'),
    );
    expect(next).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('warns in test environment when no keys set (no throw) — c.env.ENVIRONMENT', async () => {
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({ ENVIRONMENT: 'test' });
    const next = jest.fn().mockResolvedValue(undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    await llmMiddleware(c, next);

    expect(registerProvider).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No LLM API keys set'),
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
