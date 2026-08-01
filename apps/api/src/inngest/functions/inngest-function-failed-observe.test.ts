jest.mock(/* gc1-allow: observer boundary */ '../client', () => ({
  inngest: {
    createFunction: jest.fn((opts: unknown, trigger: unknown, fn: unknown) =>
      Object.assign(fn as object, { opts, trigger, fn }),
    ),
  },
}));

const mockDb = { query: {} };
const persistTerminalDeletionFailureSpy = jest.fn();
const deleteTerminalDeletionFailureSpy = jest.fn();

jest.mock(
  '../helpers' /* gc1-allow: inject observer outbox DB without Neon */,
  () => ({ getStepDatabase: () => mockDb }),
);

jest.mock(
  '../../services/terminal-deletion-failure-outbox' /* gc1-allow: assert durable recovery without a real database */,
  () => ({
    persistTerminalDeletionFailure: (...args: unknown[]) =>
      persistTerminalDeletionFailureSpy(...args),
    deleteTerminalDeletionFailure: (...args: unknown[]) =>
      deleteTerminalDeletionFailureSpy(...args),
  }),
);

import * as sentryService from '../../services/sentry';
import { inngestFunctionFailedObserve } from './inngest-function-failed-observe';

const captureExceptionSpy = jest
  .spyOn(sentryService, 'captureException')
  .mockImplementation(() => undefined);
const sendEventSpy = jest.fn().mockResolvedValue(undefined);
const runSpy = jest.fn(
  async (_name: string, callback: () => Promise<unknown>) => callback(),
);

async function invoke(
  data: unknown,
  ts = Date.parse('2026-08-01T10:00:00.000Z'),
) {
  const handler = (inngestFunctionFailedObserve as any).fn as (args: {
    event: { data: unknown; ts: number };
    step: { sendEvent: typeof sendEventSpy; run: typeof runSpy };
  }) => Promise<unknown>;
  return handler({
    event: { data, ts },
    step: { sendEvent: sendEventSpy, run: runSpy },
  });
}

describe('inngestFunctionFailedObserve', () => {
  beforeEach(() => {
    captureExceptionSpy.mockClear();
    sendEventSpy.mockClear();
    runSpy.mockClear();
    persistTerminalDeletionFailureSpy.mockReset().mockResolvedValue(undefined);
    deleteTerminalDeletionFailureSpy.mockReset().mockResolvedValue(undefined);
  });

  afterAll(() => captureExceptionSpy.mockRestore());

  it('listens for every terminal Inngest function failure', () => {
    expect((inngestFunctionFailedObserve as any).trigger).toEqual({
      event: 'inngest/function.failed',
    });
  });

  it('retries when the durable replay transport rejects', async () => {
    expect((inngestFunctionFailedObserve as any).opts.retries).toBe(5);

    sendEventSpy.mockRejectedValueOnce(new Error('transport unavailable'));
    await expect(
      invoke({
        function_id: 'scheduled-account-deletion',
        run_id: 'run-reject-1',
        error: { name: 'Error' },
        event: { data: { accountId: 'account-reject-1' } },
      }),
    ).rejects.toThrow('transport unavailable');
    expect(persistTerminalDeletionFailureSpy).toHaveBeenCalledTimes(1);
    expect(deleteTerminalDeletionFailureSpy).not.toHaveBeenCalled();
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

  it('durably replays an account-deletion terminal signal from the platform failure record', async () => {
    await expect(
      invoke({
        function_id: 'scheduled-account-deletion',
        run_id: 'run-delete-1',
        error: { name: 'TimeoutError' },
        event: { data: { accountId: 'account-delete-1' } },
      }),
    ).resolves.toEqual({
      status: 'replayed',
      functionId: 'scheduled-account-deletion',
    });

    expect(sendEventSpy).toHaveBeenCalledWith(
      'replay-terminal-deletion-failure',
      {
        id: 'deletion-terminal-failure:scheduled-account-deletion:run-delete-1',
        name: 'app/account.deletion_teardown.failed',
        data: {
          accountId: 'account-delete-1',
          runId: 'run-delete-1',
          errorName: 'TimeoutError',
          timestamp: '2026-08-01T10:00:00.000Z',
        },
      },
    );
    expect(persistTerminalDeletionFailureSpy).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        signalId:
          'deletion-terminal-failure:scheduled-account-deletion:run-delete-1',
      }),
    );
    expect(deleteTerminalDeletionFailureSpy).toHaveBeenCalledWith(
      mockDb,
      'deletion-terminal-failure:scheduled-account-deletion:run-delete-1',
    );
  });

  it('[WI-2994] replays the same recovery twice without creating two remediation identities', async () => {
    const failure = {
      function_id: 'scheduled-account-deletion',
      run_id: 'run-replay-duplicate',
      error: { name: 'Error' },
      event: { data: { accountId: 'account-replay-duplicate' } },
    };

    await invoke(failure);
    await invoke(failure);

    const replayedIds = sendEventSpy.mock.calls.map(([, event]) => event.id);
    expect(replayedIds).toEqual([
      'deletion-terminal-failure:scheduled-account-deletion:run-replay-duplicate',
      'deletion-terminal-failure:scheduled-account-deletion:run-replay-duplicate',
    ]);
    expect(new Set(replayedIds).size).toBe(1);
  });

  it('durably replays a subscription-store terminal signal from the platform failure record', async () => {
    await expect(
      invoke({
        function_id: 'billing-subscription-store-teardown',
        run_id: 'run-store-1',
        error: { name: 'TypeError' },
        event: { data: { accountId: 'account-store-1' } },
      }),
    ).resolves.toEqual({
      status: 'replayed',
      functionId: 'billing-subscription-store-teardown',
    });

    expect(sendEventSpy).toHaveBeenCalledWith(
      'replay-terminal-deletion-failure',
      {
        id: 'deletion-terminal-failure:billing-subscription-store-teardown:run-store-1',
        name: 'app/billing.subscription_store_teardown.failed',
        data: {
          accountId: 'account-store-1',
          runId: 'run-store-1',
          errorName: 'TypeError',
          timestamp: '2026-08-01T10:00:00.000Z',
        },
      },
    );
  });

  it('bounds an unrecognized platform error name to the same Error class as the original handler', async () => {
    await invoke({
      function_id: 'scheduled-account-deletion',
      run_id: 'run-private-error-name',
      error: { name: 'payer alice@example.test private provider response' },
      event: { data: { accountId: 'account-private-error-name' } },
    });

    expect(sendEventSpy).toHaveBeenCalledWith(
      'replay-terminal-deletion-failure',
      expect.objectContaining({
        data: expect.objectContaining({ errorName: 'Error' }),
      }),
    );
    expect(JSON.stringify(sendEventSpy.mock.calls)).not.toContain(
      'alice@example.test',
    );
    expect(JSON.stringify(sendEventSpy.mock.calls)).not.toContain(
      'private provider response',
    );
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
});
