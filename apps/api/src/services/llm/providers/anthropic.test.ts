import {
  toAnthropicContent,
  toAnthropicFormat,
  createAnthropicProvider,
} from './anthropic';
import type { MessagePart, ChatMessage, ModelConfig } from '../types';

// ---------------------------------------------------------------------------
// toAnthropicContent — pure formatting, no HTTP mocks needed
// ---------------------------------------------------------------------------

describe('toAnthropicContent', () => {
  it('returns a plain string unchanged', () => {
    expect(toAnthropicContent('Hello')).toBe('Hello');
  });

  it('extracts text from a text-only MessagePart[]', () => {
    const parts: MessagePart[] = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'World' },
    ];
    // When no images are present, it collapses to a single string via getTextContent
    expect(toAnthropicContent(parts)).toBe('Hello\nWorld');
  });

  it('maps InlineDataPart to Anthropic image content blocks', () => {
    const parts: MessagePart[] = [
      { type: 'inline_data', mimeType: 'image/jpeg', data: 'base64data==' },
      { type: 'text', text: 'What is in this image?' },
    ];

    expect(toAnthropicContent(parts)).toEqual([
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: 'base64data==',
        },
      },
      { type: 'text', text: 'What is in this image?' },
    ]);
  });

  it('handles multiple images in a single message', () => {
    const parts: MessagePart[] = [
      { type: 'inline_data', mimeType: 'image/png', data: 'img1==' },
      { type: 'inline_data', mimeType: 'image/webp', data: 'img2==' },
      { type: 'text', text: 'Compare these two diagrams' },
    ];

    const result = toAnthropicContent(parts);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    expect((result as unknown[])[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'img1==' },
    });
    expect((result as unknown[])[1]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/webp', data: 'img2==' },
    });
  });
});

// ---------------------------------------------------------------------------
// toAnthropicFormat — CR-2026-05-21-080: JSON directive injection
// ---------------------------------------------------------------------------

const JSON_DIRECTIVE =
  'Respond with a single JSON object only. No prose, no markdown, no code fences.';

describe('toAnthropicFormat — responseFormat json directive', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are a helpful tutor.' },
    { role: 'user', content: 'Give me a quiz.' },
  ];

  it('does NOT append JSON directive when responseFormat is undefined', () => {
    const { system } = toAnthropicFormat(messages, undefined);
    expect(system).toBe('You are a helpful tutor.');
    expect(system).not.toContain(JSON_DIRECTIVE);
  });

  it('appends JSON directive to existing system message when responseFormat="json"', () => {
    const { system } = toAnthropicFormat(messages, 'json');
    expect(system).toBe(`You are a helpful tutor.\n\n${JSON_DIRECTIVE}`);
  });

  it('sets system to JSON directive when there is no system message and responseFormat="json"', () => {
    const noSystemMessages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
    ];
    const { system } = toAnthropicFormat(noSystemMessages, 'json');
    expect(system).toBe(JSON_DIRECTIVE);
  });

  it('preserves all non-system messages unchanged', () => {
    const { messages: converted } = toAnthropicFormat(messages, 'json');
    expect(converted).toHaveLength(1);
    expect(converted[0]).toEqual({ role: 'user', content: 'Give me a quiz.' });
  });
});

// ---------------------------------------------------------------------------
// createAnthropicProvider — CR-2026-05-21-080: fetch payload includes directive
// Mocks only the Anthropic HTTP API (external boundary), not the router.
// ---------------------------------------------------------------------------

const baseConfig: ModelConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  maxTokens: 1024,
};

const mockSuccessResponse = {
  content: [{ type: 'text', text: '{"answer": 42}' }],
  stop_reason: 'end_turn',
};

describe('createAnthropicProvider — responseFormat json in fetch payload', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse),
      text: () => Promise.resolve(JSON.stringify(mockSuccessResponse)),
    } as unknown as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('includes the JSON-only directive in the system field when responseFormat="json"', async () => {
    const provider = createAnthropicProvider('test-api-key');
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a quiz generator.' },
      { role: 'user', content: 'Generate a quiz.' },
    ];

    await provider.chat(messages, { ...baseConfig, responseFormat: 'json' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { system?: string };
    expect(body.system).toContain(JSON_DIRECTIVE);
    expect(body.system).toContain('You are a quiz generator.');
  });

  it('does NOT include the JSON-only directive when responseFormat is not set', async () => {
    const provider = createAnthropicProvider('test-api-key');
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a quiz generator.' },
      { role: 'user', content: 'Generate a quiz.' },
    ];

    await provider.chat(messages, baseConfig);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { system?: string };
    expect(body.system).toBe('You are a quiz generator.');
    expect(body.system).not.toContain(JSON_DIRECTIVE);
  });
});

// ---------------------------------------------------------------------------
// [FCR-2026-05-23-L11.F11] data.error preserves structured cause chain
// ---------------------------------------------------------------------------

describe('createAnthropicProvider — data.error preserves cause', () => {
  it('throws with cause set to the structured error object', async () => {
    const structuredError = {
      type: 'rate_limit_error',
      message: 'Too many requests',
    };
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ error: structuredError }),
      text: () => Promise.resolve(JSON.stringify({ error: structuredError })),
    } as unknown as Response);

    const provider = createAnthropicProvider('test-api-key');
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

    let caughtError: unknown;
    try {
      await provider.chat(messages, {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        maxTokens: 100,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toContain('Too many requests');
    // [FCR-2026-05-23-L11.F11] structured error fields must be preserved as cause
    expect((caughtError as Error & { cause: unknown }).cause).toEqual(
      structuredError,
    );
  });
});
