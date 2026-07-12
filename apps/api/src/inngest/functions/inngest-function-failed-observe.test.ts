jest.mock(/* gc1-allow: observer boundary */ '../client', () => ({
  inngest: {
    createFunction: jest.fn((opts: unknown, trigger: unknown, fn: unknown) =>
      Object.assign(fn as object, { opts, trigger, fn }),
    ),
  },
}));

import * as sentryService from '../../services/sentry';
import { inngestFunctionFailedObserve } from './inngest-function-failed-observe';

const captureExceptionSpy = jest
  .spyOn(sentryService, 'captureException')
  .mockImplementation(() => undefined);

async function invoke(data: unknown) {
  const handler = (inngestFunctionFailedObserve as any).fn as (args: {
    event: { data: unknown };
  }) => Promise<unknown>;
  return handler({ event: { data } });
}

describe('inngestFunctionFailedObserve', () => {
  beforeEach(() => captureExceptionSpy.mockClear());

  afterAll(() => captureExceptionSpy.mockRestore());

  it('listens for every terminal Inngest function failure', () => {
    expect((inngestFunctionFailedObserve as any).trigger).toEqual({
      event: 'inngest/function.failed',
    });
  });

  it('captures a non-self failure with stable fleet tags and bounded extras', async () => {
    await expect(
      invoke({
        function_id: 'daily-reminder-scan',
        run_id: 'run-safe-123',
        error: {
          name: 'DatabaseError',
          message: 'Private Learner payerPersonId=payer-secret',
        },
        event: {
          data: {
            transcript: 'Private Learner answer',
            payerPersonId: 'payer-secret',
          },
        },
      }),
    ).resolves.toEqual({
      status: 'captured',
      functionId: 'daily-reminder-scan',
    });

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    const [error, context] = captureExceptionSpy.mock.calls[0]!;
    expect(error).toEqual(new Error('Inngest function failed after retries'));
    expect(context).toEqual({
      tags: {
        surface: 'inngest-fleet',
        signal: 'function-failed',
        functionId: 'daily-reminder-scan',
      },
      extra: {
        runId: 'run-safe-123',
        errorName: 'DatabaseError',
      },
    });
    expect(JSON.stringify([error, context])).not.toContain('Private Learner');
    expect(JSON.stringify([error, context])).not.toContain('payer-secret');
  });

  it('skips only its own failure to prevent an observer loop', async () => {
    await expect(
      invoke({
        function_id: 'inngest-function-failed-observe',
        run_id: 'self-run',
      }),
    ).resolves.toEqual({ status: 'skipped', reason: 'self_failure' });
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('still captures malformed failures under an unknown function tag', async () => {
    await expect(invoke({ unexpected: true })).resolves.toEqual({
      status: 'captured',
      functionId: 'unknown',
    });
    expect(captureExceptionSpy).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ functionId: 'unknown' }),
      }),
    );
  });

  it('is registered in the Inngest serve function list', () => {
    jest.isolateModules(() => {
      const { functions } = require('../index') as {
        functions: Array<{ opts?: { id?: string } }>;
      };
      expect(functions.map((fn) => fn.opts?.id)).toContain(
        'inngest-function-failed-observe',
      );
    });
  });

  function getFleetFailureProbe() {
    const { functions } = require('../index') as {
      functions: Array<{
        opts?: { id?: string; retries?: number };
        trigger?: unknown;
        fn?: (args: { event: { data: unknown } }) => Promise<unknown>;
      }>;
    };
    return functions.find(
      (fn) => fn.opts?.id === 'synthetic-fleet-failure-probe',
    );
  }

  it('registers a retries-zero fleet-failure probe', () => {
    const probe = getFleetFailureProbe();

    expect(probe).toBeDefined();
    expect(probe?.opts).toEqual(
      expect.objectContaining({
        id: 'synthetic-fleet-failure-probe',
        retries: 0,
      }),
    );
    expect(probe?.trigger).toEqual({
      event: 'app/ops.synthetic_fleet_failure_probe_requested',
    });
  });

  it('fails only for the exact PII-free probe payload', async () => {
    const probe = getFleetFailureProbe();

    await expect(
      probe?.fn?.({ event: { data: { probeId: 'wi-1907' } } }),
    ).rejects.toThrow('Synthetic fleet failure probe (WI-1907)');
    await expect(
      probe?.fn?.({
        event: {
          data: {
            probeId: 'wi-1907',
            learnerText: 'must never reach a failing run',
          },
        },
      }),
    ).resolves.toEqual({ status: 'ignored', reason: 'invalid_payload' });
  });
});
