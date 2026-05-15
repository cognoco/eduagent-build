// ---------------------------------------------------------------------------
// Trial Expiry Failure Observe handler — Tests (BUG-843 / F-SVC-011)
// ---------------------------------------------------------------------------

const consoleErrorSpy = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return {
    ...actual,
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
  };
});

import { trialExpiryFailureObserve } from './trial-expiry-failure-observe';

beforeEach(() => {
  consoleErrorSpy.mockClear();
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

interface FailureEventData {
  step: 'process-expired-trials' | 'process-extended-trial-expiry';
  trialId: string;
  reason: string;
  timestamp: string;
}

async function invokeHandler(data: FailureEventData) {
  const handler = ((trialExpiryFailureObserve as any).fn ??
    trialExpiryFailureObserve) as (args: {
    event: { data: FailureEventData };
  }) => Promise<unknown>;
  return handler({ event: { data } });
}

describe('trialExpiryFailureObserve (BUG-843 / F-SVC-011)', () => {
  it('is registered as the listener for app/billing.trial_expiry_failed', () => {
    const trigger = (trialExpiryFailureObserve as any).trigger;
    expect(trigger).toEqual({ event: 'app/billing.trial_expiry_failed' });
  });

  it('returns logged status with trial metadata and retry-deferred marker', async () => {
    const result = await invokeHandler({
      step: 'process-expired-trials',
      trialId: 'sub-1',
      reason: 'DB constraint violation',
      timestamp: '2026-04-27T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'logged',
      step: 'process-expired-trials',
      trialId: 'sub-1',
      retryDeferred: 'pending_trial_expiry_retry_strategy',
    });
  });

  it('[BREAK] emits an error-level structured log with the full failure context (observability guarantee)', async () => {
    await invokeHandler({
      step: 'process-extended-trial-expiry',
      trialId: 'sub-2',
      reason: 'Connection timeout',
      timestamp: '2026-04-27T00:00:00.000Z',
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    const lastCall = consoleErrorSpy.mock.calls.at(-1)?.[0];
    expect(typeof lastCall).toBe('string');
    const entry = JSON.parse(lastCall as string) as {
      message: string;
      level: string;
      context?: Record<string, unknown>;
    };
    expect(entry.message).toBe('billing.trial_expiry_failed.received');
    expect(entry.level).toBe('error');
    expect(entry.context).toMatchObject({
      step: 'process-extended-trial-expiry',
      trialId: 'sub-2',
      reason: 'Connection timeout',
      eventTimestamp: '2026-04-27T00:00:00.000Z',
    });
  });
});
