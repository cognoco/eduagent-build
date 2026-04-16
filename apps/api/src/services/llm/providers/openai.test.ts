import { createOpenAIProvider } from './openai';
import type { ChatMessage, ModelConfig } from '../types';

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

const MULTIMODAL_MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  {
    role: 'user',
    content: [
      { type: 'inline_data', mimeType: 'image/jpeg', data: 'base64data==' },
      { type: 'text', text: 'What is in this image?' },
    ],
  },
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
      expect(result).toBe('Hello from GPT');

      // Verify request structure
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(opts.headers.Authorization).toBe('Bearer test-key-123');
      const body = JSON.parse(opts.body);
      expect(body.model).toBe('gpt-4o-mini');
      expect(body.messages).toHaveLength(2);
      expect(body.max_completion_tokens).toBe(4096);
    });

    it('throws on non-2xx response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      });

      await expect(provider.chat(TEST_MESSAGES, TEST_CONFIG)).rejects.toThrow(
        'OpenAI API request failed (429): Rate limited'
      );
    });

    it('throws on data.error field in response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          error: { message: 'Invalid model', type: 'invalid_request_error' },
        }),
      });

      await expect(provider.chat(TEST_MESSAGES, TEST_CONFIG)).rejects.toThrow(
        'OpenAI API error: Invalid model'
      );
    });

    it('throws on empty choices array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [] }),
      });

      await expect(provider.chat(TEST_MESSAGES, TEST_CONFIG)).rejects.toThrow(
        'OpenAI returned empty response'
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
        'OpenAI returned empty response'
      );
    });

    it('maps InlineDataPart to OpenAI image_url content blocks', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('I see a diagram'));

      await provider.chat(MULTIMODAL_MESSAGES, TEST_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages).toEqual([
        { role: 'system', content: 'You are helpful.' },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,base64data==' },
            },
            { type: 'text', text: 'What is in this image?' },
          ],
        },
      ]);
    });
  });

  describe('chatStream()', () => {
    it('yields streamed content chunks', async () => {
      const body = createSseStream(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]'
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(
        TEST_MESSAGES,
        TEST_CONFIG
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
          TEST_CONFIG
        )) {
          chunks.push(chunk);
        }
      }).rejects.toThrow('OpenAI API stream failed (500): Internal error');
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
          TEST_CONFIG
        )) {
          chunks.push(chunk);
        }
      }).rejects.toThrow('OpenAI API returned no response body for stream');
    });

    it('skips malformed JSON chunks', async () => {
      const body = createSseStream(
        'data: {"choices":[{"delta":{"content":"ok"}}]}',
        'data: {not valid json}',
        'data: {"choices":[{"delta":{"content":"!"}}]}',
        'data: [DONE]'
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(
        TEST_MESSAGES,
        TEST_CONFIG
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['ok', '!']);
    });

    it('skips empty delta content', async () => {
      const body = createSseStream(
        'data: {"choices":[{"delta":{}}]}',
        'data: {"choices":[{"delta":{"content":"hi"}}]}',
        'data: [DONE]'
      );
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(
        TEST_MESSAGES,
        TEST_CONFIG
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
        TEST_CONFIG
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
        expect.stringContaining('gemini-3.0-flash')
      );
      warnSpy.mockRestore();
    });
  });
});
