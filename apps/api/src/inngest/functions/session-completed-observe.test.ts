// ---------------------------------------------------------------------------
// Session-Completed Observe handlers -- Tests [BUG-369]
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
  sessionSummaryGeneratedObserve,
  sessionSummaryFailedObserve,
  sessionCompletedWithErrorsObserve,
} from './session-completed-observe';
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

describe('sessionSummaryGeneratedObserve [BUG-369]', () => {
  it('is registered as the listener for app/session.summary.generated', () => {
    const trigger = (
      sessionSummaryGeneratedObserve as unknown as { trigger: unknown }
    ).trigger;
    expect(trigger).toEqual({ event: 'app/session.summary.generated' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(sessionSummaryGeneratedObserve);
  });

  it('returns logged status with valid payload', async () => {
    const result = await invoke(sessionSummaryGeneratedObserve, {
      profileId: 'profile-1',
      sessionId: 'session-1',
      sessionSummaryId: 'summary-1',
      topicsCount: 3,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(result).toMatchObject({ status: 'logged', sessionId: 'session-1' });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('[BREAK] emits a structured info log', async () => {
    await invoke(sessionSummaryGeneratedObserve, {
      profileId: 'profile-2',
      sessionId: 'session-2',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const entry = lastJsonLine(consoleLogSpy);
    expect(entry?.message).toBe('session.summary.generated.received');
    expect(entry?.level).toBe('info');
    expect(entry?.context).toMatchObject({ sessionId: 'session-2' });
  });

  it('[BREAK] returns schema_error on invalid payload', async () => {
    const result = await invoke(sessionSummaryGeneratedObserve, {
      profileId: 123,
      sessionId: null,
    } as unknown as Record<string, unknown>);
    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('session.summary.generated.schema_drift');
    expect(entry?.level).toBe('error');
  });

  it('[BREAK / BUG-369] captures schema drift to Sentry exactly once', async () => {
    await invoke(sessionSummaryGeneratedObserve, {
      profileId: 123,
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

describe('sessionSummaryFailedObserve [BUG-369]', () => {
  it('is registered as the listener for app/session.summary.failed', () => {
    const trigger = (
      sessionSummaryFailedObserve as unknown as { trigger: unknown }
    ).trigger;
    expect(trigger).toEqual({ event: 'app/session.summary.failed' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(sessionSummaryFailedObserve);
  });

  it('returns logged status with valid payload', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000003';
    const result = await invoke(sessionSummaryFailedObserve, {
      profileId: '00000000-0000-4000-8000-000000000023',
      sessionId,
      sessionSummaryId: null,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(result).toMatchObject({ status: 'logged', sessionId });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('[BREAK] emits a structured warn log', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000004';
    await invoke(sessionSummaryFailedObserve, {
      profileId: '00000000-0000-4000-8000-000000000024',
      sessionId,
      sessionSummaryId: null,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const entry = lastJsonLine(consoleWarnSpy);
    expect(entry?.message).toBe('session.summary.failed.received');
    expect(entry?.level).toBe('warn');
    expect(entry?.context).toMatchObject({ sessionId });
  });

  it('[BREAK] returns schema_error on invalid payload', async () => {
    const result = await invoke(sessionSummaryFailedObserve, {
      profileId: 999,
      sessionId: false,
    } as unknown as Record<string, unknown>);
    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('session.summary.failed.schema_drift');
    expect(entry?.level).toBe('error');
  });

  it('[BREAK / BUG-369] captures schema drift to Sentry exactly once', async () => {
    await invoke(sessionSummaryFailedObserve, {
      profileId: 999,
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

describe('sessionCompletedWithErrorsObserve [BUG-369]', () => {
  it('is registered as the listener for app/session.completed_with_errors', () => {
    const trigger = (
      sessionCompletedWithErrorsObserve as unknown as { trigger: unknown }
    ).trigger;
    expect(trigger).toEqual({ event: 'app/session.completed_with_errors' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(sessionCompletedWithErrorsObserve);
  });

  it('returns logged status with failedStepCount', async () => {
    const result = await invoke(sessionCompletedWithErrorsObserve, {
      sessionId: 'session-5',
      profileId: 'profile-5',
      failedSteps: [{ step: 'emit-summary', error: 'timeout' }],
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(result).toMatchObject({ status: 'logged', failedStepCount: 1 });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('[BREAK] emits a structured warn log with failedStepCount', async () => {
    await invoke(sessionCompletedWithErrorsObserve, {
      sessionId: 'session-6',
      profileId: 'profile-6',
      failedSteps: [
        { step: 'emit-summary', error: 'timeout' },
        { step: 'emit-analytics', error: null },
      ],
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const entry = lastJsonLine(consoleWarnSpy);
    expect(entry?.message).toBe('session.completed_with_errors.received');
    expect(entry?.level).toBe('warn');
    expect(entry?.context).toMatchObject({ failedStepCount: 2 });
  });

  it('[BREAK] returns schema_error on invalid payload', async () => {
    const result = await invoke(sessionCompletedWithErrorsObserve, {
      sessionId: 456,
      failedSteps: 'not-an-array',
    } as unknown as Record<string, unknown>);
    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('session.completed_with_errors.schema_drift');
    expect(entry?.level).toBe('error');
  });

  it('[BREAK / BUG-369] captures schema drift to Sentry exactly once', async () => {
    await invoke(sessionCompletedWithErrorsObserve, {
      sessionId: 456,
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

// ---------------------------------------------------------------------------
// [F-018 / WI-579] Schema-drift paths must not leak the raw event payload —
// logs and Sentry extras carry a shape-only summary, never event.data.
// ---------------------------------------------------------------------------

describe('[F-018 / WI-579] schema-drift paths leak no raw payload', () => {
  const SENTINEL = 'Tommy-private-transcript-text';

  it.each([
    ['sessionSummaryGeneratedObserve', sessionSummaryGeneratedObserve],
    ['sessionSummaryFailedObserve', sessionSummaryFailedObserve],
    ['sessionCompletedWithErrorsObserve', sessionCompletedWithErrorsObserve],
  ] as const)(
    '[BREAK] %s: drift log + Sentry extras carry shape only',
    async (_name, handler) => {
      const result = await invoke(handler, {
        profileId: 123, // type drift — fails every handler schema
        transcript: SENTINEL,
        childName: SENTINEL,
      } as unknown as Record<string, unknown>);
      expect(result).toEqual({ status: 'schema_error' });

      // No console channel may carry the payload content.
      const allConsole = JSON.stringify([
        consoleLogSpy.mock.calls,
        consoleWarnSpy.mock.calls,
        consoleErrorSpy.mock.calls,
      ]);
      expect(allConsole).not.toContain(SENTINEL);

      // The drift log carries the shape-only summary.
      const entry = lastJsonLine(consoleErrorSpy);
      expect(entry?.context).toMatchObject({
        rawData: { payloadType: 'object', fieldCount: 3 },
      });

      // Sentry extras: summarized shape, no payload content.
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({
            rawData: { payloadType: 'object', fieldCount: 3 },
          }),
        }),
      );
      expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain(
        SENTINEL,
      );
    },
  );
});
