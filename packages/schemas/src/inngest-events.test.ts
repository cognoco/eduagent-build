import {
  filingResolvedEventSchema,
  filingRetryCompletedEventSchema,
  filingRetryEventSchema,
  filingTimedOutEventSchema,
  sessionSummaryFailedEventSchema,
  sessionTranscriptPurgedEventSchema,
  sessionPurgeDelayedEventSchema,
  summaryReconciliationRequeuedEventSchema,
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
      }),
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
      }),
    ).toThrow();
  });

  it('accepts retry, retry-completed, and resolved payloads', () => {
    expect(() =>
      filingRetryEventSchema.parse({
        profileId: validUuid,
        sessionId: validUuid,
        sessionMode: 'freeform',
      }),
    ).not.toThrow();

    expect(() =>
      filingRetryCompletedEventSchema.parse({
        profileId: validUuid,
        sessionId: validUuid,
        timestamp: '2026-04-29T10:00:00.000Z',
      }),
    ).not.toThrow();

    expect(() =>
      filingResolvedEventSchema.parse({
        profileId: validUuid,
        sessionId: validUuid,
        resolution: 'unrecoverable',
        timestamp: '2026-04-29T10:00:00.000Z',
      }),
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
        }),
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
      }),
    ).toThrow();
  });
});

describe('retention SLO event schemas (BUG-991 / BUG-992 / BUG-993 / BUG-994)', () => {
  const ts = '2026-05-05T10:00:00.000Z';

  it('[BUG-991] accepts a valid sessionSummaryFailedEvent payload', () => {
    expect(() =>
      sessionSummaryFailedEventSchema.parse({
        profileId: validUuid,
        sessionId: validUuid,
        sessionSummaryId: validUuid,
        timestamp: ts,
      }),
    ).not.toThrow();
  });

  it('[BUG-991] accepts sessionSummaryFailedEvent with null sessionSummaryId', () => {
    expect(() =>
      sessionSummaryFailedEventSchema.parse({
        profileId: validUuid,
        sessionId: validUuid,
        sessionSummaryId: null,
        timestamp: ts,
      }),
    ).not.toThrow();
  });

  it('[BUG-992] accepts a valid sessionTranscriptPurgedEvent payload', () => {
    expect(() =>
      sessionTranscriptPurgedEventSchema.parse({
        profileId: validUuid,
        sessionId: validUuid,
        sessionSummaryId: validUuid,
        eventsDeleted: 5,
        embeddingRowsReplaced: 2,
        purgedAt: ts,
      }),
    ).not.toThrow();
  });

  it('[BUG-992] accepts sessionTranscriptPurgedEvent without optional purgedAt', () => {
    expect(() =>
      sessionTranscriptPurgedEventSchema.parse({
        profileId: validUuid,
        sessionId: 'session-abc',
        sessionSummaryId: null,
        eventsDeleted: 0,
        embeddingRowsReplaced: 0,
      }),
    ).not.toThrow();
  });

  it('[BUG-992] rejects sessionTranscriptPurgedEvent with negative eventsDeleted', () => {
    expect(() =>
      sessionTranscriptPurgedEventSchema.parse({
        profileId: validUuid,
        sessionId: validUuid,
        sessionSummaryId: null,
        eventsDeleted: -1,
        embeddingRowsReplaced: 0,
      }),
    ).toThrow();
  });

  it('[BUG-993] accepts a valid sessionPurgeDelayedEvent payload', () => {
    expect(() =>
      sessionPurgeDelayedEventSchema.parse({
        delayedCount: 3,
        sessionIds: [validUuid, validUuid],
        missingPreconditionCount: 3,
        timestamp: ts,
      }),
    ).not.toThrow();
  });

  it('[BUG-993] rejects sessionPurgeDelayedEvent with zero delayedCount', () => {
    expect(() =>
      sessionPurgeDelayedEventSchema.parse({
        delayedCount: 0,
        sessionIds: [],
        missingPreconditionCount: 0,
        timestamp: ts,
      }),
    ).toThrow();
  });

  it('[BUG-994] accepts a valid summaryReconciliationRequeuedEvent payload', () => {
    expect(() =>
      summaryReconciliationRequeuedEventSchema.parse({
        queryARequeued: 5,
        queryBRequeued: 3,
        queryCRequeued: 2,
        totalRequeued: 10,
        timestamp: ts,
      }),
    ).not.toThrow();
  });

  it('[BUG-994] rejects summaryReconciliationRequeuedEvent with zero totalRequeued', () => {
    expect(() =>
      summaryReconciliationRequeuedEventSchema.parse({
        queryARequeued: 0,
        queryBRequeued: 0,
        queryCRequeued: 0,
        totalRequeued: 0,
        timestamp: ts,
      }),
    ).toThrow();
  });
});
