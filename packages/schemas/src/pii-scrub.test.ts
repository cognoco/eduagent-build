import {
  INNGEST_PII_PAYLOAD_KEYS,
  PII_SCRUBBED_PLACEHOLDER,
  scrubPiiPayload,
  summarizeRawPayload,
} from './pii-scrub.js';

// A "known minor identifier" in the bundle-AC sense: raw learner free-text
// that must never land in the Inngest event store.
const KNOWN_MINOR_TEXT =
  'Learner: My name is Milo Janssen and I live in Drammen, I struggle with fractions';

describe('scrubPiiPayload', () => {
  it('scrubs every denylisted key at the top level', () => {
    for (const key of INNGEST_PII_PAYLOAD_KEYS) {
      const { value, scrubbedPaths } = scrubPiiPayload({
        profileId: 'p-1',
        [key]: KNOWN_MINOR_TEXT,
      });
      expect((value as Record<string, unknown>)[key]).toBe(
        PII_SCRUBBED_PLACEHOLDER,
      );
      expect(scrubbedPaths).toEqual([key]);
      expect(JSON.stringify(value)).not.toContain('Milo Janssen');
    }
  });

  it('scrubs nested keys and reports dot paths', () => {
    const { value, scrubbedPaths } = scrubPiiPayload({
      data: {
        sessionId: 's-1',
        sessionTranscript: KNOWN_MINOR_TEXT,
        retry: [{ classifyInput: KNOWN_MINOR_TEXT }],
      },
    });
    expect(scrubbedPaths.sort()).toEqual([
      'data.retry.0.classifyInput',
      'data.sessionTranscript',
    ]);
    expect(JSON.stringify(value)).not.toContain('Milo Janssen');
  });

  it('does not mutate the input payload', () => {
    const input = { sessionTranscript: KNOWN_MINOR_TEXT, nested: { a: 1 } };
    const { value } = scrubPiiPayload(input);
    expect(input.sessionTranscript).toBe(KNOWN_MINOR_TEXT);
    expect(value).not.toBe(input);
    expect(value.nested).toEqual({ a: 1 });
  });

  it('returns empty scrubbedPaths for clean payloads', () => {
    const payload = {
      profileId: 'p-1',
      sessionId: 's-1',
      sessionMode: 'freeform',
      exchangeCount: 2,
    };
    const { value, scrubbedPaths } = scrubPiiPayload(payload);
    expect(scrubbedPaths).toEqual([]);
    expect(value).toEqual(payload);
  });

  it('leaves null/undefined denylisted fields untouched (nothing to leak)', () => {
    const { value, scrubbedPaths } = scrubPiiPayload({
      sessionTranscript: undefined,
      classifyInput: null,
    });
    expect(scrubbedPaths).toEqual([]);
    expect(value.sessionTranscript).toBeUndefined();
    expect(value.classifyInput).toBeNull();
  });

  it('supports a custom denylist', () => {
    const { value, scrubbedPaths } = scrubPiiPayload(
      { learnerMessage: KNOWN_MINOR_TEXT, keep: 'x' },
      ['learnerMessage'],
    );
    expect(value.learnerMessage).toBe(PII_SCRUBBED_PLACEHOLDER);
    expect(value.keep).toBe('x');
    expect(scrubbedPaths).toEqual(['learnerMessage']);
  });

  it('is cycle-safe', () => {
    const payload: Record<string, unknown> = {
      sessionTranscript: KNOWN_MINOR_TEXT,
    };
    payload.self = payload;
    const { value, scrubbedPaths } = scrubPiiPayload(payload);
    expect(scrubbedPaths).toEqual(['sessionTranscript']);
    expect((value as { self: unknown }).self).toBe(value);
  });

  it('passes through non-plain objects (Date) by reference', () => {
    const when = new Date('2026-06-11T00:00:00Z');
    const { value } = scrubPiiPayload({ when });
    expect(value.when).toBe(when);
  });

  it('walks null-prototype objects (no scrub bypass via Object.create(null))', () => {
    const nullProto = Object.create(null) as Record<string, unknown>;
    nullProto.sessionTranscript = KNOWN_MINOR_TEXT;
    const { value, scrubbedPaths } = scrubPiiPayload({ nested: nullProto });
    expect(scrubbedPaths).toEqual(['nested.sessionTranscript']);
    expect(JSON.stringify(value)).not.toContain('Milo Janssen');
  });
});

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

  it('never echoes input keys or values into the summary', () => {
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
