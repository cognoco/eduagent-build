// ---------------------------------------------------------------------------
// Filing Observe handlers -- Tests [BUG-369]
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();
jest.mock(
  '../../services/sentry' /* gc1-allow: observer test asserts captureException escalation on schema drift */,
  () => {
    const actual = jest.requireActual(
      '../../services/sentry',
    ) as typeof import('../../services/sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
      captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
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
  sessionFilingResolvedObserve,
  filingAutoRetryAttemptedObserve,
} from './filing-observe';
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

describe('sessionFilingResolvedObserve [BUG-369]', () => {
  it('is registered as the listener for app/session.filing_resolved', () => {
    const trigger = (
      sessionFilingResolvedObserve as unknown as { trigger: unknown }
    ).trigger;
    expect(trigger).toEqual({ event: 'app/session.filing_resolved' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(sessionFilingResolvedObserve);
  });

  it('returns logged status for late_completion', async () => {
    const result = await invoke(sessionFilingResolvedObserve, {
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      profileId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      resolution: 'late_completion',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(result).toMatchObject({
      status: 'logged',
      resolution: 'late_completion',
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('[BREAK] emits info-level log for non-unrecoverable resolution', async () => {
    await invoke(sessionFilingResolvedObserve, {
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      profileId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      resolution: 'retry_succeeded',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const entry = lastJsonLine(consoleLogSpy);
    expect(entry?.message).toBe('session.filing_resolved.received');
    expect(entry?.level).toBe('info');
    expect(entry?.context).toMatchObject({ resolution: 'retry_succeeded' });
  });

  it('[BREAK] emits error-level log for unrecoverable resolution', async () => {
    await invoke(sessionFilingResolvedObserve, {
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      profileId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      resolution: 'unrecoverable',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('session.filing_resolved.received');
    expect(entry?.level).toBe('error');
    expect(entry?.context).toMatchObject({ resolution: 'unrecoverable' });
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'session.filing_resolved',
      expect.objectContaining({
        level: 'error',
        tags: {
          surface: 'filing',
          signal: 'resolved',
          resolution: 'unrecoverable',
        },
      }),
    );
  });

  it('[BREAK] returns schema_error on invalid payload', async () => {
    const result = await invoke(sessionFilingResolvedObserve, {
      sessionId: 'not-a-uuid',
      profileId: 'not-a-uuid',
      resolution: 'invalid_resolution',
    } as unknown as Record<string, unknown>);
    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('session.filing_resolved.schema_drift');
    expect(entry?.level).toBe('error');
  });

  it('[BREAK / BUG-369] captures schema drift to Sentry exactly once', async () => {
    await invoke(sessionFilingResolvedObserve, {
      sessionId: 'bad',
      resolution: 'invalid_resolution',
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

describe('filingAutoRetryAttemptedObserve [BUG-369]', () => {
  it('is registered as the listener for app/filing.auto_retry_attempted', () => {
    const trigger = (
      filingAutoRetryAttemptedObserve as unknown as { trigger: unknown }
    ).trigger;
    expect(trigger).toEqual({ event: 'app/filing.auto_retry_attempted' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(filingAutoRetryAttemptedObserve);
  });

  it('returns logged status with attempt number', async () => {
    const result = await invoke(filingAutoRetryAttemptedObserve, {
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      profileId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      attemptNumber: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(result).toMatchObject({ status: 'logged', attemptNumber: 1 });
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'filing.auto_retry_attempted',
      expect.objectContaining({
        level: 'warning',
        tags: { surface: 'filing', signal: 'auto-retry-attempted' },
      }),
    );
  });

  it('[BREAK] emits a structured warn log for auto-retry', async () => {
    await invoke(filingAutoRetryAttemptedObserve, {
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      profileId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      attemptNumber: 2,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const entry = lastJsonLine(consoleWarnSpy);
    expect(entry?.message).toBe('filing.auto_retry_attempted.received');
    expect(entry?.level).toBe('warn');
    expect(entry?.context).toMatchObject({ attemptNumber: 2 });
  });

  it('[BREAK] returns schema_error on invalid payload', async () => {
    const result = await invoke(filingAutoRetryAttemptedObserve, {
      sessionId: 'not-a-uuid',
      profileId: 'not-a-uuid',
      attemptNumber: -1,
    } as unknown as Record<string, unknown>);
    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('filing.auto_retry_attempted.schema_drift');
    expect(entry?.level).toBe('error');
  });

  it('[BREAK / BUG-369] captures schema drift to Sentry exactly once', async () => {
    await invoke(filingAutoRetryAttemptedObserve, {
      sessionId: 'not-a-uuid',
      attemptNumber: -1,
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
