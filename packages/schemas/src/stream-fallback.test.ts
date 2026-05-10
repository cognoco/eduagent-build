import {
  streamErrorFrameSchema,
  streamFallbackFrameSchema,
} from './stream-fallback.js';

describe('streamErrorFrameSchema', () => {
  it('parses error frame with code', () => {
    const result = streamErrorFrameSchema.parse({
      type: 'error',
      code: 'quota_exhausted',
      message:
        'Something went wrong while generating a reply. Please try again.',
    });
    expect(result).toEqual({
      type: 'error',
      code: 'quota_exhausted',
      message:
        'Something went wrong while generating a reply. Please try again.',
    });
  });

  it('parses error frame without code', () => {
    const result = streamErrorFrameSchema.parse({
      type: 'error',
      message: 'Failed to save session progress. Please try again.',
    });
    expect(result).toEqual({
      type: 'error',
      message: 'Failed to save session progress. Please try again.',
    });
  });

  it('rejects frame with wrong type literal', () => {
    expect(() =>
      streamErrorFrameSchema.parse({
        type: 'fallback',
        message: 'some message',
      }),
    ).toThrow();
  });

  it('rejects frame missing message', () => {
    expect(() =>
      streamErrorFrameSchema.parse({
        type: 'error',
      }),
    ).toThrow();
  });
});

describe('streamFallbackFrameSchema', () => {
  it('parses valid fallback frame', () => {
    const result = streamFallbackFrameSchema.parse({
      type: 'fallback',
      reason: 'empty_reply',
      fallbackText: 'Let me try again.',
    });
    expect(result.type).toBe('fallback');
    expect(result.reason).toBe('empty_reply');
  });
});
