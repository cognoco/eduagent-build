jest.mock('../services/llm' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/llm',
  ) as typeof import('../services/llm');
  return {
    ...actual,
    registerProvider: jest.fn(),
  };
});

jest.mock(
  '../services/llm/providers/gemini' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/llm/providers/gemini',
    ) as typeof import('../services/llm/providers/gemini');
    return {
      ...actual,
      createGeminiProvider: jest.fn().mockReturnValue({ id: 'gemini' }),
    };
  },
);

jest.mock(
  '../services/llm/providers/openai' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/llm/providers/openai',
    ) as typeof import('../services/llm/providers/openai');
    return {
      ...actual,
      createOpenAIProvider: jest.fn().mockReturnValue({ id: 'openai' }),
    };
  },
);

import { registerProvider } from '../services/llm';
import { createGeminiProvider } from '../services/llm/providers/gemini';
import { createOpenAIProvider } from '../services/llm/providers/openai';
import { llmMiddleware, resetLlmMiddleware } from './llm';
// _clearProviders is called by the middleware when the env hash changes.
// It is mocked via the spread of actual so its real behaviour is preserved;
// we only need it imported here for the comment to be accurate.

function createMockContext(env: Record<string, string | undefined>) {
  return {
    env,
  } as unknown as Parameters<typeof llmMiddleware>[0];
}

const originalNodeEnv = process.env['NODE_ENV'];

// NOTE: resetLlmMiddleware() clears the middleware's env-hash (_registeredEnvHash)
// so the next request performs fresh provider registration. Router state
// (registered providers, circuit breakers) lives in router.ts and requires
// separate _clearProviders() / _resetCircuits() calls. In this file we mock
// the entire llm barrel so router state is irrelevant; but integration tests
// must call both to get a clean slate. See router.test.ts for examples.
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

  it('[BUG-96 / A1-HIGH BREAK — superseded by BUG-488] does NOT permanently lock initialization when registerProvider throws', async () => {
    // With the BUG-488 env-hash fix, a failed registration leaves the hash
    // unset, so the NEXT request with the same env will retry registration.
    // This is intentionally different from the old try/finally-flip behavior
    // (which made failed init permanently terminal per-isolate). The new
    // behavior is safer: a transient failure (e.g., race on startup) self-heals
    // on the next request rather than wedging the isolate forever.
    (registerProvider as jest.Mock).mockImplementationOnce(() => {
      throw new Error('transient registration failure');
    });

    const c = createMockContext({ GEMINI_API_KEY: 'gem-key' });
    const next = jest.fn().mockResolvedValue(undefined);

    await expect(llmMiddleware(c, next)).rejects.toThrow(
      'transient registration failure',
    );

    // Next request with the same env retries — this is the NEW contract.
    (registerProvider as jest.Mock).mockResolvedValue(undefined);
    (registerProvider as jest.Mock).mockClear();
    await llmMiddleware(c, next);
    expect(registerProvider).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('[BUG-488 / P2 BREAK] re-registers providers when env keys change between requests', async () => {
    // Break test: BEFORE the fix, the first request's env keys bound the
    // provider registry for the entire isolate lifetime. If a Worker was reused
    // across preview→prod, the second env's API keys were silently ignored and
    // the old providers (pointing at the first env's keys) continued to be used.
    // With the env-hash fix, a key change triggers _clearProviders() + fresh
    // registerProvider calls on the next request.
    const c1 = createMockContext({ GEMINI_API_KEY: 'preview-key' });
    const c2 = createMockContext({ GEMINI_API_KEY: 'prod-key' });
    const next = jest.fn().mockResolvedValue(undefined);

    await llmMiddleware(c1, next);
    expect(createGeminiProvider).toHaveBeenCalledWith('preview-key');
    expect(registerProvider).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    // Different env key — must re-register with the new key, NOT skip.
    await llmMiddleware(c2, next);
    expect(createGeminiProvider).toHaveBeenCalledWith('prod-key');
    expect(registerProvider).toHaveBeenCalledTimes(1);
  });

  it('[BUG-488 / P2 BREAK] does NOT re-register when env keys are unchanged', async () => {
    // Same env on two consecutive requests must NOT re-register (idempotent).
    const c = createMockContext({ GEMINI_API_KEY: 'stable-key' });
    const next = jest.fn().mockResolvedValue(undefined);

    await llmMiddleware(c, next);
    await llmMiddleware(c, next);

    expect(registerProvider).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });

  // Helper: collect the `id`s of every provider object passed to the mocked
  // registerProvider. createCerebrasProvider / createMistralProvider are NOT
  // mocked (GC1: no new internal jest.mock), so they return real provider
  // objects whose `id` we can assert on directly.
  function registeredProviderIds(): string[] {
    return (registerProvider as jest.Mock).mock.calls.map(
      (call) => (call[0] as { id: string }).id,
    );
  }

  it('[v2 infra] registers cerebras + mistral when their keys are present', async () => {
    // A flag-off primary (Gemini) keeps the hasAnyProvider gate satisfied; the
    // v2 providers are registered alongside it so they are available behind
    // LLM_ROUTING_V2_ENABLED without being part of the primary-key gate.
    const c = createMockContext({
      GEMINI_API_KEY: 'gem-key',
      CEREBRAS_API_KEY: 'cb-key',
      MISTRAL_API_KEY: 'mi-key',
    });
    const next = jest.fn().mockResolvedValue(undefined);

    await llmMiddleware(c, next);

    const ids = registeredProviderIds();
    expect(ids).toContain('cerebras');
    expect(ids).toContain('mistral');
    expect(ids).toContain('gemini');
    expect(next).toHaveBeenCalled();
  });

  it('[T-A3] a Cerebras-only deployment now satisfies the boot gate', async () => {
    // Gemini-retirement Phase A widened the boot gate to count any admitted
    // provider. A cerebras key alone is now a valid primary (text), so the
    // middleware registers it and proceeds — it no longer throws. (Vision still
    // needs Mistral/OpenAI, but the boot gate's job is "some provider exists".)
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({
      ENVIRONMENT: 'production',
      CEREBRAS_API_KEY: 'cb-key',
    });
    const next = jest.fn().mockResolvedValue(undefined);

    await llmMiddleware(c, next);

    expect(registeredProviderIds()).toContain('cerebras');
    expect(next).toHaveBeenCalled();
  });

  it('[T-A3] boots in production with only Cerebras+Mistral keys (no Gemini/OpenAI/Anthropic)', async () => {
    // Gemini-retirement Phase A: the boot gate counts any admitted provider, so
    // a Gemini-free deployment whose text primary is Cerebras and vision is
    // Mistral boots without throwing. createCerebrasProvider / createMistralProvider
    // are real (not mocked), so registration produces real provider objects.
    process.env['NODE_ENV'] = 'development';
    const c = createMockContext({
      ENVIRONMENT: 'production',
      CEREBRAS_API_KEY: 'cb-key',
      MISTRAL_API_KEY: 'mi-key',
    });
    const next = jest.fn().mockResolvedValue(undefined);

    await llmMiddleware(c, next);

    const ids = registeredProviderIds();
    expect(ids).toContain('cerebras');
    expect(ids).toContain('mistral');
    expect(ids).not.toContain('gemini');
    expect(next).toHaveBeenCalled();
  });

  it('[BUG-488 extended] re-registers when CEREBRAS_API_KEY changes (hash includes it)', async () => {
    // Proves the env-hash covers the v2 keys: a cerebras-only key rotation on a
    // reused isolate must trigger _clearProviders() + fresh registration, not
    // be silently ignored.
    const c1 = createMockContext({
      GEMINI_API_KEY: 'gem-key',
      CEREBRAS_API_KEY: 'cb-key-1',
    });
    const c2 = createMockContext({
      GEMINI_API_KEY: 'gem-key',
      CEREBRAS_API_KEY: 'cb-key-2',
    });
    const next = jest.fn().mockResolvedValue(undefined);

    await llmMiddleware(c1, next);
    expect(registeredProviderIds()).toContain('cerebras');

    jest.clearAllMocks();

    // Only the cerebras key changed — the hash must differ, forcing a
    // re-registration that includes cerebras again.
    await llmMiddleware(c2, next);
    expect(registeredProviderIds()).toContain('cerebras');
    expect(registerProvider).toHaveBeenCalled();
  });
});
