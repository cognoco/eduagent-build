import { createGeminiProvider } from './gemini';
import type { LLMProvider, ChatMessage, ModelConfig } from '../types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_API_KEY = 'test-gemini-key';
const DEFAULT_CONFIG: ModelConfig = {
  provider: 'gemini',
  model: 'gemini-2.0-flash',
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
        })}`
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

beforeEach(() => {
  provider = createGeminiProvider(TEST_API_KEY);
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('Gemini Provider', () => {
  describe('chat()', () => {
    it('sends correct request format and returns response text', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse(geminiResponse('Hello from Gemini!'))
      );

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello world' },
      ];
      const result = await provider.chat(messages, DEFAULT_CONFIG);

      expect(result).toBe('Hello from Gemini!');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain('gemini-2.0-flash:generateContent');
      expect(url).toContain(`key=${TEST_API_KEY}`);
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello world' }] },
      ]);
      expect(body.generationConfig.maxOutputTokens).toBe(4096);
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
        provider.chat([{ role: 'user', content: 'test' }], DEFAULT_CONFIG)
      ).rejects.toThrow('Gemini API request failed (429)');
    });

    it('throws on empty response candidates', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ candidates: [] }));

      await expect(
        provider.chat([{ role: 'user', content: 'test' }], DEFAULT_CONFIG)
      ).rejects.toThrow('Gemini returned empty response');
    });

    it('throws on API error response', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          error: { message: 'Invalid API key', code: 403 },
        })
      );

      await expect(
        provider.chat([{ role: 'user', content: 'test' }], DEFAULT_CONFIG)
      ).rejects.toThrow('Gemini API error: Invalid API key');
    });

    it('concatenates multiple system messages', async () => {
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
  });

  describe('chatStream()', () => {
    it('yields text chunks from SSE stream', async () => {
      const sse = sseChunks(['Hello ', 'world', '!']);
      fetchSpy.mockResolvedValue(mockStreamResponse(sse));

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(
        [{ role: 'user', content: 'test' }],
        DEFAULT_CONFIG
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello ', 'world', '!']);
    });

    it('uses streamGenerateContent endpoint with alt=sse', async () => {
      fetchSpy.mockResolvedValue(mockStreamResponse(sseChunks(['ok'])));

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of provider.chatStream(
        [{ role: 'user', content: 'test' }],
        DEFAULT_CONFIG
      )) {
        // consume stream
      }

      const url = fetchSpy.mock.calls[0][0];
      expect(url).toContain('streamGenerateContent');
      expect(url).toContain('alt=sse');
    });

    it('throws on non-200 status', async () => {
      fetchSpy.mockResolvedValue(new Response('Server error', { status: 500 }));

      await expect(async () => {
        for await (const _ of provider.chatStream(
          [{ role: 'user', content: 'test' }],
          DEFAULT_CONFIG
        )) {
          // consume stream
        }
      }).rejects.toThrow('Gemini API stream failed (500)');
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
        DEFAULT_CONFIG
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
        DEFAULT_CONFIG
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['chunk']);
    });
  });
});
