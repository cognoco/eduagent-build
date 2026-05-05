const mockGetStepDatabase = jest.fn();
const mockGetStepRetentionPurgeEnabled = jest.fn();
const mockGetStepVoyageApiKey = jest.fn();
const mockPurgeSessionTranscript = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('../helpers', () => ({
  getStepDatabase: () => mockGetStepDatabase(),
  getStepRetentionPurgeEnabled: () => mockGetStepRetentionPurgeEnabled(),
  getStepVoyageApiKey: () => mockGetStepVoyageApiKey(),
}));

jest.mock('../../services/transcript-purge', () => ({
  purgeSessionTranscript: (...args: unknown[]) =>
    mockPurgeSessionTranscript(...args),
}));

jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import {
  transcriptPurgeCron,
  transcriptPurgeHandler,
} from './transcript-purge-cron';

function createStep(overrides: Record<string, unknown> = {}) {
  return {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      if (name in overrides) {
        return overrides[name];
      }
      return fn();
    }),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
}

describe('transcriptPurgeCron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue({});
    mockGetStepVoyageApiKey.mockReturnValue('voyage-key');
  });

  it('skips entirely while RETENTION_PURGE_ENABLED is false', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(false);

    const step = createStep();
    const handler = (transcriptPurgeCron as any).fn;
    const result = await handler({ step });

    expect(result).toEqual({ status: 'disabled', queued: 0 });
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it('queues purge workers and emits delayed alerts for blocked rows', async () => {
    mockGetStepRetentionPurgeEnabled.mockReturnValue(true);

    const step = createStep({
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
    });

    const handler = (transcriptPurgeCron as any).fn;
    const result = await handler({ step });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        queued: 1,
        delayed: 1,
      })
    );
    expect(step.sendEvent).toHaveBeenCalledWith(
      'fan-out-transcript-purge',
      expect.arrayContaining([
        expect.objectContaining({ name: 'app/session.transcript.purge' }),
      ])
    );
    expect(step.sendEvent).toHaveBeenCalledWith(
      'notify-purge-delayed',
      expect.objectContaining({
        name: 'app/session.purge.delayed',
        data: expect.objectContaining({
          delayedCount: 1,
          sessionIds: ['session-2'],
          missingPreconditionCount: 1,
        }),
      })
    );
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

    const step = createStep();
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
      })
    );
    expect(step.sendEvent).toHaveBeenCalledWith(
      'notify-transcript-purged',
      expect.objectContaining({
        name: 'app/session.transcript.purged',
        data: expect.objectContaining({
          profileId: '00000000-0000-7000-8000-000000000001',
          sessionId: 'session-1',
          sessionSummaryId: 'summary-1',
          eventsDeleted: 3,
          embeddingRowsReplaced: 1,
        }),
      })
    );
  });

  it('rethrows purge failures so Inngest can retry the worker', async () => {
    mockPurgeSessionTranscript.mockRejectedValueOnce(
      new Error('Voyage unavailable')
    );

    const step = createStep();
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
      })
    ).rejects.toThrow('Voyage unavailable');

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Voyage unavailable' }),
      expect.objectContaining({
        profileId: '00000000-0000-7000-8000-000000000001',
        extra: expect.objectContaining({
          sessionSummaryId: '00000000-0000-7000-8000-000000000002',
          surface: 'transcript-purge',
        }),
      })
    );
  });

  it('drops malformed purge payloads before touching transcript data', async () => {
    const step = createStep();
    const handler = (transcriptPurgeHandler as any).fn;

    const result = await handler({
      event: { data: { sessionSummaryId: 'not-a-uuid' } },
      step,
    });

    expect(result).toEqual({ status: 'invalid_payload' });
    expect(mockPurgeSessionTranscript).not.toHaveBeenCalled();
    expect(step.run).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Invalid transcript purge payload',
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'transcript-purge',
        }),
      })
    );
  });
});
