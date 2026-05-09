import { streamErrorFrameSchema } from './stream-fallback.js';

describe('streamErrorFrameSchema', () => {
  it('accepts an error frame with a stable code', () => {
    const parsed = streamErrorFrameSchema.parse({
      type: 'error',
      code: 'quota_exhausted',
      message:
        'Something went wrong while generating a reply. Please try again.',
    });

    expect(parsed).toEqual({
      type: 'error',
      code: 'quota_exhausted',
      message:
        'Something went wrong while generating a reply. Please try again.',
    });
  });

  it('accepts an error frame without a code', () => {
    const parsed = streamErrorFrameSchema.parse({
      type: 'error',
      message: 'Failed to save session progress. Please try again.',
    });

    expect(parsed).toEqual({
      type: 'error',
      message: 'Failed to save session progress. Please try again.',
    });
  });
});
