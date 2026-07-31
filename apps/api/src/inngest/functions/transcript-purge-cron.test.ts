import { PgDialect } from 'drizzle-orm/pg-core';

const mockGetStepDatabase = jest.fn();
const mockGetStepRetentionPurgeEnabled = jest.fn();
const mockGetStepVoyageApiKey = jest.fn();
const mockPurgeSessionTranscript = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
    getStepRetentionPurgeEnabled: () => mockGetStepRetentionPurgeEnabled(),
    getStepVoyageApiKey: () => mockGetStepVoyageApiKey(),
  };
});

jest.mock('../../services/transcript-purge', () => {
  const actual = jest.requireActual(
    '../../services/transcript-purge',
  ) as typeof import('../../services/transcript-purge');
  return {
    ...actual,
    purgeSessionTranscript: (...args: unknown[]) =>
      mockPurgeSessionTranscript(...args),
  };
});

jest.mock('../../services/sentry', () => {
  const actual = jest.requireActual(
    '../../services/sentry',
  ) as typeof import('../../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import {
  computeRotatingDelayedOffset,
  transcriptPurgeCron,
  transcriptPurgeHandler,
  transcriptPurgeHandlerOnFailure,
} from './transcript-purge-cron';

describe('transcriptPurgeCron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue({});
    mockGetStepVoyageApiKey.mockReturnValue('voyage-key');
  });

  it('[WI-2739] rotates a bounded remediation page across every stable stale-null row', () => {
    const totalCount = 101;
    const seen = new Set<number>();

    for (let utcDay = 0; utcDay < totalCount; utcDay += 1) {
      const offset = computeRotatingDelayedOffset(
        totalCount,
        utcDay * 86_400_000,
      );
      for (let index = 0; index < 50; index += 1) {
        seen.add((offset + index) % totalCount);
      }
    }

    expect(seen.size).toBe(totalCount);
  });

  it('[WI-2739] wires the rotating offset and wrap page into null-timestamp remediation', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(true);
    jest.useFakeTimers().setSystemTime(new Date('1970-01-03T00:00:00.000Z'));

    const candidate = (index: number) => ({
      sessionSummaryId: `summary-${index}`,
      sessionId: `session-${index}`,
      profileId: `profile-${index}`,
      summaryGeneratedAt: null,
      subjectId: `subject-${index}`,
      topicId: null,
    });
    const offsets: number[] = [];
    const pageBuilder = (rows: ReturnType<typeof candidate>[]) => ({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn((offset: number) => {
                  offsets.push(offset);
                  return Promise.resolve(rows);
                }),
              }),
            }),
          }),
        }),
      }),
    });
    const select = jest
      .fn()
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ totalCount: 101 }]),
          }),
        }),
      })
      .mockReturnValueOnce(pageBuilder([candidate(100)]))
      .mockReturnValueOnce(
        pageBuilder(Array.from({ length: 49 }, (_, index) => candidate(index))),
      );
    mockGetStepDatabase.mockReturnValue({ select });

    try {
      const { step, sendEventCalls } = createInngestStepRunner();
      const handler = (transcriptPurgeCron as any).fn;
      const result = await handler({ step });

      expect(offsets).toEqual([100, 0]);
      expect(result).toEqual(
        expect.objectContaining({
          delayed: 101,
          nullSummaryGeneratedAtCount: 101,
        }),
      );
      const remediation = sendEventCalls.find(
        (call) => call.name === 'fan-out-remediate-null-summary-timestamps',
      );
      expect(remediation?.payload).toHaveLength(50);
      expect(remediation?.payload).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({ sessionId: 'session-100' }),
          }),
          expect.objectContaining({
            data: expect.objectContaining({ sessionId: 'session-0' }),
          }),
        ]),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  // [BUG-189] The 30-day cutoff was previously computed at handler entry, then
  // captured by the find-purge-candidates step closure. On an Inngest replay
  // the function re-enters the handler, the closure rebinds to a freshly
  // computed cutoff, and the step's cached result no longer matches the cutoff
  // currently in scope — a contract drift between memoised step output and
  // ambient inputs. Moving the cutoff INSIDE step.run keeps the cutoff
  // colocated with the cached result so a replay reuses both together.
  it('[BUG-189] computes cutoff INSIDE find-purge-candidates step.run for replay stability', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(true);
    const limit = jest.fn().mockResolvedValue([]);
    const orderBy = jest.fn().mockReturnValue({ limit });
    const where = jest.fn().mockReturnValue({ limit, orderBy });
    const innerJoin = jest.fn().mockReturnValue({ where });
    const from = jest.fn().mockReturnValue({ where, innerJoin });
    const select = jest.fn().mockReturnValue({ from });
    mockGetStepDatabase.mockReturnValue({ select });

    const { step } = createInngestStepRunner({
      runResults: {
        'find-null-timestamp-delayed-candidates': {
          candidates: [],
          totalCount: 0,
        },
      },
    });
    const handler = (transcriptPurgeCron as any).fn;
    await handler({ step });

    // The select chain was invoked (proving the real callback ran), which is
    // only possible when cutoff is computed inside the closure rather than at
    // module/handler entry time. Combined with the replay-stability comment
    // above, this guards the BUG-189 fix from silent regression.
    expect(select).toHaveBeenCalled();
    expect(from).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith(101);
  });

  it('[WI-2739] detects null summaryGeneratedAt rows past the delayed cutoff', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(true);
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T05:00:00.000Z'));
    const nullTimestampWhere = jest.fn().mockResolvedValue([{ totalCount: 0 }]);
    const select = jest
      .fn()
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: nullTimestampWhere,
          }),
        }),
      });
    mockGetStepDatabase.mockReturnValue({ select });

    try {
      const { step } = createInngestStepRunner();
      const handler = (transcriptPurgeCron as any).fn;
      await handler({ step });

      const delayedWhere = nullTimestampWhere.mock.calls[0]?.[0];
      const rendered = new PgDialect().sqlToQuery(delayedWhere as never);

      expect(rendered.sql).toMatch(
        /"session_summaries"\."summary_generated_at" is null/i,
      );
      expect(rendered.sql).toMatch(/"learning_sessions"\."ended_at" <=/i);
      expect(rendered.params).toContain('2026-06-24T05:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('skips entirely while RETENTION_PURGE_ENABLED is false', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(false);

    const { step, sendEventCalls } = createInngestStepRunner();
    const handler = (transcriptPurgeCron as any).fn;
    const result = await handler({ step });

    expect(result).toEqual({ status: 'disabled', queued: 0 });
    expect(sendEventCalls).toHaveLength(0);
  });

  it('queues purge workers and emits delayed alerts for blocked rows', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(true);

    const { step, sendEventCalls } = createInngestStepRunner({
      runResults: {
        'find-purge-candidates': [
          {
            sessionSummaryId: 'summary-1',
            sessionId: 'session-1',
            profileId: 'profile-1',
          },
        ],
        'find-delayed-purge-candidates': [],
        'find-null-timestamp-delayed-candidates': {
          candidates: [
            {
              sessionSummaryId: 'summary-2',
              sessionId: 'session-2',
              profileId: 'profile-2',
              summaryGeneratedAt: null,
              subjectId: 'subject-2',
              topicId: 'topic-2',
            },
          ],
          totalCount: 1,
        },
      },
    });

    const handler = (transcriptPurgeCron as any).fn;
    const result = await handler({ step });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        queued: 1,
        delayed: 1,
      }),
    );
    expect(sendEventCalls).toEqual(
      expect.arrayContaining([
        {
          name: 'fan-out-remediate-null-summary-timestamps',
          payload: expect.arrayContaining([
            expect.objectContaining({
              name: 'app/session.summary.regenerate',
              data: expect.objectContaining({
                sessionSummaryId: 'summary-2',
                sessionId: 'session-2',
                profileId: 'profile-2',
                subjectId: 'subject-2',
                topicId: 'topic-2',
              }),
            }),
          ]),
        },
        {
          name: 'fan-out-transcript-purge',
          payload: expect.arrayContaining([
            expect.objectContaining({ name: 'app/session.transcript.purge' }),
          ]),
        },
        {
          name: 'notify-purge-delayed',
          payload: expect.objectContaining({
            name: 'app/session.purge.delayed',
            data: expect.objectContaining({
              delayedCount: 1,
              sessionIds: ['session-2'],
              missingPreconditionCount: 1,
              nullSummaryGeneratedAtCount: 1,
            }),
          }),
        },
      ]),
    );
  });

  it('[WI-2739] remediates a stale null timestamp independently of a full delayed page', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(true);
    const blockedNonNullRows = Array.from({ length: 50 }, (_, index) => ({
      sessionSummaryId: `blocked-summary-${index}`,
      sessionId: `blocked-session-${index}`,
      profileId: `blocked-profile-${index}`,
      summaryGeneratedAt: new Date('2026-06-01T00:00:00.000Z'),
      subjectId: `blocked-subject-${index}`,
      topicId: null,
    }));
    const staleNullRow = {
      sessionSummaryId: 'stale-null-summary',
      sessionId: 'stale-null-session',
      profileId: 'stale-null-profile',
      summaryGeneratedAt: null,
      subjectId: 'stale-null-subject',
      topicId: null,
    };

    const { step, sendEventCalls } = createInngestStepRunner({
      runResults: {
        'find-purge-candidates': [],
        'find-delayed-purge-candidates': blockedNonNullRows,
        'find-null-timestamp-delayed-candidates': {
          candidates: [staleNullRow],
          totalCount: 1,
        },
      },
    });

    const handler = (transcriptPurgeCron as any).fn;
    const result = await handler({ step });

    expect(result).toEqual(
      expect.objectContaining({ delayed: 51, nullSummaryGeneratedAtCount: 1 }),
    );
    expect(sendEventCalls).toEqual(
      expect.arrayContaining([
        {
          name: 'fan-out-remediate-null-summary-timestamps',
          payload: [
            expect.objectContaining({
              name: 'app/session.summary.regenerate',
              data: expect.objectContaining({
                sessionSummaryId: 'stale-null-summary',
                sessionId: 'stale-null-session',
              }),
            }),
          ],
        },
        {
          name: 'notify-purge-delayed',
          payload: expect.objectContaining({
            name: 'app/session.purge.delayed',
            data: expect.objectContaining({
              delayedCount: 51,
              nullSummaryGeneratedAtCount: 1,
            }),
          }),
        },
      ]),
    );
  });

  it('[WI-2739] queues only daily capacity and emits an alertable over-cap backlog signal', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(true);
    const candidates = Array.from({ length: 101 }, (_, index) => ({
      sessionSummaryId: `summary-${index}`,
      sessionId: `session-${index}`,
      profileId: `profile-${index}`,
    }));

    const { step, sendEventCalls, runNames } = createInngestStepRunner({
      runResults: {
        'find-purge-candidates': candidates,
        'find-delayed-purge-candidates': [],
        'find-null-timestamp-delayed-candidates': {
          candidates: [],
          totalCount: 0,
        },
      },
    });

    const handler = (transcriptPurgeCron as any).fn;
    const result = await handler({ step });

    expect(result).toEqual(
      expect.objectContaining({
        queued: 100,
        backlog: true,
        minimumEligibleCount: 101,
      }),
    );
    const fanOut = sendEventCalls.find(
      (call) => call.name === 'fan-out-transcript-purge',
    );
    expect(fanOut?.payload).toHaveLength(100);
    expect(sendEventCalls).toEqual(
      expect.arrayContaining([
        {
          name: 'notify-purge-backlog',
          payload: expect.objectContaining({
            name: 'app/session.purge.backlog',
            data: expect.objectContaining({
              dailyCapacity: 100,
              minimumEligibleCount: 101,
              minimumDeferredCount: 1,
            }),
          }),
        },
      ]),
    );
    expect(runNames()).toContain('capture-purge-backlog');
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('at least 101 eligible session(s)'),
      }),
      expect.objectContaining({
        tags: { surface: 'transcript-purge', signal: 'backlog' },
        extra: expect.objectContaining({
          surface: 'transcript-purge-backlog',
          dailyCapacity: 100,
          minimumEligibleCount: 101,
          minimumDeferredCount: 1,
        }),
      }),
    );
  });

  it('[WI-2739] does not signal backlog at exact daily capacity', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(true);
    const candidates = Array.from({ length: 100 }, (_, index) => ({
      sessionSummaryId: `summary-${index}`,
      sessionId: `session-${index}`,
      profileId: `profile-${index}`,
    }));

    const { step, sendEventCalls, runNames } = createInngestStepRunner({
      runResults: {
        'find-purge-candidates': candidates,
        'find-delayed-purge-candidates': [],
        'find-null-timestamp-delayed-candidates': {
          candidates: [],
          totalCount: 0,
        },
      },
    });

    const handler = (transcriptPurgeCron as any).fn;
    const result = await handler({ step });

    expect(result).toEqual(
      expect.objectContaining({
        queued: 100,
        backlog: false,
        minimumEligibleCount: 100,
      }),
    );
    expect(runNames()).not.toContain('capture-purge-backlog');
    expect(
      sendEventCalls.find(
        (call) =>
          (call.payload as { name?: string }).name ===
          'app/session.purge.backlog',
      ),
    ).toBeUndefined();
    const backlogCaptures = mockCaptureException.mock.calls.filter(
      (call) =>
        (call[1] as { tags?: { signal?: string } })?.tags?.signal === 'backlog',
    );
    expect(backlogCaptures).toHaveLength(0);
  });

  // [BUG-993] captureException must be called alongside app/session.purge.delayed
  // so the delayed-purge count is surfaced to Sentry in addition to the Inngest
  // dashboard. Tests both branches: when no purge candidates exist (only delayed)
  // and when both candidates and delayed rows are found.

  it('[BUG-993] calls captureException when delayed sessions are found alongside purge candidates', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(true);

    const { step, runNames } = createInngestStepRunner({
      runResults: {
        'find-purge-candidates': [
          {
            sessionSummaryId: 'summary-1',
            sessionId: 'session-1',
            profileId: 'profile-1',
          },
        ],
        'find-delayed-purge-candidates': [
          {
            sessionSummaryId: 'summary-2',
            sessionId: 'session-2',
            profileId: 'profile-2',
          },
        ],
        'find-null-timestamp-delayed-candidates': {
          candidates: [],
          totalCount: 0,
        },
      },
    });

    const handler = (transcriptPurgeCron as any).fn;
    await handler({ step });

    expect(runNames()).toEqual(
      expect.arrayContaining(['capture-delayed-purge-with-candidates']),
    );
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('1 session(s) past day-37'),
      }),
      expect.objectContaining({
        tags: { surface: 'transcript-purge', signal: 'delayed' },
        extra: expect.objectContaining({
          surface: 'transcript-purge-delayed',
          delayedCount: 1,
          sessionIds: ['session-2'],
        }),
      }),
    );
  });

  it('[BUG-993] calls captureException when delayed sessions are found and no purge candidates exist', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(true);

    const { step, sendEventCalls, runNames } = createInngestStepRunner({
      runResults: {
        'find-purge-candidates': [],
        'find-delayed-purge-candidates': [
          {
            sessionSummaryId: 'summary-3',
            sessionId: 'session-3',
            profileId: 'profile-3',
          },
          {
            sessionSummaryId: 'summary-4',
            sessionId: 'session-4',
            profileId: 'profile-4',
          },
        ],
        'find-null-timestamp-delayed-candidates': {
          candidates: [],
          totalCount: 0,
        },
      },
    });

    const handler = (transcriptPurgeCron as any).fn;
    const result = await handler({ step });

    expect(result).toEqual(
      expect.objectContaining({ status: 'completed', queued: 0, delayed: 2 }),
    );
    expect(sendEventCalls).toEqual(
      expect.arrayContaining([
        {
          name: 'notify-purge-delayed',
          payload: expect.objectContaining({
            name: 'app/session.purge.delayed',
          }),
        },
      ]),
    );
    expect(runNames()).toEqual(
      expect.arrayContaining(['capture-delayed-purge-without-candidates']),
    );
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('2 session(s) past day-37'),
      }),
      expect.objectContaining({
        tags: { surface: 'transcript-purge', signal: 'delayed' },
        extra: expect.objectContaining({
          surface: 'transcript-purge-delayed',
          delayedCount: 2,
          sessionIds: expect.arrayContaining(['session-3', 'session-4']),
        }),
      }),
    );
  });

  it('[BUG-993] does NOT call captureException when there are no delayed sessions', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(true);

    const { step } = createInngestStepRunner({
      runResults: {
        'find-purge-candidates': [
          {
            sessionSummaryId: 'summary-1',
            sessionId: 'session-1',
            profileId: 'profile-1',
          },
        ],
        'find-delayed-purge-candidates': [],
        'find-null-timestamp-delayed-candidates': {
          candidates: [],
          totalCount: 0,
        },
      },
    });

    const handler = (transcriptPurgeCron as any).fn;
    await handler({ step });

    // captureException must NOT have been called for the delayed-purge surface
    const delayedCalls = mockCaptureException.mock.calls.filter((call) => {
      const extra = (call[1] as { extra?: { surface?: string } })?.extra;
      return extra?.surface === 'transcript-purge-delayed';
    });
    expect(delayedCalls).toHaveLength(0);
  });
});

describe('transcriptPurgeHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue({});
    mockGetStepRetentionPurgeEnabled.mockReturnValue(true);
    mockGetStepVoyageApiKey.mockReturnValue('voyage-key');
  });

  it('[INNGEST-IDEMPOTENCY] declares idempotency keyed on sessionSummaryId', () => {
    const opts = (transcriptPurgeHandler as any).opts;
    expect(opts.idempotency).toBe('event.data.sessionSummaryId');
  });

  it('emits app/session.transcript.purged on a successful purge', async () => {
    mockPurgeSessionTranscript.mockResolvedValue({
      status: 'purged',
      sessionId: 'session-1',
      sessionSummaryId: 'summary-1',
      eventsDeleted: 3,
      embeddingRowsReplaced: 1,
      purgedAt: new Date('2026-05-05T10:00:00.000Z'),
    });

    const { step, sendEventCalls } = createInngestStepRunner();
    const handler = (transcriptPurgeHandler as any).fn;
    const result = await handler({
      event: {
        data: {
          profileId: '00000000-0000-7000-8000-000000000001',
          sessionSummaryId: '00000000-0000-7000-8000-000000000002',
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'purged',
        sessionId: 'session-1',
      }),
    );
    expect(sendEventCalls).toEqual(
      expect.arrayContaining([
        {
          name: 'notify-transcript-purged',
          payload: expect.objectContaining({
            name: 'app/session.transcript.purged',
            data: expect.objectContaining({
              profileId: '00000000-0000-7000-8000-000000000001',
              sessionId: 'session-1',
              sessionSummaryId: 'summary-1',
              eventsDeleted: 3,
              embeddingRowsReplaced: 1,
            }),
          }),
        },
      ]),
    );
  });

  it('rethrows purge failures so Inngest can retry the worker', async () => {
    mockPurgeSessionTranscript.mockRejectedValueOnce(
      new Error('Voyage unavailable'),
    );

    const { step } = createInngestStepRunner();
    const handler = (transcriptPurgeHandler as any).fn;

    await expect(
      handler({
        event: {
          data: {
            profileId: '00000000-0000-7000-8000-000000000001',
            sessionSummaryId: '00000000-0000-7000-8000-000000000002',
          },
        },
        step,
      }),
    ).rejects.toThrow('Voyage unavailable');

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Voyage unavailable' }),
      expect.objectContaining({
        profileId: '00000000-0000-7000-8000-000000000001',
        extra: expect.objectContaining({
          sessionSummaryId: '00000000-0000-7000-8000-000000000002',
          surface: 'transcript-purge',
        }),
      }),
    );
  });

  it('drops malformed purge payloads before touching transcript data', async () => {
    const { step, runCalls } = createInngestStepRunner();
    const handler = (transcriptPurgeHandler as any).fn;

    const result = await handler({
      event: { data: { sessionSummaryId: 'not-a-uuid' } },
      step,
    });

    expect(result).toEqual({ status: 'invalid_payload' });
    expect(mockPurgeSessionTranscript).not.toHaveBeenCalled();
    expect(runCalls).toHaveLength(0);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Invalid transcript purge payload',
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'transcript-purge',
        }),
      }),
    );
  });
});

describe('transcriptPurgeHandlerOnFailure', () => {
  // [BUG-992] The onFailure handler fires after all retries are exhausted.
  // It must call captureException with meaningful context so Sentry records
  // the terminal failure alongside the Inngest dashboard failure-rate counter.

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('[BUG-992] calls captureException with context when transcript-purge-handler exhausts retries', async () => {
    const handler = (transcriptPurgeHandlerOnFailure as any).fn;

    const result = await handler({
      event: {
        data: {
          function_id: 'transcript-purge-handler',
          run_id: 'run-abc-123',
          error: { name: 'Error', message: 'Voyage API timeout' },
          event: {
            data: {
              profileId: '00000000-0000-7000-8000-000000000001',
              sessionSummaryId: '00000000-0000-7000-8000-000000000002',
            },
          },
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'captured',
        profileId: '00000000-0000-7000-8000-000000000001',
        sessionSummaryId: '00000000-0000-7000-8000-000000000002',
      }),
    );
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('all retries exhausted'),
      }),
      expect.objectContaining({
        tags: { surface: 'transcript-purge', signal: 'function-failed' },
        extra: expect.objectContaining({
          surface: 'transcript-purge-on-failure',
          profileId: '00000000-0000-7000-8000-000000000001',
          sessionSummaryId: '00000000-0000-7000-8000-000000000002',
          runId: 'run-abc-123',
        }),
      }),
    );
  });

  it('[BUG-992] skips non-purge-handler failures without calling captureException', async () => {
    const handler = (transcriptPurgeHandlerOnFailure as any).fn;

    const result = await handler({
      event: {
        data: {
          function_id: 'some-other-function',
          error: { name: 'Error', message: 'unrelated' },
          event: { data: {} },
        },
      },
    });

    expect(result).toEqual({ status: 'skipped' });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
