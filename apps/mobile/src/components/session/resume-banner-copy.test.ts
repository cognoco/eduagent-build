import { getResumeBannerCopy } from './resume-banner-copy';

describe('getResumeBannerCopy (C5 resume banner, copy sweep 2026-04-19)', () => {
  it('references the topic when topicName is present', () => {
    expect(getResumeBannerCopy('prime numbers')).toBe(
      'Welcome back — you were exploring prime numbers. Keep going?'
    );
  });

  it('falls back to generic copy when topicName is null', () => {
    expect(getResumeBannerCopy(null)).toBe(
      'Welcome back! Ready to keep going?'
    );
  });

  it('falls back when topicName is undefined (partial-hydration case)', () => {
    expect(getResumeBannerCopy(undefined)).toBe(
      'Welcome back! Ready to keep going?'
    );
  });

  it('falls back when topicName is an empty string', () => {
    expect(getResumeBannerCopy('')).toBe('Welcome back! Ready to keep going?');
  });

  it('falls back when topicName is whitespace-only', () => {
    expect(getResumeBannerCopy('   ')).toBe(
      'Welcome back! Ready to keep going?'
    );
    expect(getResumeBannerCopy('\t\n ')).toBe(
      'Welcome back! Ready to keep going?'
    );
  });

  it('does not fall back to the old "your session is ready" copy under any input', () => {
    const inputs: Array<string | null | undefined> = [
      'some topic',
      null,
      undefined,
      '',
      '   ',
    ];
    for (const input of inputs) {
      expect(getResumeBannerCopy(input)).not.toBe(
        'Welcome back - your session is ready.'
      );
    }
  });
});
