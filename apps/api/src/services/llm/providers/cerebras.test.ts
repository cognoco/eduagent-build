import { createCerebrasProvider } from './cerebras';
import type { ChatMessage, ModelConfig } from '../types';
import { parseEnvelope } from '../envelope';
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
