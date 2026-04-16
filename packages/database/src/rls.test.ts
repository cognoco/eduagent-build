// Unit tests only — these verify call order and error propagation using mocks.
//
// DEFERRED: Integration test against a real Postgres database that verifies:
//   1. current_setting('app.current_profile_id') returns the expected value inside the transaction
//   2. The setting is NULL / reverted after commit or rollback
//   3. SET LOCAL does not leak across connections
//
// This requires switching from neon-http (stateless HTTP) to neon-ws or node-postgres
// for the test database connection, since neon-http doesn't support real transactions.
// Tracked as RLS Phase 0.0 prerequisite in docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md.

import { withProfileScope } from './rls.js';

function createMockDb() {
  return {
    transaction: jest.fn(),
  } as unknown as Parameters<typeof withProfileScope>[0];
}

describe('withProfileScope', () => {
  it('calls db.transaction with a callback', async () => {
    const db = createMockDb();
    const callback = jest.fn().mockResolvedValue('result');

    (db.transaction as jest.Mock).mockImplementation(async (fn) => {
      const tx = {
        execute: jest.fn().mockResolvedValue(undefined),
      };
      return fn(tx);
    });

    const result = await withProfileScope(db, 'profile-123', callback);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  it('executes SET LOCAL before the callback', async () => {
    const db = createMockDb();
    const callOrder: string[] = [];

    (db.transaction as jest.Mock).mockImplementation(async (fn) => {
      const tx = {
        execute: jest.fn().mockImplementation(async () => {
          callOrder.push('SET LOCAL');
        }),
      };
      return fn(tx);
    });

    await withProfileScope(db, 'profile-456', async () => {
      callOrder.push('callback');
      return 'done';
    });

    expect(callOrder).toEqual(['SET LOCAL', 'callback']);
  });

  it('propagates errors from the callback', async () => {
    const db = createMockDb();

    (db.transaction as jest.Mock).mockImplementation(async (fn) => {
      const tx = { execute: jest.fn().mockResolvedValue(undefined) };
      return fn(tx);
    });

    await expect(
      withProfileScope(db, 'profile-789', async () => {
        throw new Error('callback error');
      })
    ).rejects.toThrow('callback error');
  });

  it('propagates transaction errors', async () => {
    const db = createMockDb();

    (db.transaction as jest.Mock).mockRejectedValue(
      new Error('transaction failed')
    );

    await expect(
      withProfileScope(db, 'profile-000', async () => 'unreachable')
    ).rejects.toThrow('transaction failed');
  });
});
