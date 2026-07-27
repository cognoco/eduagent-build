import { createMistralProvider } from './mistral';
import type { ChatMessage, ModelConfig } from '../types';
import { SafetyFilterError } from '../../../errors';

const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch;

const MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello' },
];

const CFG: ModelConfig = {
  provider: 'mistral',
  model: 'mistral-small-2603',
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

describe('Mistral Provider', () => {
  const provider = createMistralProvider('test-key');

  beforeEach(() => mockFetch.mockReset());

  it('posts to the Mistral URL with bearer auth, max_tokens and verbatim model', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('hi there', 'stop'));
    await provider.chat(MESSAGES, CFG);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
    expect(opts.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('mistral-small-2603');
    expect(body.max_tokens).toBe(8192); // Mistral uses max_tokens
    expect('max_completion_tokens' in body).toBe(false);
    expect('reasoning_effort' in body).toBe(false);
  });

  it('serializes an image content part to the OpenAI image_url shape (vision)', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('a cat', 'stop'));
    const visionMessages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'inline_data', mimeType: 'image/jpeg', data: 'base64data==' },
          { type: 'text', text: 'What is this?' },
        ],
      },
    ];
    await provider.chat(visionMessages, CFG);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,base64data==' },
      },
      { type: 'text', text: 'What is this?' },
    ]);
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
      status: 503,
      text: async () => 'Service unavailable',
    });
    let caught: unknown;
    try {
      await provider.chat(MESSAGES, CFG);
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).message).toBe(
      'Mistral API request failed (status 503)',
    );
    expect((caught as Error).message).not.toContain('Service unavailable');
  });

  // [WI-984] Regression: unexpected provider response shape (e.g. null JSON body)
  // must throw a typed provider error, not a TypeError crash on property access.
  // null JSON → old code: TypeError("Cannot read properties of null");
  //             new code: createProviderApiError → "Mistral API error [invalid_response_shape]"
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
    expect((caught as Error).message).toContain('Mistral API');
    // Must NOT be a raw runtime TypeError from undefined field access.
    expect(caught).not.toBeInstanceOf(TypeError);
  });

  it('streams content chunks and sends stream:true', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"content":"Bon"}}]}',
              'data: {"choices":[{"delta":{"content":"jour"}}]}',
              'data: [DONE]',
            ].join('\n') + '\n',
          ),
        );
        controller.close();
      },
    });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

    const chunks: string[] = [];
    for await (const chunk of provider.chatStream(MESSAGES, CFG)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['Bon', 'jour']);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).stream).toBe(true);
  });

  it('logs malformed stream metadata without response content', async () => {
    const sensitiveText = 'PRIVATE_RECITATION_SENTINEL';
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              `data: {${sensitiveText}}`,
              'data: {"choices":[{"delta":{"content":"ok"}}]}',
              'data: [DONE]',
            ].join('\n') + '\n',
          ),
        );
        controller.close();
      },
    });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

    const chunks: string[] = [];
    for await (const chunk of provider.chatStream(MESSAGES, CFG)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['ok']);
    expect(warnSpy).toHaveBeenCalled();
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(sensitiveText);
    warnSpy.mockRestore();
  });
});
