import { toAnthropicContent } from './anthropic';
import type { MessagePart } from '../types';

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
