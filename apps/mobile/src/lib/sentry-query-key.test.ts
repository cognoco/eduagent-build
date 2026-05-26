import { getSentryQueryKeyTag } from './sentry-query-key';

describe('getSentryQueryKeyTag [WI-294]', () => {
  it('keeps only the first query-key segment when the key contains IDs and objects', () => {
    const tag = getSentryQueryKeyTag([
      'topic',
      '550e8400-e29b-41d4-a716-446655440000',
      { profileId: '660e8400-e29b-41d4-a716-446655440000' },
    ]);

    expect(tag).toBe('topic');
    expect(tag).not.toContain('550e8400');
    expect(tag).not.toContain('profileId');
  });

  it('uses a stable fallback for empty or non-array keys', () => {
    expect(getSentryQueryKeyTag([])).toBe('unknown');
    expect(getSentryQueryKeyTag('not-an-array')).toBe('unknown');
  });
});
