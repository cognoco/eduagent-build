import { createAnthropicProvider } from './anthropic';
import type { ChatMessage, ModelConfig } from '../types';

const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch;

const TEST_API_KEY = 'test-key-123';

const TEXT_ONLY_MESSAGES: ChatMessage[] = [
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
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  maxTokens: 4096,
};

function createOkResponse(content: string): Partial<Response> {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text: content }],
    }),
    text: async () => '',
  };
}

describe('Anthropic Provider', () => {
  const provider = createAnthropicProvider(TEST_API_KEY);

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('chat()', () => {
    it('sends text-only messages as string content', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('Hello'));

      await provider.chat(TEXT_ONLY_MESSAGES, TEST_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.system).toBe('You are helpful.');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('maps InlineDataPart to Anthropic image content blocks', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('I see a diagram'));

      await provider.chat(MULTIMODAL_MESSAGES, TEST_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.system).toBe('You are helpful.');
      expect(body.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: 'base64data==',
              },
            },
            { type: 'text', text: 'What is in this image?' },
          ],
        },
      ]);
    });
  });
});
