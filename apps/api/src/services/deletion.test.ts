import type { Database } from '@eduagent/database';
import {
  scheduleDeletion,
  cancelDeletion,
  getDeletionStatus,
  isDeletionCancelled,
  executeDeletion,
  getProfileIdsForAccount,
  deleteProfileIfNoConsent,
} from './deletion';

function createMockDb(
  options: {
    findFirstResult?: Record<string, unknown>;
    profilesResult?: Array<{ id: string }>;
    updateReturning?: Array<{ deletionScheduledAt: Date | null }>;
    updateReturningSequence?: Array<
      Array<{ deletionScheduledAt: Date | null }>
    >;
  } = {},
): Database {
  const findFirstResult = Object.prototype.hasOwnProperty.call(
    options,
    'findFirstResult',
  )
    ? options.findFirstResult
    : {
        deletionScheduledAt: null,
        deletionCancelledAt: null,
      };
  const profilesResult = options.profilesResult ?? [];
  const updateReturning = options.updateReturning ?? [
    { deletionScheduledAt: new Date() },
  ];
  const updateReturningMock = jest.fn();
  for (const returning of options.updateReturningSequence ?? [
    updateReturning,
  ]) {
    updateReturningMock.mockResolvedValueOnce(returning);
  }
  updateReturningMock.mockResolvedValue(updateReturning);
  const updateWhereMock = jest.fn().mockReturnValue({
    returning: updateReturningMock,
  });
  const updateSetMock = jest.fn().mockReturnValue({
    where: updateWhereMock,
  });

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
      set: updateSetMock,
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
      result.gracePeriodEnds,
    );
  });

  it('calls db.update to set deletionScheduledAt', async () => {
    const db = createMockDb();
    await scheduleDeletion(db, 'account-1');
    expect(db.update).toHaveBeenCalled();
  });

  it('throws and does not claim scheduled when the account is missing', async () => {
    const db = createMockDb({
      findFirstResult: undefined,
      updateReturning: [],
    });

    await expect(scheduleDeletion(db, 'missing-account')).rejects.toThrow(
      'account not found: missing-account',
    );
    expect(db.update).toHaveBeenCalled();
  });

  it('does not move the deadline when deletion is already scheduled', async () => {
    const db = createMockDb({
      findFirstResult: {
        deletionScheduledAt: new Date('2026-02-17T00:00:00.000Z'),
        deletionCancelledAt: null,
      },
      updateReturning: [],
    });

    const result = await scheduleDeletion(db, 'account-1');

    expect(result).toEqual({
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
      scheduledNow: false,
    });
    expect(db.update).toHaveBeenCalled();
  });

  it('retries once when a concurrent cancel wins the fallback read', async () => {
    const db = createMockDb({
      findFirstResult: {
        deletionScheduledAt: new Date('2026-02-17T00:00:00.000Z'),
        deletionCancelledAt: new Date('2026-02-18T00:00:00.000Z'),
      },
      updateReturningSequence: [
        [],
        [{ deletionScheduledAt: new Date('2026-02-19T00:00:00.000Z') }],
      ],
    });

    const result = await scheduleDeletion(db, 'account-1');

    expect(result).toEqual({
      gracePeriodEnds: '2026-02-26T00:00:00.000Z',
      scheduledNow: true,
    });
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it('does not reschedule when cancellation timestamp equals scheduled timestamp', async () => {
    const db = createMockDb({
      findFirstResult: {
        deletionScheduledAt: new Date('2026-02-17T00:00:00.000Z'),
        deletionCancelledAt: new Date('2026-02-17T00:00:00.000Z'),
      },
      updateReturning: [],
    });

    const result = await scheduleDeletion(db, 'account-1');

    expect(result).toEqual({
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
      scheduledNow: false,
    });
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

  it('returns false when cancellation timestamp equals scheduled timestamp', async () => {
    const db = createMockDb({
      findFirstResult: {
        deletionScheduledAt: new Date('2025-01-10T00:00:00Z'),
        deletionCancelledAt: new Date('2025-01-10T00:00:00Z'),
      },
    });
    const result = await isDeletionCancelled(db, 'account-1');
    expect(result).toBe(false);
  });
});

describe('getDeletionStatus', () => {
  it('returns unscheduled when no deletion is pending', async () => {
    const db = createMockDb({
      findFirstResult: {
        deletionScheduledAt: null,
        deletionCancelledAt: null,
      },
    });

    const result = await getDeletionStatus(db, 'account-1');

    expect(result).toEqual({
      scheduled: false,
      deletionScheduledAt: null,
      gracePeriodEnds: null,
    });
  });

  it('returns scheduled status with derived grace period end', async () => {
    const db = createMockDb({
      findFirstResult: {
        deletionScheduledAt: new Date('2026-02-17T00:00:00.000Z'),
        deletionCancelledAt: null,
      },
    });

    const result = await getDeletionStatus(db, 'account-1');

    expect(result).toEqual({
      scheduled: true,
      deletionScheduledAt: '2026-02-17T00:00:00.000Z',
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
    });
  });

  it('returns scheduled when cancellation timestamp equals scheduled timestamp', async () => {
    const db = createMockDb({
      findFirstResult: {
        deletionScheduledAt: new Date('2026-02-17T00:00:00.000Z'),
        deletionCancelledAt: new Date('2026-02-17T00:00:00.000Z'),
      },
    });

    const result = await getDeletionStatus(db, 'account-1');

    expect(result).toEqual({
      scheduled: true,
      deletionScheduledAt: '2026-02-17T00:00:00.000Z',
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
    });
  });

  it('returns unscheduled when deletion was cancelled after scheduling', async () => {
    const db = createMockDb({
      findFirstResult: {
        deletionScheduledAt: new Date('2026-02-17T00:00:00.000Z'),
        deletionCancelledAt: new Date('2026-02-18T00:00:00.000Z'),
      },
    });

    const result = await getDeletionStatus(db, 'account-1');

    expect(result).toEqual({
      scheduled: false,
      deletionScheduledAt: null,
      gracePeriodEnds: null,
    });
  });

  it('throws when the account is missing', async () => {
    const db = createMockDb({ findFirstResult: undefined });

    await expect(getDeletionStatus(db, 'missing-account')).rejects.toThrow(
      'account not found: missing-account',
    );
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

describe('deleteProfileIfNoConsent (CI-11)', () => {
  it('returns true when profile was deleted (rowCount > 0)', async () => {
    const db = {
      ...createMockDb(),
      execute: jest.fn().mockResolvedValue({ rowCount: 1 }),
    } as unknown as Database;

    const result = await deleteProfileIfNoConsent(db, 'profile-1');
    expect(result).toBe(true);
    expect(db.execute).toHaveBeenCalled();
  });

  it('returns false when profile was retained (consent exists, rowCount 0)', async () => {
    const db = {
      ...createMockDb(),
      execute: jest.fn().mockResolvedValue({ rowCount: 0 }),
    } as unknown as Database;

    const result = await deleteProfileIfNoConsent(db, 'profile-1');
    expect(result).toBe(false);
  });

  it('returns false when profile was already deleted (rowCount 0)', async () => {
    const db = {
      ...createMockDb(),
      execute: jest.fn().mockResolvedValue({ rowCount: 0 }),
    } as unknown as Database;

    const result = await deleteProfileIfNoConsent(db, 'nonexistent-profile');
    expect(result).toBe(false);
  });

  it('handles undefined rowCount gracefully', async () => {
    const db = {
      ...createMockDb(),
      execute: jest.fn().mockResolvedValue({}),
    } as unknown as Database;

    const result = await deleteProfileIfNoConsent(db, 'profile-1');
    expect(result).toBe(false);
  });
});
