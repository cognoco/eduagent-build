// ---------------------------------------------------------------------------
// pii-scrub — unit tests [WI-579 / F-018]
// ---------------------------------------------------------------------------

import { summarizeRawPayload } from './pii-scrub';

describe('summarizeRawPayload', () => {
  it('summarizes a plain object as type + field count only', () => {
    expect(
      summarizeRawPayload({ profileId: 'p-1', transcript: 'secret text' }),
    ).toEqual({ payloadType: 'object', fieldCount: 2 });
  });

  it('summarizes an array as payloadType array', () => {
    expect(summarizeRawPayload(['a', 'b'])).toEqual({ payloadType: 'array' });
  });

  it('summarizes null as payloadType object (typeof null)', () => {
    expect(summarizeRawPayload(null)).toEqual({ payloadType: 'object' });
  });

  it('summarizes primitives by typeof', () => {
    expect(summarizeRawPayload('raw learner text')).toEqual({
      payloadType: 'string',
    });
    expect(summarizeRawPayload(42)).toEqual({ payloadType: 'number' });
    expect(summarizeRawPayload(undefined)).toEqual({
      payloadType: 'undefined',
    });
  });

  it('[BREAK] never echoes input keys or values into the summary', () => {
    const sentinel = 'Tommy-aged-9-said-something-private';
    const summary = summarizeRawPayload({
      childName: sentinel,
      transcript: `transcript containing ${sentinel}`,
      nested: { deep: sentinel },
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain('childName');
    expect(serialized).not.toContain('transcript');
  });
});
