import { createOpenAIProvider, toOpenAIContent } from './openai';
import type { ChatMessage, MessagePart, ModelConfig } from '../types';
import { SafetyFilterError } from '../../../errors';

// ---------------------------------------------------------------------------
// Mock fetch — OpenAI provider uses raw fetch() for CF Workers compatibility
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch;

const TEST_API_KEY = 'test-key-123';

const TEST_MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello' },
];

const TEST_CONFIG: ModelConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  maxTokens: 4096,
};

function createOkResponse(content: string): Partial<Response> {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
    text: async () => '',
  };
}

function createSseStream(...events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = events.join('\n') + '\n';
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe('OpenAI Provider', () => {
  const provider = createOpenAIProvider(TEST_API_KEY);

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('chat()', () => {
    it('returns response content on success', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('Hello from GPT'));

      const result = await provider.chat(TEST_MESSAGES, TEST_CONFIG);
      expect(result.content).toBe('Hello from GPT');
      expect(result.stopReason).toBe('unknown');

      // Verify request structure
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(opts.headers.Authorization).toBe('Bearer test-key-123');
      const body = JSON.parse(opts.body);
      expect(body.model).toBe('gpt-4o-mini');
      expect(body.messages).toHaveLength(2);
      expect(body.max_completion_tokens).toBe(4096);
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

    it('throws on non-2xx response without leaking the body', async () => {
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

      expect((caughtError as Error).message).toBe(
        'OpenAI API request failed (status 429)',
      );
      expect((caughtError as Error).message).not.toContain('Rate limited');
    });

    it('preserves HTTP status on non-2xx response errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      let caughtError: unknown;
      try {
        await provider.chat(TEST_MESSAGES, TEST_CONFIG);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error & { status?: number }).status).toBe(403);
      expect((caughtError as Error & { statusCode?: number }).statusCode).toBe(
        403,
      );
    });

    it('throws on data.error field without leaking the vendor message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          error: { message: 'Invalid model', type: 'invalid_request_error' },
        }),
      });

      let caughtError: unknown;
      try {
        await provider.chat(TEST_MESSAGES, TEST_CONFIG);
      } catch (err) {
        caughtError = err;
      }

      expect((caughtError as Error).message).toBe(
        'OpenAI API error [invalid_request_error]',
      );
      expect((caughtError as Error).message).not.toContain('Invalid model');
    });

    it('[FCR-2026-05-23-L11.F11] data.error keeps only non-content tokens as cause', async () => {
      const structuredError = {
        message: 'Rate limit exceeded',
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ error: structuredError }),
      });

      let caughtError: unknown;
      try {
        await provider.chat(TEST_MESSAGES, TEST_CONFIG);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
      // Vendor free-text message must NOT survive (it can echo input).
      expect((caughtError as Error).message).not.toContain(
        'Rate limit exceeded',
      );
      // Only the structured type/code tokens are kept for Sentry grouping.
      expect((caughtError as Error & { cause: unknown }).cause).toEqual({
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      });
    });

    it('throws SafetyFilterError when OpenAI returns a content_filter finish reason without text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: {}, finish_reason: 'content_filter' }],
        }),
        text: async () => '',
      });

      await expect(provider.chat(TEST_MESSAGES, TEST_CONFIG)).rejects.toThrow(
        SafetyFilterError,
      );
    });

    it('throws on empty choices array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [] }),
      });

      await expect(provider.chat(TEST_MESSAGES, TEST_CONFIG)).rejects.toThrow(
        'OpenAI returned empty response',
      );
    });

    it('passes AbortSignal with 25s timeout to fetch', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('test'));
      await provider.chat(TEST_MESSAGES, TEST_CONFIG);

      const opts = mockFetch.mock.calls[0][1];
      expect(opts.signal).toBeInstanceOf(AbortSignal);
    });

    it('throws when choices[0].message.content is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: {} }] }),
      });

      await expect(provider.chat(TEST_MESSAGES, TEST_CONFIG)).rejects.toThrow(
        'OpenAI returned empty response',
      );
    });

    // [WI-984] Regression: unexpected provider response shape (e.g. null JSON body)
    // must throw a typed provider error, not a TypeError crash on property access.
    // null JSON → old code: TypeError("Cannot read properties of null");
    //             new code: createProviderApiError → "OpenAI API error [invalid_response_shape]"
    it('[WI-984] throws a typed provider error (not TypeError) when JSON body is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      });

      let caughtError: unknown;
      try {
        await provider.chat(TEST_MESSAGES, TEST_CONFIG);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
      // Must be a typed provider error (from createProviderApiError), not a raw TypeError.
      expect((caughtError as Error).message).toContain('OpenAI API');
      // Must NOT be a raw runtime TypeError from undefined field access.
      expect(caughtError).not.toBeInstanceOf(TypeError);
    });
  });

  describe('chatStream()', () => {
    it('yields streamed content chunks', async () => {
      const body = createSseStream(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]',
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(
        TEST_MESSAGES,
        TEST_CONFIG,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' world']);
    });

    it('throws on non-2xx response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal error',
      });

      const chunks: string[] = [];
      await expect(async () => {
        for await (const chunk of provider.chatStream(
          TEST_MESSAGES,
          TEST_CONFIG,
        )) {
          chunks.push(chunk);
        }
      }).rejects.toThrow('OpenAI API stream failed (status 500)');
    });

    it('preserves HTTP status on non-2xx stream response errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      let caughtError: unknown;
      try {
        for await (const _chunk of provider.chatStream(
          TEST_MESSAGES,
          TEST_CONFIG,
        )) {
          // consume stream
        }
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error & { status?: number }).status).toBe(400);
      expect((caughtError as Error & { statusCode?: number }).statusCode).toBe(
        400,
      );
    });

    it('throws SafetyFilterError when OpenAI stream finishes with content_filter before text', async () => {
      const body = createSseStream(
        'data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}',
        'data: [DONE]',
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

      await expect(async () => {
        for await (const _chunk of provider.chatStream(
          TEST_MESSAGES,
          TEST_CONFIG,
        )) {
          // consume stream
        }
      }).rejects.toThrow(SafetyFilterError);
    });

    it('throws when response body is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: null,
      });

      const chunks: string[] = [];
      await expect(async () => {
        for await (const chunk of provider.chatStream(
          TEST_MESSAGES,
          TEST_CONFIG,
        )) {
          chunks.push(chunk);
        }
      }).rejects.toThrow('OpenAI API returned no response body for stream');
    });

    it('skips malformed JSON chunks', async () => {
      const sensitiveText = 'PRIVATE_RECITATION_SENTINEL';
      const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const body = createSseStream(
        'data: {"choices":[{"delta":{"content":"ok"}}]}',
        `data: {${sensitiveText}}`,
        'data: {"choices":[{"delta":{"content":"!"}}]}',
        'data: [DONE]',
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(
        TEST_MESSAGES,
        TEST_CONFIG,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['ok', '!']);
      expect(warnSpy).toHaveBeenCalled();
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(sensitiveText);
      warnSpy.mockRestore();
    });

    it('skips empty delta content', async () => {
      const body = createSseStream(
        'data: {"choices":[{"delta":{}}]}',
        'data: {"choices":[{"delta":{"content":"hi"}}]}',
        'data: [DONE]',
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(
        TEST_MESSAGES,
        TEST_CONFIG,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['hi']);
    });

    it('sends stream: true in request body', async () => {
      const body = createSseStream('data: [DONE]');
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(
        TEST_MESSAGES,
        TEST_CONFIG,
      )) {
        chunks.push(chunk);
      }

      const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(reqBody.stream).toBe(true);
    });
  });

  // Safety preamble tests removed — preamble injection moved to the router
  // layer (router.ts) so it applies uniformly across all providers including
  // fallback paths. See router.test.ts for preamble coverage.

  describe('model mapping', () => {
    it('maps gemini-2.5-flash to gpt-4o-mini', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('test'));
      await provider.chat(TEST_MESSAGES, {
        ...TEST_CONFIG,
        model: 'gemini-2.5-flash',
      });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('gpt-4o-mini');
    });

    it('maps gemini-2.5-pro to gpt-4o', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('test'));
      await provider.chat(TEST_MESSAGES, {
        ...TEST_CONFIG,
        model: 'gemini-2.5-pro',
      });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('gpt-4o');
    });

    it.each(['gpt-5.5', 'gpt-5.4'])(
      'passes the GPT premium candidate %s through unchanged',
      async (model) => {
        mockFetch.mockResolvedValueOnce(createOkResponse('test'));
        await provider.chat(TEST_MESSAGES, {
          ...TEST_CONFIG,
          model,
        });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.model).toBe(model);
      },
    );

    it('maps gpt-5-mini through without the default-fallback warn', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockFetch.mockResolvedValueOnce(createOkResponse('test'));
      await provider.chat(TEST_MESSAGES, {
        ...TEST_CONFIG,
        model: 'gpt-5-mini',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('gpt-5-mini');
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('emits reasoning_effort when set, omits it when not', async () => {
      mockFetch.mockResolvedValue(createOkResponse('test'));

      await provider.chat(TEST_MESSAGES, {
        ...TEST_CONFIG,
        model: 'gpt-5-mini',
        reasoningEffort: 'low',
      });
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).reasoning_effort).toBe(
        'low',
      );

      await provider.chat(TEST_MESSAGES, {
        ...TEST_CONFIG,
        model: 'gpt-4o-mini',
      });
      expect(
        'reasoning_effort' in JSON.parse(mockFetch.mock.calls[1][1].body),
      ).toBe(false);
    });

    it('warns and defaults to gpt-4o-mini for unmapped models', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockFetch.mockResolvedValueOnce(createOkResponse('test'));
      await provider.chat(TEST_MESSAGES, {
        ...TEST_CONFIG,
        model: 'gemini-3.0-flash',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('gpt-4o-mini');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('gemini-3.0-flash'),
      );
      warnSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// toOpenAIContent — pure formatting, no HTTP mocks needed [IMG-VISION]
// ---------------------------------------------------------------------------

describe('toOpenAIContent', () => {
  it('returns a plain string unchanged', () => {
    expect(toOpenAIContent('Hello')).toBe('Hello');
  });

  it('extracts text from a text-only MessagePart[]', () => {
    const parts: MessagePart[] = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'World' },
    ];
    expect(toOpenAIContent(parts)).toBe('Hello\nWorld');
  });

  it('maps InlineDataPart to OpenAI image_url content blocks', () => {
    const parts: MessagePart[] = [
      { type: 'inline_data', mimeType: 'image/jpeg', data: 'base64data==' },
      { type: 'text', text: 'What is in this image?' },
    ];

    expect(toOpenAIContent(parts)).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,base64data==' },
      },
      { type: 'text', text: 'What is in this image?' },
    ]);
  });

  it('embeds MIME type in the data URL', () => {
    const parts: MessagePart[] = [
      { type: 'inline_data', mimeType: 'image/png', data: 'pngdata==' },
      { type: 'text', text: 'Describe this' },
    ];

    const result = toOpenAIContent(parts) as unknown[];
    expect(result[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,pngdata==' },
    });
  });
});

// ---------------------------------------------------------------------------
// Best-effort prompt-cache usage (WI-1827)
// ---------------------------------------------------------------------------

describe('OpenAI Provider — usage (WI-1827)', () => {
  const provider = createOpenAIProvider(TEST_API_KEY);

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('surfaces prompt_tokens_details.cached_tokens as usage.cachedTokens', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'hi' } }],
        usage: { prompt_tokens_details: { cached_tokens: 512 } },
      }),
      text: async () => '',
    });

    const result = await provider.chat(TEST_MESSAGES, TEST_CONFIG);
    expect(result.usage).toEqual({ cachedTokens: 512 });
  });

  it('omits usage when cached_tokens is absent', async () => {
    mockFetch.mockResolvedValueOnce(createOkResponse('hi'));
    const result = await provider.chat(TEST_MESSAGES, TEST_CONFIG);
    expect(result.usage).toBeUndefined();
  });
});
