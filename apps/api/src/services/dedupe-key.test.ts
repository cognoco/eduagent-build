import {
  encodeDedupeSegment,
  encodeOptionalDedupeSegment,
  joinDedupeKey,
  buildEmailIdempotencyKey,
  buildLegacyEmailIdempotencyKey,
} from './dedupe-key';

describe('encodeDedupeSegment', () => {
  it('passes through safe characters', () => {
    expect(encodeDedupeSegment('hello_world-123')).toBe('hello_world-123');
  });

  it('encodes colons so they cannot collide with delimiters', () => {
    expect(encodeDedupeSegment('a:b')).toBe('a%3Ab');
  });

  it('encodes pipes', () => {
    expect(encodeDedupeSegment('a|b')).toBe('a%7Cb');
  });

  it('encodes spaces and special characters', () => {
    expect(encodeDedupeSegment('hello world')).toBe('hello%20world');
    expect(encodeDedupeSegment('a=b')).toBe('a%3Db');
  });
});

describe('encodeOptionalDedupeSegment', () => {
  it('returns "null" for null', () => {
    expect(encodeOptionalDedupeSegment(null)).toBe('null');
  });

  it('returns "null" for undefined', () => {
    expect(encodeOptionalDedupeSegment(undefined)).toBe('null');
  });

  it('wraps present values in value() with encoding', () => {
    expect(encodeOptionalDedupeSegment('sentence')).toBe('value(sentence)');
  });

  it('encodes special chars inside value()', () => {
    expect(encodeOptionalDedupeSegment('a:b')).toBe('value(a%3Ab)');
  });

  it('distinguishes the literal string "null" from absence', () => {
    const absent = encodeOptionalDedupeSegment(null);
    const literalNull = encodeOptionalDedupeSegment('null');
    expect(absent).toBe('null');
    expect(literalNull).toBe('value(null)');
    expect(absent).not.toBe(literalNull);
  });
});

describe('joinDedupeKey', () => {
  it('joins segments with the given delimiter', () => {
    expect(joinDedupeKey(['a', 'b', 'c'], ':')).toBe('a:b:c');
    expect(joinDedupeKey(['x', 'y'], '|')).toBe('x|y');
  });

  it('handles single segment', () => {
    expect(joinDedupeKey(['solo'], ':')).toBe('solo');
  });
});

describe('buildEmailIdempotencyKey', () => {
  it('joins segments with colon delimiter', () => {
    expect(buildEmailIdempotencyKey('weekly', 'user_123', '2026-W01')).toBe(
      'value(weekly):value(user_123):value(2026-W01)',
    );
  });

  it('encodes segments containing colons', () => {
    expect(buildEmailIdempotencyKey('prefix', 'a:b', 'c')).toBe(
      'value(prefix):value(a%3Ab):value(c)',
    );
  });

  it('represents null/undefined segments as "null"', () => {
    expect(buildEmailIdempotencyKey('test', null, undefined, 'end')).toBe(
      'value(test):null:null:value(end)',
    );
  });

  it('distinguishes the literal string "null" from absence', () => {
    const withAbsent = buildEmailIdempotencyKey('x', null);
    const withLiteral = buildEmailIdempotencyKey('x', 'null');
    expect(withAbsent).toBe('value(x):null');
    expect(withLiteral).toBe('value(x):value(null)');
    expect(withAbsent).not.toBe(withLiteral);
  });

  it('produces deterministic output for consent-reminder pattern', () => {
    const key = buildEmailIdempotencyKey(
      'consent-reminder',
      'profile_abc',
      'evt_123',
      'step-1',
    );
    expect(key).toBe(
      'value(consent-reminder):value(profile_abc):value(evt_123):value(step-1)',
    );
  });

  it('produces deterministic output for feedback-delivery-failed pattern', () => {
    const key = buildEmailIdempotencyKey(
      'feedback-delivery-failed',
      'profile_abc',
      'evt_123',
      'retry-delivery',
    );
    expect(key).toBe(
      'value(feedback-delivery-failed):value(profile_abc):value(evt_123):value(retry-delivery)',
    );
  });
});

describe('buildLegacyEmailIdempotencyKey', () => {
  it('preserves existing weekly/monthly Resend idempotency format', () => {
    expect(
      buildLegacyEmailIdempotencyKey('weekly', 'parent_123', '2026-05-12'),
    ).toBe('weekly-parent_123-2026-05-12');
    expect(
      buildLegacyEmailIdempotencyKey('monthly', 'parent_123', '2026-05'),
    ).toBe('monthly-parent_123-2026-05');
  });
});
