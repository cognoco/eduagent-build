const mockGetStepDatabase = jest.fn();
const mockGetStepRetentionPurgeEnabled = jest.fn();
const mockGetStepVoyageApiKey = jest.fn();
const mockPurgeSessionTranscript = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../helpers'),
  getStepDatabase: () => mockGetStepDatabase(),
  getStepRetentionPurgeEnabled: () => mockGetStepRetentionPurgeEnabled(),
  getStepVoyageApiKey: () => mockGetStepVoyageApiKey(),
}));

jest.mock(
  '../../services/transcript-purge' /* gc1-allow: pattern-a conversion */,
  () => ({
    ...jest.requireActual('../../services/transcript-purge'),
    purgeSessionTranscript: (...args: unknown[]) =>
      mockPurgeSessionTranscript(...args),
  }),
);

jest.mock(
  '../../services/sentry' /* gc1-allow: pattern-a conversion */,
  () => ({
    ...jest.requireActual('../../services/sentry'),
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import {
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
        'find-delayed-purge-candidates': [
          {
            sessionSummaryId: 'summary-2',
            sessionId: 'session-2',
            profileId: 'profile-2',
          },
        ],
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
            }),
          }),
        },
      ]),
    );
  });

  // [BUG-993] captureException must be called alongside app/session.purge.delayed
  // so the delayed-purge count is surfaced to Sentry in addition to the Inngest
  // dashboard. Tests both branches: when no purge candidates exist (only delayed)
  // and when both candidates and delayed rows are found.

  it('[BUG-993] calls captureException when delayed sessions are found alongside purge candidates', async () => {
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
        'find-delayed-purge-candidates': [
          {
            sessionSummaryId: 'summary-2',
            sessionId: 'session-2',
            profileId: 'profile-2',
          },
        ],
      },
    });

    const handler = (transcriptPurgeCron as any).fn;
    await handler({ step });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('1 session(s) past day-37'),
      }),
      expect.objectContaining({
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

    const { step, sendEventCalls } = createInngestStepRunner({
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
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('2 session(s) past day-37'),
      }),
      expect.objectContaining({
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
