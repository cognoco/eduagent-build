// ---------------------------------------------------------------------------
// Transcript-Purge Observe handlers -- Tests [BUG-369]
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
jest.mock(
  '../../services/sentry' /* gc1-allow: observer test asserts captureException escalation on schema drift */,
  () => {
    const actual = jest.requireActual(
      '../../services/sentry',
    ) as typeof import('../../services/sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

const consoleLogSpy = jest
  .spyOn(console, 'log')
  .mockImplementation(() => undefined);
const consoleWarnSpy = jest
  .spyOn(console, 'warn')
  .mockImplementation(() => undefined);
const consoleErrorSpy = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

jest.mock(
  '../client' /* gc1-allow: observer test requires inngest client mock to expose trigger metadata */,
  () => ({
    inngest: {
      createFunction: jest.fn(
        (_opts: unknown, _trigger: unknown, fn: unknown) => {
          return Object.assign(fn as object, {
            opts: _opts,
            trigger: _trigger,
            fn,
          });
        },
      ),
    },
  }),
);

import {
  sessionPurgeDelayedObserve,
  sessionTranscriptPurgedObserve,
  sessionTranscriptPurgeSkippedObserve,
} from './transcript-purge-observe';
import { functions } from '../index';

beforeEach(() => {
  consoleLogSpy.mockClear();
  consoleWarnSpy.mockClear();
  consoleErrorSpy.mockClear();
  mockCaptureException.mockClear();
});

afterAll(() => {
  consoleLogSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

async function invoke<T extends Record<string, unknown>>(
  handler: unknown,
  data: T,
) {
  const fn = ((handler as { fn?: unknown }).fn ?? handler) as (args: {
    event: { data: T };
  }) => Promise<unknown>;
  return fn({ event: { data } });
}

function lastJsonLine(spy: jest.SpyInstance): Record<string, unknown> | null {
  const last = spy.mock.calls.at(-1)?.[0];
  if (typeof last !== 'string') return null;
  try {
    return JSON.parse(last) as Record<string, unknown>;
  } catch {
    return null;
  }
}

describe('sessionPurgeDelayedObserve [BUG-369]', () => {
  it('is registered as the listener for app/session.purge.delayed', () => {
    const trigger = (
      sessionPurgeDelayedObserve as unknown as { trigger: unknown }
    ).trigger;
    expect(trigger).toEqual({ event: 'app/session.purge.delayed' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(sessionPurgeDelayedObserve);
  });

  it('returns logged status with delayedCount', async () => {
    const result = await invoke(sessionPurgeDelayedObserve, {
      delayedCount: 5,
      sessionIds: ['s1', 's2', 's3', 's4', 's5'],
      missingPreconditionCount: 2,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(result).toMatchObject({ status: 'logged', delayedCount: 5 });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('[BREAK] emits a structured warn log with delayed count', async () => {
    await invoke(sessionPurgeDelayedObserve, {
      delayedCount: 3,
      sessionIds: ['s1', 's2', 's3'],
      missingPreconditionCount: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const entry = lastJsonLine(consoleWarnSpy);
    expect(entry?.message).toBe('session.purge.delayed.received');
    expect(entry?.level).toBe('warn');
    expect(entry?.context).toMatchObject({ delayedCount: 3 });
  });

  it('[BREAK] returns schema_error on invalid payload', async () => {
    const result = await invoke(sessionPurgeDelayedObserve, {
      delayedCount: 'five',
      sessionIds: 'not-array',
    } as unknown as Record<string, unknown>);
    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('session.purge.delayed.schema_drift');
    expect(entry?.level).toBe('error');
  });

  it('[BREAK / BUG-369] captures schema drift to Sentry exactly once', async () => {
    await invoke(sessionPurgeDelayedObserve, {
      delayedCount: 'five',
    } as unknown as Record<string, unknown>);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('invalid event payload'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({ issues: expect.any(Array) }),
      }),
    );
  });
});

describe('sessionTranscriptPurgedObserve [BUG-369]', () => {
  it('is registered as the listener for app/session.transcript.purged', () => {
    const trigger = (
      sessionTranscriptPurgedObserve as unknown as { trigger: unknown }
    ).trigger;
    expect(trigger).toEqual({ event: 'app/session.transcript.purged' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(sessionTranscriptPurgedObserve);
  });

  it('returns logged status with eventsDeleted', async () => {
    const result = await invoke(sessionTranscriptPurgedObserve, {
      profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      sessionId: 'session-p',
      sessionSummaryId: 'summary-p',
      eventsDeleted: 42,
      embeddingRowsReplaced: 10,
    });
    expect(result).toMatchObject({ status: 'logged', eventsDeleted: 42 });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('[BREAK] emits a structured info log (SLO success signal)', async () => {
    await invoke(sessionTranscriptPurgedObserve, {
      profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      sessionId: 'session-q',
      sessionSummaryId: null,
      eventsDeleted: 15,
      embeddingRowsReplaced: 3,
    });
    const entry = lastJsonLine(consoleLogSpy);
    expect(entry?.message).toBe('session.transcript.purged.received');
    expect(entry?.level).toBe('info');
    expect(entry?.context).toMatchObject({ eventsDeleted: 15 });
  });

  it('[BREAK] returns schema_error on invalid payload', async () => {
    const result = await invoke(sessionTranscriptPurgedObserve, {
      profileId: 'not-a-uuid',
      eventsDeleted: 'lots',
    } as unknown as Record<string, unknown>);
    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('session.transcript.purged.schema_drift');
    expect(entry?.level).toBe('error');
  });

  it('[BREAK / BUG-369] captures schema drift to Sentry exactly once', async () => {
    await invoke(sessionTranscriptPurgedObserve, {
      profileId: 'not-a-uuid',
    } as unknown as Record<string, unknown>);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('invalid event payload'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({ issues: expect.any(Array) }),
      }),
    );
  });
});

describe('sessionTranscriptPurgeSkippedObserve [BUG-369]', () => {
  it('is registered as the listener for app/session.transcript.purge.skipped', () => {
    const trigger = (
      sessionTranscriptPurgeSkippedObserve as unknown as { trigger: unknown }
    ).trigger;
    expect(trigger).toEqual({ event: 'app/session.transcript.purge.skipped' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(sessionTranscriptPurgeSkippedObserve);
  });

  it('returns logged status with reason', async () => {
    const result = await invoke(sessionTranscriptPurgeSkippedObserve, {
      profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      sessionId: 'session-r',
      reason: 'missing_summary',
    });
    expect(result).toMatchObject({
      status: 'logged',
      reason: 'missing_summary',
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('[BREAK] emits a structured warn log for skipped purge', async () => {
    await invoke(sessionTranscriptPurgeSkippedObserve, {
      profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      sessionId: 'session-s',
      reason: 'missing_recap',
    });
    const entry = lastJsonLine(consoleWarnSpy);
    expect(entry?.message).toBe('session.transcript.purge.skipped.received');
    expect(entry?.level).toBe('warn');
    expect(entry?.context).toMatchObject({ reason: 'missing_recap' });
  });

  it('[BREAK] returns schema_error on invalid payload', async () => {
    const result = await invoke(sessionTranscriptPurgeSkippedObserve, {
      profileId: 12345,
      reason: null,
    } as unknown as Record<string, unknown>);
    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe(
      'session.transcript.purge.skipped.schema_drift',
    );
    expect(entry?.level).toBe('error');
  });

  it('[BREAK / BUG-369] captures schema drift to Sentry exactly once', async () => {
    await invoke(sessionTranscriptPurgeSkippedObserve, {
      profileId: 12345,
    } as unknown as Record<string, unknown>);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('invalid event payload'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({ issues: expect.any(Array) }),
      }),
    );
  });
});
