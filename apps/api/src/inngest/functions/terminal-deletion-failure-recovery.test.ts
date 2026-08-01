jest.mock(/* gc1-allow: function wiring boundary */ '../client', () => ({
  inngest: {
    createFunction: jest.fn((opts: unknown, trigger: unknown, fn: unknown) =>
      Object.assign(fn as object, { opts, trigger, fn }),
    ),
  },
}));

const mockDb = { query: {} };
const listTerminalDeletionFailuresSpy = jest.fn();
const deleteTerminalDeletionFailuresSpy = jest.fn();

jest.mock(
  '../helpers' /* gc1-allow: inject recovery DB without Neon */,
  () => ({ getStepDatabase: () => mockDb }),
);

jest.mock(
  '../../services/terminal-deletion-failure-outbox' /* gc1-allow: assert recovery orchestration without a real database */,
  () => ({
    listTerminalDeletionFailures: (...args: unknown[]) =>
      listTerminalDeletionFailuresSpy(...args),
    deleteTerminalDeletionFailures: (...args: unknown[]) =>
      deleteTerminalDeletionFailuresSpy(...args),
  }),
);

import { terminalDeletionFailureRecovery } from './terminal-deletion-failure-recovery';

const row = {
  signalId:
    'deletion-terminal-failure:scheduled-account-deletion:run-stranded-1',
  eventName: 'app/account.deletion_teardown.failed' as const,
  accountId: 'account-stranded-1',
  runId: 'run-stranded-1',
  errorName: 'TimeoutError',
  occurredAt: new Date('2026-08-01T10:00:00.000Z'),
};

function createStep(sendEvent = jest.fn().mockResolvedValue(undefined)) {
  return {
    sendEvent,
    run: jest.fn(async (_name: string, callback: () => Promise<unknown>) =>
      callback(),
    ),
  };
}

describe('terminalDeletionFailureRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listTerminalDeletionFailuresSpy.mockResolvedValue([row]);
    deleteTerminalDeletionFailuresSpy.mockResolvedValue(undefined);
  });

  it('periodically scans the repository-owned durable outbox', () => {
    expect((terminalDeletionFailureRecovery as any).trigger).toEqual({
      cron: '*/5 * * * *',
    });
    expect((terminalDeletionFailureRecovery as any).opts.retries).toBe(5);
  });

  it('replays the stored PII-minimized event with its deterministic id, then acknowledges it', async () => {
    const step = createStep();
    const handler = (terminalDeletionFailureRecovery as any).fn;

    await expect(handler({ step })).resolves.toEqual({ replayed: 1 });

    expect(listTerminalDeletionFailuresSpy).toHaveBeenCalledWith(mockDb, 100);
    expect(step.sendEvent).toHaveBeenCalledWith(
      'replay-terminal-deletion-failures',
      [
        {
          id: row.signalId,
          name: row.eventName,
          data: {
            accountId: row.accountId,
            runId: row.runId,
            errorName: row.errorName,
            timestamp: row.occurredAt.toISOString(),
          },
        },
      ],
    );
    expect(deleteTerminalDeletionFailuresSpy).toHaveBeenCalledWith(mockDb, [
      row.signalId,
    ]);
  });

  it('keeps the durable row when replay transport rejects', async () => {
    const sendEvent = jest
      .fn()
      .mockRejectedValue(new Error('recovery transport unavailable'));
    const step = createStep(sendEvent);
    const handler = (terminalDeletionFailureRecovery as any).fn;

    await expect(handler({ step })).rejects.toThrow(
      'recovery transport unavailable',
    );
    expect(deleteTerminalDeletionFailuresSpy).not.toHaveBeenCalled();
  });
});
