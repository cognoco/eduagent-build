import { createCerebrasProvider } from './cerebras';
import type { ChatMessage, ModelConfig } from '../types';
import { parseEnvelope } from '../envelope';
import { normalizeModelRefusal } from './refusal-envelope';
import { SafetyFilterError } from '../../../errors';

const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch;

const MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello' },
];

const CFG: ModelConfig = {
  provider: 'cerebras',
  model: 'gpt-oss-120b',
  maxTokens: 8192,
};

function okResponse(content: string, finishReason: string): Partial<Response> {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: finishReason }],
    }),
    text: async () => '',
  };
}

describe('Cerebras Provider', () => {
  const provider = createCerebrasProvider('test-key');

  beforeEach(() => mockFetch.mockReset());

  it('posts to the Cerebras URL with bearer auth and top-level reasoning_effort', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse('{"reply":"hi","signals":{}}', 'stop'),
    );
    await provider.chat(MESSAGES, { ...CFG, reasoningEffort: 'high' });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.cerebras.ai/v1/chat/completions');
    expect(opts.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(opts.body);
    expect(body.reasoning_effort).toBe('high');
    expect(body.model).toBe('gpt-oss-120b'); // verbatim, no MODEL_MAP
    expect(body.max_completion_tokens).toBe(8192);
  });

  it('omits reasoning_effort when not set', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse('{"reply":"hi","signals":{}}', 'stop'),
    );
    await provider.chat(MESSAGES, CFG);
    expect(
      'reasoning_effort' in JSON.parse(mockFetch.mock.calls[0][1].body),
    ).toBe(false);
  });

  it('normalizes a bare {"type":"refusal"} response into a safe envelope', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('{"type":"refusal"}', 'stop'));
    const r = await provider.chat(MESSAGES, {
      ...CFG,
      conversationLanguage: 'pl',
    });
    const parsed = parseEnvelope(r.content);
    expect(parsed.ok).toBe(true);
  });

  it('passes a normal envelope through unchanged', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse('{"reply":"All good","signals":{}}', 'stop'),
    );
    const r = await provider.chat(MESSAGES, CFG);
    expect(r.content).toBe('{"reply":"All good","signals":{}}');
  });

  it('maps finish_reason content_filter to SafetyFilterError', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('', 'content_filter'));
    await expect(provider.chat(MESSAGES, CFG)).rejects.toBeInstanceOf(
      SafetyFilterError,
    );
  });

  it('throws on a non-2xx response without leaking the body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    });
    let caught: unknown;
    try {
      await provider.chat(MESSAGES, CFG);
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).message).toBe(
      'Cerebras API request failed (status 429)',
    );
    expect((caught as Error).message).not.toContain('Rate limited');
  });

  // [WI-984] Regression: unexpected provider response shape (e.g. null JSON body)
  // must throw a typed provider error, not a TypeError crash on property access.
  // null JSON → old code: TypeError("Cannot read properties of null");
  //             new code: createProviderApiError → "Cerebras API error [invalid_response_shape]"
  it('[WI-984] throws a typed provider error (not TypeError) when JSON body is null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => null,
    });

    let caught: unknown;
    try {
      await provider.chat(MESSAGES, CFG);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    // Must be a typed provider error (from createProviderApiError), not a raw TypeError.
    expect((caught as Error).message).toContain('Cerebras API');
    // Must NOT be a raw runtime TypeError from undefined field access.
    expect(caught).not.toBeInstanceOf(TypeError);
  });

  describe('chatStream()', () => {
    function sse(...events: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      const text = events.join('\n') + '\n';
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(text));
          controller.close();
        },
      });
    }

    it('yields streamed content chunks and sends stream:true + reasoning_effort', async () => {
      const body = sse(
        'data: {"choices":[{"delta":{"content":"Hel"}}]}',
        'data: {"choices":[{"delta":{"content":"lo"}}]}',
        'data: [DONE]',
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(MESSAGES, {
        ...CFG,
        reasoningEffort: 'high',
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hel', 'lo']);
      const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(reqBody.stream).toBe(true);
      expect(reqBody.reasoning_effort).toBe('high');
    });

    it('rewrites a bare {"type":"refusal"} stream into the localized safe envelope', async () => {
      // gpt-oss occasionally emits its native refusal shape mid-stream instead
      // of our envelope. Without normalization the bare object fails the
      // downstream parseEnvelope and the learner hits DEFAULT_FALLBACK_TEXT in
      // English. The streaming path must localize the decline by
      // conversationLanguage just like chat() does.
      const body = sse(
        'data: {"choices":[{"delta":{"content":"{\\"type\\":"}}]}',
        'data: {"choices":[{"delta":{"content":"\\"refusal\\"}"}}]}',
        'data: [DONE]',
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

      let streamed = '';
      for await (const chunk of provider.chatStream(MESSAGES, {
        ...CFG,
        conversationLanguage: 'pl',
      })) {
        streamed += chunk;
      }

      // The emitted content must be a parseable envelope (not the bare refusal).
      const parsed = parseEnvelope(streamed);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error('expected a parseable envelope');
      // And it must be the Polish decline, not the English one.
      const plReply = parsed.envelope.reply;
      const enReply = normalizeModelRefusal('{"type":"refusal"}', 'en');
      const enParsed = parseEnvelope(enReply!);
      if (!enParsed.ok) throw new Error('expected parseable English envelope');
      expect(plReply).not.toBe(enParsed.envelope.reply);
      expect(plReply.length).toBeGreaterThan(0);
    });

    it('passes a normal streamed envelope through unchanged (no buffering regression)', async () => {
      const body = sse(
        'data: {"choices":[{"delta":{"content":"{\\"reply\\":\\"Hel"}}]}',
        'data: {"choices":[{"delta":{"content":"lo\\",\\"signals\\":{}}"}}]}',
        'data: [DONE]',
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

      let streamed = '';
      for await (const chunk of provider.chatStream(MESSAGES, {
        ...CFG,
        conversationLanguage: 'pl',
      })) {
        streamed += chunk;
      }
      expect(streamed).toBe('{"reply":"Hello","signals":{}}');
    });

    it('throws SafetyFilterError when the stream finishes with content_filter', async () => {
      const body = sse(
        'data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}',
        'data: [DONE]',
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

      await expect(async () => {
        for await (const _chunk of provider.chatStream(MESSAGES, CFG)) {
          // consume
        }
      }).rejects.toThrow(SafetyFilterError);
    });
  });
});

// ---------------------------------------------------------------------------
// Best-effort prompt-cache usage (WI-1827)
// ---------------------------------------------------------------------------

describe('Cerebras Provider — usage (WI-1827)', () => {
  const provider = createCerebrasProvider('test-key');

  beforeEach(() => mockFetch.mockReset());

  it('surfaces prompt_tokens_details.cached_tokens as usage.cachedTokens', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: { content: '{"reply":"hi","signals":{}}' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens_details: { cached_tokens: 256 } },
      }),
      text: async () => '',
    });

    const result = await provider.chat(MESSAGES, CFG);
    expect(result.usage).toEqual({ cachedTokens: 256 });
  });

  it('omits usage when cached_tokens is absent', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse('{"reply":"hi","signals":{}}', 'stop'),
    );
    const result = await provider.chat(MESSAGES, CFG);
    expect(result.usage).toBeUndefined();
  });
});
