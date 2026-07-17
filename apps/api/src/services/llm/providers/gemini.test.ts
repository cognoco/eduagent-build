import { createGeminiProvider, toGeminiParts } from './gemini';
import type {
  LLMProvider,
  ChatMessage,
  ModelConfig,
  MessagePart,
} from '../types';
import { SafetyFilterError } from '../../../errors';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_API_KEY = 'test-gemini-key';
const DEFAULT_CONFIG: ModelConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  maxTokens: 4096,
};

function geminiResponse(text: string) {
  return {
    candidates: [
      {
        content: { role: 'model', parts: [{ text }] },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    },
  };
}

function sseChunks(texts: string[]): string {
  return texts
    .map(
      (text) =>
        `data: ${JSON.stringify({
          candidates: [{ content: { parts: [{ text }] } }],
        })}`,
    )
    .join('\n\n');
}

function mockFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockStreamResponse(sseData: string, status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseData));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let provider: LLMProvider;
let fetchSpy: jest.SpyInstance;

// [WI-1862] On this host (confirmed: Node v26.3.0; CI runs Node 22 and does not
// reproduce), `jest.useFakeTimers()` followed by `jest.useRealTimers()` — the
// exact sequence the "throws on mid-stream stall" test below performs — leaves
// `globalThis.setTimeout`/`clearTimeout` as `undefined` instead of restoring the
// real functions. That poisoned global then leaks into every later test in this
// file, throwing `clearTimeout is not defined` from the unrelated
// `readWithTimeout()` cleanup in gemini.ts. Reproduced independently of this
// file's code with a bare `jest.useFakeTimers(); jest.useRealTimers();` — not a
// gemini.ts defect. Restore the real timer functions after every test so a
// poisoned global never leaks past the test that poisoned it.
const REAL_SET_TIMEOUT = globalThis.setTimeout;
const REAL_CLEAR_TIMEOUT = globalThis.clearTimeout;

beforeEach(() => {
  provider = createGeminiProvider(TEST_API_KEY);
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
  if (typeof globalThis.setTimeout !== 'function') {
    globalThis.setTimeout = REAL_SET_TIMEOUT;
  }
  if (typeof globalThis.clearTimeout !== 'function') {
    globalThis.clearTimeout = REAL_CLEAR_TIMEOUT;
  }
});

describe('Gemini Provider', () => {
  describe('chat()', () => {
    it('sends correct request format and returns response text', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse(geminiResponse('Hello from Gemini!')),
      );

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello world' },
      ];
      const result = await provider.chat(messages, DEFAULT_CONFIG);

      expect(result.content).toBe('Hello from Gemini!');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain('gemini-2.5-flash:generateContent');
      expect(url).not.toContain(TEST_API_KEY);
      expect(url).not.toContain('key=');
      expect(options.method).toBe('POST');
      expect(options.headers).toMatchObject({
        'Content-Type': 'application/json',
        'x-goog-api-key': TEST_API_KEY,
      });

      const body = JSON.parse(options.body);
      expect(body.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello world' }] },
      ]);
      expect(body.generationConfig.maxOutputTokens).toBe(4096);
    });

    it('requests JSON mode when responseFormat is json', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse(geminiResponse('{"reply":"Hello","signals":{}}')),
      );

      await provider.chat([{ role: 'user', content: 'Hello world' }], {
        ...DEFAULT_CONFIG,
        responseFormat: 'json',
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.generationConfig).toMatchObject({
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      });
    });

    it('separates system messages into systemInstruction', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(geminiResponse('response')));

      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a tutor.' },
        { role: 'user', content: 'Explain gravity' },
      ];
      await provider.chat(messages, DEFAULT_CONFIG);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.systemInstruction).toEqual({
        parts: [{ text: 'You are a tutor.' }],
      });
      expect(body.contents).toEqual([
        { role: 'user', parts: [{ text: 'Explain gravity' }] },
      ]);
    });

    it('maps assistant role to model role', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(geminiResponse('response')));

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'How are you?' },
      ];
      await provider.chat(messages, DEFAULT_CONFIG);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.contents[1].role).toBe('model');
    });

    it('uses correct model in URL', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(geminiResponse('response')));

      const proConfig: ModelConfig = {
        ...DEFAULT_CONFIG,
        model: 'gemini-2.5-pro',
        maxTokens: 8192,
      };
      await provider.chat([{ role: 'user', content: 'test' }], proConfig);

      const url = fetchSpy.mock.calls[0][0];
      expect(url).toContain('gemini-2.5-pro:generateContent');
    });

    it('throws on non-200 status', async () => {
      fetchSpy.mockResolvedValue(new Response('Rate limited', { status: 429 }));

      await expect(
        provider.chat([{ role: 'user', content: 'test' }], DEFAULT_CONFIG),
      ).rejects.toThrow('Gemini API request failed (status 429)');
    });

    it('preserves HTTP status on non-200 response errors', async () => {
      fetchSpy.mockResolvedValue(new Response('Forbidden', { status: 403 }));

      let caughtError: unknown;
      try {
        await provider.chat(
          [{ role: 'user', content: 'test' }],
          DEFAULT_CONFIG,
        );
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error & { status?: number }).status).toBe(403);
      expect((caughtError as Error & { statusCode?: number }).statusCode).toBe(
        403,
      );
    });

    it('throws on empty response candidates', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ candidates: [] }));

      await expect(
        provider.chat([{ role: 'user', content: 'test' }], DEFAULT_CONFIG),
      ).rejects.toThrow('Gemini returned empty response');
    });

    it('throws on API error response without leaking the vendor message', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          error: { message: 'Invalid API key', code: 403 },
        }),
      );

      let caughtError: unknown;
      try {
        await provider.chat(
          [{ role: 'user', content: 'test' }],
          DEFAULT_CONFIG,
        );
      } catch (err) {
        caughtError = err;
      }

      expect((caughtError as Error).message).toBe('Gemini API error [403]');
      expect((caughtError as Error).message).not.toContain('Invalid API key');
      expect((caughtError as Error).cause).toEqual({ code: 403 });
    });

    it('[FCR-2026-05-23-L11.F11] data.error keeps only non-content tokens as cause', async () => {
      const structuredError = { message: 'Quota exceeded', code: 429 };
      fetchSpy.mockResolvedValue(mockFetchResponse({ error: structuredError }));

      let caughtError: unknown;
      try {
        await provider.chat(
          [{ role: 'user', content: 'test' }],
          DEFAULT_CONFIG,
        );
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
      // The vendor free-text message must NOT survive (it can echo input).
      expect((caughtError as Error).message).not.toContain('Quota exceeded');
      // Only the structured code token is kept — preserved for Sentry grouping
      // and the router's numeric-code HTTP classification.
      expect((caughtError as Error & { cause: unknown }).cause).toEqual({
        code: 429,
      });
    });

    it('concatenates initial contiguous system messages into systemInstruction', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(geminiResponse('response')));

      const messages: ChatMessage[] = [
        { role: 'system', content: 'Rule 1' },
        { role: 'system', content: 'Rule 2' },
        { role: 'user', content: 'Question' },
      ];
      await provider.chat(messages, DEFAULT_CONFIG);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.systemInstruction.parts[0].text).toBe('Rule 1\n\nRule 2');
    });

    it('converts mid-conversation system messages to positional user messages', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(geminiResponse('response')));

      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a tutor.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'system', content: 'Give a hint about gravity.' },
        { role: 'user', content: 'I need help' },
      ];
      await provider.chat(messages, DEFAULT_CONFIG);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      // Initial system message stays in systemInstruction
      expect(body.systemInstruction.parts[0].text).toBe('You are a tutor.');
      // Mid-conversation system message becomes a user message with wrapper
      expect(body.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there!' }] },
        {
          role: 'user',
          parts: [{ text: '[Tutor instruction]: Give a hint about gravity.' }],
        },
        { role: 'user', parts: [{ text: 'I need help' }] },
      ]);
    });
  });

  describe('safety settings for minors', () => {
    it('includes safetySettings for minors in every request', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse(geminiResponse('safe response')),
      );

      await provider.chat([{ role: 'user', content: 'test' }], DEFAULT_CONFIG);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.safetySettings).toHaveLength(5);
      expect(body.safetySettings).toContainEqual({
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_LOW_AND_ABOVE',
      });
      // All other categories use BLOCK_MEDIUM_AND_ABOVE
      for (const category of [
        'HARM_CATEGORY_HARASSMENT',
        'HARM_CATEGORY_HATE_SPEECH',
        'HARM_CATEGORY_DANGEROUS_CONTENT',
        'HARM_CATEGORY_CIVIC_INTEGRITY',
      ]) {
        expect(body.safetySettings).toContainEqual({
          category,
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        });
      }
    });

    it('throws on prompt safety block', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          promptFeedback: { blockReason: 'SAFETY' },
          candidates: [],
        }),
      );

      await expect(
        provider.chat(
          [{ role: 'user', content: 'harmful prompt' }],
          DEFAULT_CONFIG,
        ),
      ).rejects.toThrow('content safety filters');
    });

    it('throws on candidate safety block', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          candidates: [
            {
              content: { parts: [] },
              finishReason: 'SAFETY',
            },
          ],
        }),
      );

      await expect(
        provider.chat([{ role: 'user', content: 'test' }], DEFAULT_CONFIG),
      ).rejects.toThrow('blocked by content safety filters');
    });

    // [H1 — 2026-06-05 safety audit][BREAK] Every content-block reason must
    // be a terminal SafetyFilterError, not just SAFETY. Before the fix,
    // PROHIBITED_CONTENT / BLOCKLIST / SPII surfaced as generic errors which
    // the router retried and FELL BACK to another provider — re-opening the
    // "Gemini refused, ask someone else" loophole. Reverting
    // isTerminalBlockReason() in gemini.ts makes these fail.
    describe('[H1] non-SAFETY content-block reasons are terminal SafetyFilterError', () => {
      it.each(['PROHIBITED_CONTENT', 'BLOCKLIST'])(
        'prompt-level blockReason %s throws SafetyFilterError',
        async (blockReason) => {
          fetchSpy.mockResolvedValue(
            mockFetchResponse({
              promptFeedback: { blockReason },
              candidates: [],
            }),
          );

          await expect(
            provider.chat(
              [{ role: 'user', content: 'blocked prompt' }],
              DEFAULT_CONFIG,
            ),
          ).rejects.toThrow(SafetyFilterError);
        },
      );

      it.each(['PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY'])(
        'candidate-level finishReason %s throws SafetyFilterError',
        async (finishReason) => {
          fetchSpy.mockResolvedValue(
            mockFetchResponse({
              candidates: [{ content: { parts: [] }, finishReason }],
            }),
          );

          await expect(
            provider.chat([{ role: 'user', content: 'test' }], DEFAULT_CONFIG),
          ).rejects.toThrow(SafetyFilterError);
        },
      );

      it('RECITATION is NOT terminal — copyright block, retry elsewhere is acceptable', async () => {
        fetchSpy.mockResolvedValue(
          mockFetchResponse({
            candidates: [
              { content: { parts: [] }, finishReason: 'RECITATION' },
            ],
          }),
        );

        // Empty parts + non-terminal reason → generic empty-response error,
        // which the router treats as transient (retry/fallback allowed).
        await expect(
          provider.chat([{ role: 'user', content: 'test' }], DEFAULT_CONFIG),
        ).rejects.toThrow('Gemini returned empty response');
      });

      it('stream: candidate-level PROHIBITED_CONTENT throws SafetyFilterError', async () => {
        const chunk = `data: ${JSON.stringify({
          candidates: [
            { content: { parts: [] }, finishReason: 'PROHIBITED_CONTENT' },
          ],
        })}`;
        fetchSpy.mockResolvedValue(mockStreamResponse(chunk));

        const streamResult = provider.chatStream(
          [{ role: 'user', content: 'test' }],
          DEFAULT_CONFIG,
        );

        await expect(async () => {
          for await (const _ of streamResult) {
            // drain
          }
        }).rejects.toThrow(SafetyFilterError);
      });
    });
  });

  // toGeminiParts — pure formatting, no HTTP mocks needed [IMG-VISION]
  // Mirrors tests for toAnthropicContent and toOpenAIContent.
  describe('toGeminiParts', () => {
    it('converts plain string to text part', () => {
      expect(toGeminiParts('Hello')).toEqual([{ text: 'Hello' }]);
    });

    it('converts text-only MessagePart[] to text parts', () => {
      const parts: MessagePart[] = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ];
      expect(toGeminiParts(parts)).toEqual([
        { text: 'Hello' },
        { text: 'World' },
      ]);
    });

    it('converts inline_data parts to Gemini inline_data format', () => {
      const parts: MessagePart[] = [
        { type: 'text', text: 'Describe this image' },
        { type: 'inline_data', mimeType: 'image/jpeg', data: 'base64data' },
      ];
      expect(toGeminiParts(parts)).toEqual([
        { text: 'Describe this image' },
        { inline_data: { mime_type: 'image/jpeg', data: 'base64data' } },
      ]);
    });

    it('handles multiple image parts', () => {
      const parts: MessagePart[] = [
        { type: 'inline_data', mimeType: 'image/png', data: 'img1' },
        { type: 'text', text: 'Compare these' },
        { type: 'inline_data', mimeType: 'image/webp', data: 'img2' },
      ];
      const result = toGeminiParts(parts);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        inline_data: { mime_type: 'image/png', data: 'img1' },
      });
      expect(result[1]).toEqual({ text: 'Compare these' });
      expect(result[2]).toEqual({
        inline_data: { mime_type: 'image/webp', data: 'img2' },
      });
    });
  });

  describe('chatStream()', () => {
    it('yields text chunks from SSE stream', async () => {
      const sse = sseChunks(['Hello ', 'world', '!']);
      fetchSpy.mockResolvedValue(mockStreamResponse(sse));

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(
        [{ role: 'user', content: 'test' }],
        DEFAULT_CONFIG,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello ', 'world', '!']);
    });

    it('uses streamGenerateContent endpoint with alt=sse', async () => {
      fetchSpy.mockResolvedValue(mockStreamResponse(sseChunks(['ok'])));

      for await (const _ of provider.chatStream(
        [{ role: 'user', content: 'test' }],
        DEFAULT_CONFIG,
      )) {
        // consume stream
      }

      const url = fetchSpy.mock.calls[0][0];
      const options = fetchSpy.mock.calls[0][1];
      expect(url).toContain('streamGenerateContent');
      expect(url).toContain('alt=sse');
      expect(url).not.toContain(TEST_API_KEY);
      expect(url).not.toContain('key=');
      expect(options.headers).toMatchObject({
        'Content-Type': 'application/json',
        'x-goog-api-key': TEST_API_KEY,
      });
    });

    it('throws on non-200 status', async () => {
      fetchSpy.mockResolvedValue(new Response('Server error', { status: 500 }));

      await expect(async () => {
        for await (const _ of provider.chatStream(
          [{ role: 'user', content: 'test' }],
          DEFAULT_CONFIG,
        )) {
          // consume stream
        }
      }).rejects.toThrow('Gemini API stream failed (status 500)');
    });

    it('preserves HTTP status on non-200 stream response errors', async () => {
      fetchSpy.mockResolvedValue(new Response('Bad request', { status: 400 }));

      let caughtError: unknown;
      try {
        for await (const _ of provider.chatStream(
          [{ role: 'user', content: 'test' }],
          DEFAULT_CONFIG,
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

    it('skips malformed SSE chunks gracefully', async () => {
      const sse = [
        'data: not-valid-json',
        '',
        `data: ${JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'valid' }] } }],
        })}`,
      ].join('\n');
      fetchSpy.mockResolvedValue(mockStreamResponse(sse));

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(
        [{ role: 'user', content: 'test' }],
        DEFAULT_CONFIG,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['valid']);
    });

    it('handles [DONE] sentinel', async () => {
      const sse = [
        `data: ${JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'chunk' }] } }],
        })}`,
        'data: [DONE]',
      ].join('\n');
      fetchSpy.mockResolvedValue(mockStreamResponse(sse));

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(
        [{ role: 'user', content: 'test' }],
        DEFAULT_CONFIG,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['chunk']);
    });

    it('includes safetySettings in stream requests', async () => {
      fetchSpy.mockResolvedValue(mockStreamResponse(sseChunks(['ok'])));

      for await (const _ of provider.chatStream(
        [{ role: 'user', content: 'test' }],
        DEFAULT_CONFIG,
      )) {
        // consume stream
      }

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.safetySettings).toHaveLength(5);
    });

    it('throws on mid-stream stall after per-chunk timeout [BUG-32]', async () => {
      jest.useFakeTimers();
      const encoder = new TextEncoder();
      const firstChunk = `data: ${JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'first' }] } }],
      })}\n\n`;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(firstChunk));
        },
      });
      fetchSpy.mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );
      const chunks: string[] = [];
      const streamPromise = (async () => {
        for await (const chunk of provider.chatStream(
          [{ role: 'user', content: 'test' }],
          DEFAULT_CONFIG,
        )) {
          chunks.push(chunk);
        }
      })();
      const caughtError = streamPromise.catch((err: unknown) => err);
      await jest.advanceTimersByTimeAsync(100);
      await jest.advanceTimersByTimeAsync(10_000);
      const error = await caughtError;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'Gemini stream stalled: no data received for 10s',
      );
      expect(chunks).toEqual(['first']);
      jest.useRealTimers();
    });

    it('throws on safety block during stream', async () => {
      const sse = `data: ${JSON.stringify({
        candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
      })}`;
      fetchSpy.mockResolvedValue(mockStreamResponse(sse));

      await expect(async () => {
        for await (const _ of provider.chatStream(
          [{ role: 'user', content: 'test' }],
          DEFAULT_CONFIG,
        )) {
          // consume stream
        }
      }).rejects.toThrow('blocked by content safety filters');
    });
  });

  // [WI-481] Trust-boundary validation of the raw Gemini response body. A
  // null/malformed/wrong-shape 2xx body must throw a TYPED provider error
  // ("Gemini API ..."), never a raw TypeError from undefined field access.
  describe('[WI-481] malformed response body', () => {
    it('throws a typed provider error (not TypeError) when JSON body is null', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(null));

      let caughtError: unknown;
      try {
        await provider.chat(
          [{ role: 'user', content: 'Hello' }],
          DEFAULT_CONFIG,
        );
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toContain('Gemini API');
      expect(caughtError).not.toBeInstanceOf(TypeError);
    });

    it('throws a typed provider error when a candidate part has a non-string text', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          candidates: [{ content: { parts: [{ text: 5 }] } }],
        }),
      );

      await expect(
        provider.chat([{ role: 'user', content: 'Hello' }], DEFAULT_CONFIG),
      ).rejects.toThrow('Gemini API');
    });
  });
});
