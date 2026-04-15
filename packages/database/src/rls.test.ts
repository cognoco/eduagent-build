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
