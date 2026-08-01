import { terminalDeletionFailureOutbox } from '@eduagent/database';
import {
  deleteTerminalDeletionFailure,
  persistTerminalDeletionFailure,
} from './terminal-deletion-failure-outbox';

describe('terminal deletion failure outbox', () => {
  it('upserts by deterministic signal id so concurrent recovery paths converge', async () => {
    const onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({ onConflictDoNothing });
    const insert = jest.fn().mockReturnValue({ values });
    const db = { insert } as any;
    const record = {
      signalId:
        'deletion-terminal-failure:scheduled-account-deletion:run-durable-1',
      eventName: 'app/account.deletion_teardown.failed' as const,
      accountId: 'account-durable-1',
      runId: 'run-durable-1',
      errorName: 'Error' as const,
      occurredAt: new Date('2026-08-01T10:00:00.000Z'),
    };

    await persistTerminalDeletionFailure(db, record);
    await persistTerminalDeletionFailure(db, record);

    expect(insert).toHaveBeenNthCalledWith(1, terminalDeletionFailureOutbox);
    expect(insert).toHaveBeenNthCalledWith(2, terminalDeletionFailureOutbox);
    expect(values).toHaveBeenNthCalledWith(1, record);
    expect(values).toHaveBeenNthCalledWith(2, record);
    expect(onConflictDoNothing).toHaveBeenNthCalledWith(1, {
      target: terminalDeletionFailureOutbox.signalId,
    });
    expect(onConflictDoNothing).toHaveBeenNthCalledWith(2, {
      target: terminalDeletionFailureOutbox.signalId,
    });
  });

  it('acknowledges only the deterministic signal id requested by the caller', async () => {
    const where = jest.fn().mockResolvedValue(undefined);
    const deleteFrom = jest.fn().mockReturnValue({ where });
    const db = { delete: deleteFrom } as any;

    await deleteTerminalDeletionFailure(db, 'signal-confirmed-1');

    expect(deleteFrom).toHaveBeenCalledWith(terminalDeletionFailureOutbox);
    expect(where).toHaveBeenCalledTimes(1);
    expect(where.mock.calls[0]?.[0]).toBeDefined();
  });
});
