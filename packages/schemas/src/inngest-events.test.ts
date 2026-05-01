import {
  filingResolvedEventSchema,
  filingRetryCompletedEventSchema,
  filingRetryEventSchema,
  filingTimedOutEventSchema,
} from './inngest-events.js';

const validUuid = '00000000-0000-4000-8000-000000000001';

describe('filing lifecycle Inngest event schemas', () => {
  it('accepts a filing timeout payload', () => {
    expect(() =>
      filingTimedOutEventSchema.parse({
        sessionId: validUuid,
        profileId: validUuid,
        sessionType: null,
        timeoutMs: 60_000,
        timestamp: '2026-04-29T10:00:00.000Z',
      })
    ).not.toThrow();
  });

  it('rejects non-UUID session IDs', () => {
    expect(() =>
      filingTimedOutEventSchema.parse({
        sessionId: 'not-a-uuid',
        profileId: validUuid,
        sessionType: 'learning',
        timeoutMs: 60_000,
        timestamp: '2026-04-29T10:00:00.000Z',
      })
    ).toThrow();
  });

  it('accepts retry, retry-completed, and resolved payloads', () => {
    expect(() =>
      filingRetryEventSchema.parse({
        profileId: validUuid,
        sessionId: validUuid,
        sessionMode: 'freeform',
      })
    ).not.toThrow();

    expect(() =>
      filingRetryCompletedEventSchema.parse({
        profileId: validUuid,
        sessionId: validUuid,
        timestamp: '2026-04-29T10:00:00.000Z',
      })
    ).not.toThrow();

    expect(() =>
      filingResolvedEventSchema.parse({
        profileId: validUuid,
        sessionId: validUuid,
        resolution: 'unrecoverable',
        timestamp: '2026-04-29T10:00:00.000Z',
      })
    ).not.toThrow();
  });

  it('accepts all filingResolvedEventSchema resolution variants including recovered_after_window', () => {
    const allVariants = [
      'late_completion',
      'retry_succeeded',
      'unrecoverable',
      'recovered',
      'recovered_after_window',
    ] as const;

    for (const resolution of allVariants) {
      expect(() =>
        filingResolvedEventSchema.parse({
          profileId: validUuid,
          sessionId: validUuid,
          resolution,
          timestamp: '2026-04-29T10:00:00.000Z',
        })
      ).not.toThrow();
    }
  });

  it('rejects an unknown resolution variant in filingResolvedEventSchema', () => {
    expect(() =>
      filingResolvedEventSchema.parse({
        profileId: validUuid,
        sessionId: validUuid,
        resolution: 'totally_unknown',
        timestamp: '2026-04-29T10:00:00.000Z',
      })
    ).toThrow();
  });
});
