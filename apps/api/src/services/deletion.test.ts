import type { Database } from '@eduagent/database';
import {
  scheduleDeletion,
  cancelDeletion,
  isDeletionCancelled,
  executeDeletion,
  getProfileIdsForAccount,
} from './deletion';

function createMockDb({
  findFirstResult = undefined as Record<string, unknown> | undefined,
  profilesResult = [] as Array<{ id: string }>,
} = {}): Database {
  return {
    query: {
      accounts: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
      profiles: {
        findMany: jest.fn().mockResolvedValue(profilesResult),
      },
    },
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  } as unknown as Database;
}

describe('scheduleDeletion', () => {
  it('returns a grace period end date 7 days in the future', async () => {
    const db = createMockDb();
    const before = Date.now();
    const result = await scheduleDeletion(db, 'account-1');
    const after = Date.now();

    const gracePeriodEnd = new Date(result.gracePeriodEnds).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(gracePeriodEnd).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(gracePeriodEnd).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });

  it('returns a valid ISO 8601 date string', async () => {
    const db = createMockDb();
    const result = await scheduleDeletion(db, 'account-1');
    expect(() => new Date(result.gracePeriodEnds)).not.toThrow();
    expect(new Date(result.gracePeriodEnds).toISOString()).toBe(
      result.gracePeriodEnds
    );
  });

  it('calls db.update to set deletionScheduledAt', async () => {
    const db = createMockDb();
    await scheduleDeletion(db, 'account-1');
    expect(db.update).toHaveBeenCalled();
  });
});

describe('cancelDeletion', () => {
  it('resolves without error', async () => {
    const db = createMockDb();
    await expect(cancelDeletion(db, 'account-1')).resolves.toBeUndefined();
  });

  it('calls db.update to set deletionCancelledAt', async () => {
    const db = createMockDb();
    await cancelDeletion(db, 'account-1');
    expect(db.update).toHaveBeenCalled();
  });
});

describe('isDeletionCancelled', () => {
  it('returns false when account not found', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await isDeletionCancelled(db, 'account-1');
    expect(result).toBe(false);
  });

  it('returns false when no deletion scheduled', async () => {
    const db = createMockDb({
      findFirstResult: {
        deletionScheduledAt: null,
        deletionCancelledAt: null,
      },
    });
    const result = await isDeletionCancelled(db, 'account-1');
    expect(result).toBe(false);
  });

  it('returns true when cancelled after scheduled', async () => {
    const db = createMockDb({
      findFirstResult: {
        deletionScheduledAt: new Date('2025-01-10T00:00:00Z'),
        deletionCancelledAt: new Date('2025-01-12T00:00:00Z'),
      },
    });
    const result = await isDeletionCancelled(db, 'account-1');
    expect(result).toBe(true);
  });

  it('returns false when scheduled after cancelled', async () => {
    const db = createMockDb({
      findFirstResult: {
        deletionScheduledAt: new Date('2025-01-12T00:00:00Z'),
        deletionCancelledAt: new Date('2025-01-10T00:00:00Z'),
      },
    });
    const result = await isDeletionCancelled(db, 'account-1');
    expect(result).toBe(false);
  });
});

describe('getProfileIdsForAccount', () => {
  it('returns profile IDs for the given account', async () => {
    const db = createMockDb({
      profilesResult: [{ id: 'profile-1' }, { id: 'profile-2' }],
    });
    const result = await getProfileIdsForAccount(db, 'account-1');
    expect(result).toEqual(['profile-1', 'profile-2']);
  });

  it('returns empty array when account has no profiles', async () => {
    const db = createMockDb({ profilesResult: [] });
    const result = await getProfileIdsForAccount(db, 'account-1');
    expect(result).toEqual([]);
  });
});

describe('executeDeletion', () => {
  it('resolves without error (idempotent)', async () => {
    const db = createMockDb();
    await expect(executeDeletion(db, 'account-1')).resolves.toBeUndefined();
  });

  it('calls db.delete', async () => {
    const db = createMockDb();
    await executeDeletion(db, 'account-1');
    expect(db.delete).toHaveBeenCalled();
  });
});
