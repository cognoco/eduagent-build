import {
  classificationFailedEventSchema,
  filingResolvedEventSchema,
  filingRetryCompletedEventSchema,
  filingRetryEventSchema,
  sessionAutoFileRequestedEventSchema,
  sessionCompletedEventSchema,
  sessionCompletedModeSchema,
  filingTimedOutEventSchema,
  orphanPersistFailedEventSchema,
  sessionSummaryFailedEventSchema,
  sessionTranscriptPurgedEventSchema,
  sessionPurgeDelayedEventSchema,
  summaryReconciliationRequeuedEventSchema,
  topicProbeRequestedEventSchema,
} from './inngest-events.js';

const validUuid = '00000000-0000-4000-8000-000000000001';

// ---------------------------------------------------------------------------
// [WI-577] PII-free event payload shapes (F-073/F-083/F-084/F-095)
// ---------------------------------------------------------------------------

describe('[WI-577] PII-free Inngest event payload schemas', () => {
  const minorText = 'Learner: my name is Milo Janssen, I struggle with maths';

  it('filingRetryEventSchema strips a legacy sessionTranscript field', () => {
    const parsed = filingRetryEventSchema.parse({
      profileId: validUuid,
      sessionId: validUuid,
      sessionMode: 'freeform',
      sessionTranscript: minorText,
    });
    expect(parsed).not.toHaveProperty('sessionTranscript');
    expect(JSON.stringify(parsed)).not.toContain('Milo Janssen');
  });

  it('topicProbeRequestedEventSchema accepts the reference-only payload', () => {
    const result = topicProbeRequestedEventSchema.safeParse({
      version: 1,
      profileId: validUuid,
      sessionId: validUuid,
      subjectId: validUuid,
      topicId: validUuid,
      learnerMessageEventId: validUuid,
      timestamp: '2026-06-11T10:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('topicProbeRequestedEventSchema rejects the legacy raw-text payload', () => {
    const result = topicProbeRequestedEventSchema.safeParse({
      version: 1,
      profileId: validUuid,
      sessionId: validUuid,
      subjectId: validUuid,
      topicId: validUuid,
      learnerMessage: minorText,
      topicTitle: 'Atomic structure',
      timestamp: '2026-06-11T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('topicProbeRequestedEventSchema strips raw-text keys riding alongside the reference', () => {
    const parsed = topicProbeRequestedEventSchema.parse({
      version: 1,
      profileId: validUuid,
      sessionId: validUuid,
      subjectId: validUuid,
      topicId: validUuid,
      learnerMessageEventId: validUuid,
      learnerMessage: minorText,
      topicTitle: 'Atomic structure',
      timestamp: '2026-06-11T10:00:00.000Z',
    });
    expect(parsed).not.toHaveProperty('learnerMessage');
    expect(parsed).not.toHaveProperty('topicTitle');
    expect(JSON.stringify(parsed)).not.toContain('Milo Janssen');
  });
});

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

  it('[WI-996] filingRetryEventSchema defaults sessionMode to freeform when omitted (backward-compat for in-flight events)', () => {
    // Old dispatches before WI-996 did not include sessionMode; without
    // .default('freeform') they would throw ZodError on every retry and be
    // permanently dead-lettered.
    const parsed = filingRetryEventSchema.parse({
      profileId: validUuid,
      sessionId: validUuid,
    });
    expect(parsed.sessionMode).toBe('freeform');
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

describe('sessionAutoFileRequestedEventSchema', () => {
  it('accepts a user-initiated auto-file request with a dispatch id', () => {
    expect(() =>
      sessionAutoFileRequestedEventSchema.parse({
        sessionId: validUuid,
        profileId: validUuid,
        requestedAt: '2026-05-25T10:00:00.000Z',
        reason: 'user_requested',
        dispatchId: 'manual-00000000-0000-4000-8000-000000000001',
      }),
    ).not.toThrow();
  });

  it('rejects auto-file requests without a dispatch id', () => {
    expect(() =>
      sessionAutoFileRequestedEventSchema.parse({
        sessionId: validUuid,
        profileId: validUuid,
        requestedAt: '2026-05-25T10:00:00.000Z',
        reason: 'retry',
      }),
    ).toThrow();
  });
});

describe('sessionCompletedEventSchema', () => {
  const basePayload = {
    profileId: validUuid,
    sessionId: validUuid,
    topicId: validUuid,
    subjectId: validUuid,
    sessionType: 'learning',
    verificationType: 'teach_back',
    exchangeCount: 3,
    summaryStatus: 'accepted',
    timestamp: '2026-06-24T10:00:00.000Z',
  };

  it('[WI-696] accepts the recitation completion mode without requiring a topic', () => {
    const parsed = sessionCompletedEventSchema.parse({
      ...basePayload,
      topicId: null,
      mode: 'recitation',
      interleavedTopicIds: [validUuid],
      escalationRungs: [1, 3],
      qualityRating: 4,
    });

    expect(parsed.mode).toBe('recitation');
    expect(parsed.topicId).toBeNull();
  });

  it('[WI-696] rejects malformed session-completed payload fields', () => {
    const result = sessionCompletedEventSchema.safeParse({
      ...basePayload,
      mode: 'not-a-session-mode',
      exchangeCount: '3',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['mode', 'exchangeCount']),
      );
    }
  });

  it('[WI-696] exposes a mode enum that includes recitation', () => {
    expect(sessionCompletedModeSchema.safeParse('recitation').success).toBe(
      true,
    );
    expect(
      sessionCompletedModeSchema.safeParse('not-a-session-mode').success,
    ).toBe(false);
  });
});

describe('[BUG-585] orphanPersistFailedEventSchema error field max-length cap', () => {
  const validUuid = '00000000-0000-4000-8000-000000000001';
  const validBase = {
    profileId: validUuid,
    draftId: validUuid,
    route: '/api/session',
    reason: null,
  };

  it('accepts an error string at the 2000-character limit', () => {
    expect(
      orphanPersistFailedEventSchema.safeParse({
        ...validBase,
        error: 'a'.repeat(2000),
      }).success,
    ).toBe(true);
  });

  it('rejects an error string exceeding 2000 characters', () => {
    expect(
      orphanPersistFailedEventSchema.safeParse({
        ...validBase,
        error: 'a'.repeat(2001),
      }).success,
    ).toBe(false);
  });

  it('[BUG-585] classificationFailedEventSchema rejects error string exceeding 2000 characters', () => {
    expect(
      classificationFailedEventSchema.safeParse({
        sessionId: validUuid,
        exchangeCount: 3,
        error: 'x'.repeat(2001),
      }).success,
    ).toBe(false);
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
        sessionId: validUuid,
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

// ---------------------------------------------------------------------------
// BUG-581 — UUID enforcement regression tests (red-green)
// ---------------------------------------------------------------------------

describe('BUG-581 — UUID enforcement on retention SLO schemas', () => {
  const validUuid = '00000000-0000-4000-8000-000000000001';
  const validUuid2 = '00000000-0000-4000-8000-000000000002';
  const ts = '2026-05-05T10:00:00.000Z';

  // sessionSummaryFailedEventSchema ----------------------------------------

  it('[BUG-581][BUG-991] rejects sessionSummaryFailedEvent with non-UUID profileId', () => {
    const result = sessionSummaryFailedEventSchema.safeParse({
      profileId: 'not-a-uuid',
      sessionId: validUuid,
      sessionSummaryId: null,
      timestamp: ts,
    });
    expect(result.success).toBe(false);
  });

  it('[BUG-581][BUG-991] rejects sessionSummaryFailedEvent with non-UUID sessionId', () => {
    const result = sessionSummaryFailedEventSchema.safeParse({
      profileId: validUuid,
      sessionId: 'not-a-uuid',
      sessionSummaryId: null,
      timestamp: ts,
    });
    expect(result.success).toBe(false);
  });

  it('[BUG-581][BUG-991] accepts sessionSummaryFailedEvent with valid UUIDs', () => {
    const result = sessionSummaryFailedEventSchema.safeParse({
      profileId: validUuid,
      sessionId: validUuid2,
      sessionSummaryId: null,
      timestamp: ts,
    });
    expect(result.success).toBe(true);
  });

  it('[BUG-581][BUG-991] accepts sessionSummaryFailedEvent with valid sessionSummaryId UUID', () => {
    const result = sessionSummaryFailedEventSchema.safeParse({
      profileId: validUuid,
      sessionId: validUuid2,
      sessionSummaryId: validUuid,
      timestamp: ts,
    });
    expect(result.success).toBe(true);
  });

  // sessionTranscriptPurgedEventSchema — sessionId field ---------------------

  it('[BUG-581][BUG-992] rejects sessionTranscriptPurgedEvent with non-UUID sessionId', () => {
    const result = sessionTranscriptPurgedEventSchema.safeParse({
      profileId: validUuid,
      sessionId: 'not-a-uuid',
      sessionSummaryId: null,
      eventsDeleted: 0,
      embeddingRowsReplaced: 0,
    });
    expect(result.success).toBe(false);
  });

  it('[BUG-581][BUG-992] accepts sessionTranscriptPurgedEvent with valid UUID sessionId', () => {
    const result = sessionTranscriptPurgedEventSchema.safeParse({
      profileId: validUuid,
      sessionId: validUuid2,
      sessionSummaryId: null,
      eventsDeleted: 0,
      embeddingRowsReplaced: 0,
    });
    expect(result.success).toBe(true);
  });

  // sessionPurgeDelayedEventSchema — sessionIds array -----------------------

  it('[BUG-581][BUG-993] rejects sessionPurgeDelayedEvent with non-UUID in sessionIds array', () => {
    const result = sessionPurgeDelayedEventSchema.safeParse({
      delayedCount: 1,
      sessionIds: ['not-a-uuid'],
      missingPreconditionCount: 0,
      timestamp: ts,
    });
    expect(result.success).toBe(false);
  });

  it('[BUG-581][BUG-993] accepts sessionPurgeDelayedEvent with valid UUID sessionIds', () => {
    const result = sessionPurgeDelayedEventSchema.safeParse({
      delayedCount: 1,
      sessionIds: [validUuid, validUuid2],
      missingPreconditionCount: 0,
      timestamp: ts,
    });
    expect(result.success).toBe(true);
  });
});
