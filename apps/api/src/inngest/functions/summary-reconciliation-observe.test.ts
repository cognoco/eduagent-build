// ---------------------------------------------------------------------------
// Summary-Reconciliation Observe handlers -- Tests [BUG-369]
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
  summaryReconciliationScannedObserve,
  summaryReconciliationRequeuedObserve,
} from './summary-reconciliation-observe';
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

describe('summaryReconciliationScannedObserve [BUG-369]', () => {
  it('is registered as the listener for app/summary.reconciliation.scanned', () => {
    const trigger = (
      summaryReconciliationScannedObserve as unknown as { trigger: unknown }
    ).trigger;
    expect(trigger).toEqual({ event: 'app/summary.reconciliation.scanned' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(summaryReconciliationScannedObserve);
  });

  it('returns logged status with totalScanned', async () => {
    const result = await invoke(summaryReconciliationScannedObserve, {
      queryACount: 5,
      queryBCount: 3,
      queryCCount: 2,
      totalScanned: 10,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(result).toMatchObject({ status: 'logged', totalScanned: 10 });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('[BREAK] emits a structured info log with scan counts', async () => {
    await invoke(summaryReconciliationScannedObserve, {
      queryACount: 4,
      queryBCount: 1,
      queryCCount: 0,
      totalScanned: 5,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const entry = lastJsonLine(consoleLogSpy);
    expect(entry?.message).toBe('summary.reconciliation.scanned.received');
    expect(entry?.level).toBe('info');
    expect(entry?.context).toMatchObject({ totalScanned: 5 });
  });

  it('[BREAK] returns schema_error on invalid payload', async () => {
    const result = await invoke(summaryReconciliationScannedObserve, {
      queryACount: 'five',
      totalScanned: null,
    } as unknown as Record<string, unknown>);
    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('summary.reconciliation.scanned.schema_drift');
    expect(entry?.level).toBe('error');
  });

  it('[BREAK / BUG-369] captures schema drift to Sentry exactly once', async () => {
    await invoke(summaryReconciliationScannedObserve, {
      queryACount: 'five',
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

describe('summaryReconciliationRequeuedObserve [BUG-369]', () => {
  it('is registered as the listener for app/summary.reconciliation.requeued', () => {
    const trigger = (
      summaryReconciliationRequeuedObserve as unknown as { trigger: unknown }
    ).trigger;
    expect(trigger).toEqual({ event: 'app/summary.reconciliation.requeued' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(summaryReconciliationRequeuedObserve);
  });

  it('returns logged status with totalRequeued', async () => {
    const result = await invoke(summaryReconciliationRequeuedObserve, {
      queryARequeued: 2,
      queryBRequeued: 1,
      queryCRequeued: 0,
      totalRequeued: 3,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(result).toMatchObject({ status: 'logged', totalRequeued: 3 });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('[BREAK] emits a structured warn log for SLO requeue', async () => {
    await invoke(summaryReconciliationRequeuedObserve, {
      queryARequeued: 1,
      queryBRequeued: 0,
      queryCRequeued: 2,
      totalRequeued: 3,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const entry = lastJsonLine(consoleWarnSpy);
    expect(entry?.message).toBe('summary.reconciliation.requeued.received');
    expect(entry?.level).toBe('warn');
    expect(entry?.context).toMatchObject({ totalRequeued: 3 });
  });

  it('[BREAK] returns schema_error on invalid payload', async () => {
    const result = await invoke(summaryReconciliationRequeuedObserve, {
      queryARequeued: 'many',
      totalRequeued: -5,
    } as unknown as Record<string, unknown>);
    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('summary.reconciliation.requeued.schema_drift');
    expect(entry?.level).toBe('error');
  });

  it('[BREAK / BUG-369] captures schema drift to Sentry exactly once', async () => {
    await invoke(summaryReconciliationRequeuedObserve, {
      queryARequeued: 'many',
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
