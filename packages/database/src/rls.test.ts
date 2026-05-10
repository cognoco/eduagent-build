// Unit tests only — these verify call order and error propagation using mocks.
// Integration tests (context propagation, rollback, SET LOCAL guard) live in
// rls.integration.test.ts — Phase 0.3, docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md.

import { withProfileScope } from './rls.js';

// Fixed-format UUIDs for all unit test assertions (withProfileScope validates UUID format).
const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';
const UUID_C = '33333333-3333-3333-3333-333333333333';
const UUID_D = '44444444-4444-4444-4444-444444444444';

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

    const result = await withProfileScope(db, UUID_A, callback);

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

    await withProfileScope(db, UUID_B, async () => {
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
      withProfileScope(db, UUID_C, async () => {
        throw new Error('callback error');
      }),
    ).rejects.toThrow('callback error');
  });

  it('propagates transaction errors', async () => {
    const db = createMockDb();

    (db.transaction as jest.Mock).mockRejectedValue(
      new Error('transaction failed'),
    );

    await expect(
      withProfileScope(db, UUID_D, async () => 'unreachable'),
    ).rejects.toThrow('transaction failed');
  });

  it('rejects non-UUID profileIds', async () => {
    const db = createMockDb();
    await expect(
      withProfileScope(db, 'not-a-uuid', async () => 'unreachable'),
    ).rejects.toThrow('profileId must be a UUID');
  });
});
