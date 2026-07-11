import { routeAndCall, routeAndStream, registerProvider } from './router';
import { _clearProviders, _resetCircuits } from './router';
import { createAnthropicProvider } from './providers/anthropic';
import type { ChatMessage } from './types';

// ---------------------------------------------------------------------------
// WI-1827 — cache-usage telemetry, asserted at the logger boundary.
//
// Runs the REAL Anthropic adapter through the REAL router with the HTTP/SSE
// boundary fetch-mocked (external boundary — allowed; no internal mocks).
// Proves cache_creation/cache_read tokens flow from the provider response into
// the existing `llm.stop_reason` structured log for BOTH routeAndCall (ChatResult)
// and routeAndStream (ChatStreamResult).
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch;

const MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello' },
];

function jsonResponse(body: unknown): Partial<Response> {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => '',
  };
}

function sseResponse(...events: string[]): Partial<Response> {
  const encoder = new TextEncoder();
  const text = events.map((e) => `data: ${e}`).join('\n') + '\n';
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }) as unknown as Response['body'],
  };
}

/** Capture the context payload of every `llm.stop_reason` structured log line. */
function captureStopReasonLogs(): {
  entries: Record<string, unknown>[];
  restore: () => void;
} {
  const entries: Record<string, unknown>[] = [];
  const spy = jest.spyOn(console, 'log').mockImplementation((...args) => {
    const [raw] = args;
    if (typeof raw !== 'string') return;
    try {
      const parsed = JSON.parse(raw) as {
        message?: string;
        context?: Record<string, unknown>;
      };
      if (parsed.message === 'llm.stop_reason' && parsed.context) {
        entries.push(parsed.context);
      }
    } catch {
      // non-JSON console.log — ignore
    }
  });
  return { entries, restore: () => spy.mockRestore() };
}

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 10));

describe('router cache-usage telemetry (WI-1827)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    _clearProviders();
    _resetCircuits();
    registerProvider(createAnthropicProvider('test-key'));
  });

  afterEach(() => {
    _clearProviders();
    _resetCircuits();
  });

  it('routeAndCall logs Anthropic cache tokens on llm.stop_reason', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        content: [{ type: 'text', text: 'hi' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 200,
          output_tokens: 15,
          cache_creation_input_tokens: 1024,
          cache_read_input_tokens: 4096,
        },
      }),
    );
    const { entries, restore } = captureStopReasonLogs();
    try {
      await routeAndCall(MESSAGES, 1, {
        llmTier: 'premium',
        preferredProvider: 'anthropic',
      });
    } finally {
      restore();
    }

    const anthropicLog = entries.find((e) => e.provider === 'anthropic');
    expect(anthropicLog).toBeDefined();
    expect(anthropicLog).toMatchObject({
      stop_reason: 'stop',
      input_tokens: 200,
      output_tokens: 15,
      cache_creation_input_tokens: 1024,
      cache_read_input_tokens: 4096,
    });
  });

  it('routeAndStream logs Anthropic cache tokens on llm.stop_reason', async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse(
        JSON.stringify({
          type: 'message_start',
          message: {
            usage: {
              input_tokens: 1200,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 1024,
              output_tokens: 1,
            },
          },
        }),
        JSON.stringify({
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello' },
        }),
        JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 15 },
        }),
        '[DONE]',
      ),
    );
    const { entries, restore } = captureStopReasonLogs();
    try {
      const result = await routeAndStream(MESSAGES, 1, {
        llmTier: 'premium',
        preferredProvider: 'anthropic',
      });
      let text = '';
      for await (const chunk of result.stream) text += chunk;
      expect(text).toBe('Hello');
      await result.stopReasonPromise;
      await flushMicrotasks();
    } finally {
      restore();
    }

    const anthropicLog = entries.find((e) => e.provider === 'anthropic');
    expect(anthropicLog).toBeDefined();
    expect(anthropicLog).toMatchObject({
      stop_reason: 'stop',
      input_tokens: 1200,
      cache_creation_input_tokens: 0,
      // The prefix-regression observable — a cache hit of 1024 read tokens.
      cache_read_input_tokens: 1024,
      output_tokens: 15,
    });
  });
});
