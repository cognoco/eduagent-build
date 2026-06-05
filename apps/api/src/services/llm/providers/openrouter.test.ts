import { createOpenRouterProvider } from './openrouter';
import type { ChatMessage, ModelConfig } from '../types';
import { SafetyFilterError } from '../../../errors';

// ---------------------------------------------------------------------------
// Mock fetch — OpenRouter provider uses raw fetch() (external boundary)
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch;

const TEST_API_KEY = 'test-or-key-123';

const TEST_MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello' },
];

const TEST_CONFIG: ModelConfig = {
  provider: 'openrouter',
  model: 'mistralai/mistral-small-2603',
  maxTokens: 4096,
};

function createOkResponse(
  content: string,
  finishReason?: string,
): Partial<Response> {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: finishReason }],
    }),
    text: async () => '',
  };
}

describe('OpenRouter Provider', () => {
  const provider = createOpenRouterProvider(TEST_API_KEY);

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('chat()', () => {
    it('returns response content on success', async () => {
      mockFetch.mockResolvedValueOnce(
        createOkResponse('Hello from Mistral', 'stop'),
      );

      const result = await provider.chat(TEST_MESSAGES, TEST_CONFIG);
      expect(result.content).toBe('Hello from Mistral');
      expect(result.stopReason).toBe('stop');

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(opts.headers.Authorization).toBe('Bearer test-or-key-123');
    });

    it('passes the model ID through verbatim (no MODEL_MAP)', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('ok'));

      await provider.chat(TEST_MESSAGES, {
        ...TEST_CONFIG,
        model: 'openai/gpt-oss-120b',
      });

      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.model).toBe('openai/gpt-oss-120b');
    });

    it('uses max_tokens (OpenRouter normalized field), not max_completion_tokens', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('ok'));

      await provider.chat(TEST_MESSAGES, TEST_CONFIG);

      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.max_tokens).toBe(4096);
      expect(body.max_completion_tokens).toBeUndefined();
    });

    it('omits the provider-routing pin by default (ZDR relaxed for synthetic eval traffic, owner ruling 2026-06-05)', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('ok'));

      await provider.chat(TEST_MESSAGES, TEST_CONFIG);

      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.provider).toBeUndefined();
    });

    it('pins routing to zero-data-retention providers when zdr option is set', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('ok'));

      const pinnedProvider = createOpenRouterProvider(TEST_API_KEY, {
        zdr: true,
      });
      await pinnedProvider.chat(TEST_MESSAGES, TEST_CONFIG);

      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.provider).toEqual({ zdr: true });
    });

    it('requests JSON object mode when responseFormat is json', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('{"reply":"Hello"}'));

      await provider.chat(TEST_MESSAGES, {
        ...TEST_CONFIG,
        responseFormat: 'json',
      });

      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('throws on non-2xx response and preserves HTTP status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      });

      let caughtError: unknown;
      try {
        await provider.chat(TEST_MESSAGES, TEST_CONFIG);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toBe(
        'OpenRouter API request failed (429): Rate limited',
      );
      expect((caughtError as Error & { status?: number }).status).toBe(429);
    });

    it('throws on data.error field and preserves it as cause', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          error: { message: 'No allowed providers', code: 404 },
        }),
        text: async () => '',
      });

      let caughtError: unknown;
      try {
        await provider.chat(TEST_MESSAGES, TEST_CONFIG);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toBe(
        'OpenRouter API error: No allowed providers',
      );
      expect((caughtError as Error).cause).toEqual({
        message: 'No allowed providers',
        code: 404,
      });
    });

    it('throws SafetyFilterError on content_filter finish reason', async () => {
      mockFetch.mockResolvedValueOnce(
        createOkResponse('partial', 'content_filter'),
      );

      await expect(provider.chat(TEST_MESSAGES, TEST_CONFIG)).rejects.toThrow(
        SafetyFilterError,
      );
    });

    it('throws on empty response content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: {} }] }),
        text: async () => '',
      });

      await expect(provider.chat(TEST_MESSAGES, TEST_CONFIG)).rejects.toThrow(
        'OpenRouter returned empty response',
      );
    });

    it('normalizes finish_reason via the OpenAI vocabulary', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('truncated', 'length'));

      const result = await provider.chat(TEST_MESSAGES, TEST_CONFIG);
      expect(result.stopReason).toBe('length');
    });
  });

  describe('chatStream() — buffered eval-only wrapper', () => {
    it('yields the full content once and resolves stopReason', async () => {
      mockFetch.mockResolvedValueOnce(
        createOkResponse('Buffered reply', 'stop'),
      );

      const streamResult = provider.chatStream(TEST_MESSAGES, TEST_CONFIG);
      const chunks: string[] = [];
      for await (const chunk of streamResult) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Buffered reply']);
      await expect(streamResult.stopReasonPromise).resolves.toBe('stop');
    });

    it('resolves stopReason to unknown and rethrows on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal error',
      });

      const streamResult = provider.chatStream(TEST_MESSAGES, TEST_CONFIG);

      await expect(async () => {
        for await (const _ of streamResult) {
          // drain
        }
      }).rejects.toThrow('OpenRouter API request failed (500)');
      await expect(streamResult.stopReasonPromise).resolves.toBe('unknown');
    });
  });
});
