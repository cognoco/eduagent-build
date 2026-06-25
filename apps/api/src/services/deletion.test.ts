import type { Database } from '@eduagent/database';
import { ConflictError, NotFoundError } from '../errors';
import { captureException } from './sentry';
import {
  scheduleDeletion,
  cancelDeletion,
  getDeletionStatus,
  isDeletionCancelled,
  executeDeletion,
  getProfileIdsForAccount,
  deleteProfileIfConsentWithdrawn,
  deleteProfileIfNoConsent,
} from './deletion';

jest.mock('./sentry', () => ({ captureException: jest.fn() })); // gc1-allow: Sentry is an external telemetry boundary.

function extractSqlTextAndValues(
  node: unknown,
  visited = new WeakSet<object>(),
): string[] {
  if (node === null || node === undefined) return [];
  if (node instanceof Date) return [node.toISOString().toLowerCase()];
  if (typeof node !== 'object') return [String(node).toLowerCase()];
  if (visited.has(node as object)) return [];
  visited.add(node as object);

  const values: string[] = [];
  const obj = node as Record<string, unknown>;
  if (typeof obj['name'] === 'string') {
    values.push(obj['name'].toLowerCase());
  }
  if (
    'value' in obj &&
    (typeof obj['value'] === 'string' ||
      typeof obj['value'] === 'number' ||
      obj['value'] instanceof Date)
  ) {
    const value = obj['value'];
    values.push(
      value instanceof Date
        ? value.toISOString().toLowerCase()
        : String(value).toLowerCase(),
    );
  }
  if (Array.isArray(obj['value'])) {
    for (const item of obj['value']) {
      values.push(...extractSqlTextAndValues(item, visited));
    }
  }
  for (const key of ['queryChunks', 'left', 'right', 'conditions']) {
    const child = obj[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        values.push(...extractSqlTextAndValues(item, visited));
      }
    } else {
      values.push(...extractSqlTextAndValues(child, visited));
    }
  }
  return values;
}

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

  const db = {
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
    // [Fix Bug #494] executeDeletion now calls .delete().where().returning()
    // and then (when 0 rows) re-reads via query.accounts.findFirst.
    // [WI-1060] The account delete RETURNING now includes `email` (the byok
    // erasure inside the transaction reads deleted[0].email). The second
    // delete (byok_waitlist) reuses the same chainable mock.
    // Default: 1 row returned (happy path — account deleted).
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest
          .fn()
          .mockResolvedValue([{ id: 'account-1', email: 'owner@example.com' }]),
      }),
    }),
  } as unknown as Database & { transaction: unknown };

  // [WI-1060] executeDeletion now wraps the account + byok deletes in
  // db.transaction(); run the callback with the same mock db as the tx so the
  // existing delete/query stubs resolve unchanged.
  (db as unknown as { transaction: unknown }).transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(db),
    );

  return db as unknown as Database;
}

describe('scheduleDeletion', () => {
  beforeEach(() => {
    (captureException as jest.Mock).mockClear();
  });

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

  // [CR-2026-05-21-100] Break test — NotFoundError from getDeletionStatus must NOT
  // bubble up as a raw 404 to a user who just requested account deletion.
  //
  // Scenario: tryScheduleDeletion UPDATE returns 0 rows (concurrent write won the
  // race), then getDeletionStatus finds the account already gone. Before the fix
  // the NotFoundError propagated to the caller → user sees "404 Not Found".
  // After the fix the error is caught and a success-shaped response is returned.
  //
  // Red→green: Remove the try/catch in scheduleDeletion and the test fails with
  // NotFoundError; restore the catch and it passes.
  it('[CR-2026-05-21-100] returns success-shaped response when account disappears between update and status read', async () => {
    const db = createMockDb({
      findFirstResult: undefined, // getDeletionStatus → NotFoundError
      updateReturning: [], // tryScheduleDeletion → 0 rows (missed the update)
    });

    const before = Date.now();
    const result = await scheduleDeletion(db, 'missing-account');
    const after = Date.now();

    // Must resolve (not reject) with a valid grace-period ISO string.
    expect(result.scheduledNow).toBe(false);
    const end = new Date(result.gracePeriodEnds).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(end).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(end).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
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

  it('throws a typed conflict and escalates when retry exhaustion leaves the account unscheduled', async () => {
    const db = createMockDb({
      findFirstResult: {
        deletionScheduledAt: new Date('2026-02-17T00:00:00.000Z'),
        deletionCancelledAt: new Date('2026-02-18T00:00:00.000Z'),
      },
      updateReturningSequence: [[], []],
    });

    await expect(scheduleDeletion(db, 'account-1')).rejects.toBeInstanceOf(
      ConflictError,
    );

    expect(db.update).toHaveBeenCalledTimes(2);
    expect(captureException).toHaveBeenCalledWith(expect.any(ConflictError), {
      extra: {
        surface: 'account.deletion',
        reason: 'schedule-retry-exhausted',
        accountId: 'account-1',
      },
    });
  });
});

describe('cancelDeletion', () => {
  it('returns "cancelled" when a deletion was active and the row was updated', async () => {
    // Default mock returns one row → active deletion found and cancelled.
    const db = createMockDb({
      updateReturning: [{ deletionScheduledAt: new Date() }],
    });
    const result = await cancelDeletion(db, 'account-1');
    expect(result).toBe('cancelled');
  });

  it('calls db.update to set deletionCancelledAt', async () => {
    const db = createMockDb();
    await cancelDeletion(db, 'account-1');
    expect(db.update).toHaveBeenCalled();
  });

  // [BUG-412] Break test: no active scheduled deletion → DB update matches 0
  // rows → must return 'no_active_deletion', NOT silently succeed.
  // Before the fix, the unconditional WHERE only checked account ID, so the
  // route always returned 200 "Deletion cancelled" regardless of actual state.
  it('[BUG-412] returns "no_active_deletion" when no active deletion exists (0 rows updated)', async () => {
    const db = createMockDb({ updateReturning: [] }); // 0 rows → nothing to cancel
    const result = await cancelDeletion(db, 'account-1');
    expect(result).toBe('no_active_deletion');
  });

  // [BUG-412] The row must NOT be mutated when 'no_active_deletion' is returned.
  // This tests that the WHERE predicate scoping is correct — if the update is
  // called at all, it must use a conditional predicate (not a bare account ID).
  it('[BUG-412] does not mutate a row when returning "no_active_deletion"', async () => {
    const db = createMockDb({ updateReturning: [] });
    await cancelDeletion(db, 'account-1');
    // update was called but the predicate returned 0 matching rows —
    // the WHERE clause is correct (tested by the empty returning[] mock).
    expect(db.update).toHaveBeenCalledTimes(1);
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

    await expect(
      getDeletionStatus(db, 'missing-account'),
    ).rejects.toBeInstanceOf(NotFoundError);
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
  it('returns "deleted" when account row is atomically removed (happy path)', async () => {
    // Default mock: delete().where().returning() → [{ id: 'account-1' }] (1 row).
    const db = createMockDb();
    await expect(executeDeletion(db, 'account-1')).resolves.toBe('deleted');
  });

  it('calls db.delete with the account id', async () => {
    const db = createMockDb();
    await executeDeletion(db, 'account-1');
    expect(db.delete).toHaveBeenCalled();
  });

  it('returns "cancelled" when atomic guard fires (0 rows deleted, row still exists)', async () => {
    // Inline db mock — extend createMockDb with deleteReturning override if this pattern repeats.
    // Simulate: WHERE guard excluded the row (cancelled) — 0 rows returned.
    // findFirst then returns the existing row → 'cancelled'.
    const db = {
      query: {
        accounts: {
          findFirst: jest.fn().mockResolvedValue({ id: 'account-1' }),
        },
        profiles: { findMany: jest.fn().mockResolvedValue([]) },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest
              .fn()
              .mockResolvedValue([{ deletionScheduledAt: new Date() }]),
          }),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]), // 0 rows
        }),
      }),
      // [WI-1060] executeDeletion wraps the deletes in db.transaction().
      transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(db),
        ),
    } as unknown as Database;

    await expect(executeDeletion(db, 'account-1')).resolves.toBe('cancelled');
  });

  it('returns "already_deleted" when atomic guard fires (0 rows deleted, row missing)', async () => {
    // Inline db mock — extend createMockDb with deleteReturning override if this pattern repeats.
    // Simulate: WHERE guard excluded the row and the account is already gone.
    const db = {
      query: {
        accounts: {
          findFirst: jest.fn().mockResolvedValue(undefined), // row missing
        },
        profiles: { findMany: jest.fn().mockResolvedValue([]) },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest
              .fn()
              .mockResolvedValue([{ deletionScheduledAt: new Date() }]),
          }),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]), // 0 rows
        }),
      }),
      // [WI-1060] executeDeletion wraps the deletes in db.transaction().
      transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(db),
        ),
    } as unknown as Database;

    await expect(executeDeletion(db, 'account-1')).resolves.toBe(
      'already_deleted',
    );
  });

  // [CR-2026-05-21-009] Break test: when the account row is missing at execute
  // time (0 rows deleted AND no existing row), Sentry must be notified.
  // This is an unexpected state — account removed outside the normal grace-period
  // flow (admin delete, concurrent GC, double-fire).
  //
  // Red→green: Remove the captureException call in executeDeletion and this
  // test fails; restore it and it passes.
  it('[CR-2026-05-21-009] captures Sentry exception when account is missing at execute time', async () => {
    (captureException as jest.Mock).mockClear();

    const db = {
      query: {
        accounts: {
          findFirst: jest.fn().mockResolvedValue(undefined), // row missing
        },
        profiles: { findMany: jest.fn().mockResolvedValue([]) },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest
              .fn()
              .mockResolvedValue([{ deletionScheduledAt: new Date() }]),
          }),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]), // 0 rows deleted
        }),
      }),
      // [WI-1060] executeDeletion wraps the deletes in db.transaction().
      transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(db),
        ),
    } as unknown as Database;

    const result = await executeDeletion(db, 'account-1');

    expect(result).toBe('already_deleted');
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'account.deletion',
          reason: 'row-missing-on-execute',
          accountId: 'account-1',
        }),
      }),
    );
  });

  it('[CR-2026-05-21-009] does NOT capture Sentry when deletion is cancelled (row exists)', async () => {
    (captureException as jest.Mock).mockClear();

    const db = {
      query: {
        accounts: {
          findFirst: jest.fn().mockResolvedValue({ id: 'account-1' }), // row present → cancelled
        },
        profiles: { findMany: jest.fn().mockResolvedValue([]) },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest
              .fn()
              .mockResolvedValue([{ deletionScheduledAt: new Date() }]),
          }),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]), // 0 rows deleted
        }),
      }),
      // [WI-1060] executeDeletion wraps the deletes in db.transaction().
      transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(db),
        ),
    } as unknown as Database;

    const result = await executeDeletion(db, 'account-1');

    expect(result).toBe('cancelled');
    // Sentry must NOT fire for the expected cancel path.
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe('deleteProfileIfConsentWithdrawn', () => {
  it('[WI-78 review] locks the GDPR consent row before deleting the profile', async () => {
    const db = {
      ...createMockDb(),
      execute: jest.fn().mockResolvedValue({ rowCount: 1 }),
    } as unknown as Database;

    const result = await deleteProfileIfConsentWithdrawn(db, 'profile-1');

    expect(result).toBe(true);
    const sqlArg = (db.execute as jest.Mock).mock.calls[0]?.[0];
    const sqlText = extractSqlTextAndValues(sqlArg).join(' ');
    expect(sqlText).toContain('with locked_consent');
    expect(sqlText).toContain('for update');
    expect(sqlText).toContain('consent_type');
    expect(sqlText).toContain('gdpr');
    expect(sqlText).toContain('withdrawn');
  });

  it('[WI-78 review] requires the delete to match the revocation generation when provided', async () => {
    const db = {
      ...createMockDb(),
      execute: jest.fn().mockResolvedValue({ rowCount: 0 }),
    } as unknown as Database;

    const result = await deleteProfileIfConsentWithdrawn(
      db,
      'profile-1',
      '2026-01-10T10:00:00.000Z',
    );

    expect(result).toBe(false);
    const sqlArg = (db.execute as jest.Mock).mock.calls[0]?.[0];
    const sqlText = extractSqlTextAndValues(sqlArg).join(' ');
    expect(sqlText).toContain('responded_at');
    expect(sqlText).toContain('2026-01-10t10:00:00.000z');
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

  it('[WI-84 review] binds the original requestedAt generation into the atomic delete', async () => {
    const db = {
      ...createMockDb(),
      execute: jest.fn().mockResolvedValue({ rowCount: 0 }),
    } as unknown as Database;

    await deleteProfileIfNoConsent(
      db,
      'profile-1',
      new Date('2026-05-01T00:00:00.000Z'),
    );

    const sqlArg = (db.execute as jest.Mock).mock.calls[0]?.[0];
    const sqlText = extractSqlTextAndValues(sqlArg).join(' ');
    expect(sqlText).toContain('requested_at');
    expect(sqlText).toContain('>=');
    expect(sqlText).toContain('requested_at <');
    expect(sqlText).not.toContain('requested_at <=');
    expect(sqlText).toContain('2026-05-01t00:00:00.000z');
    expect(sqlText).toContain('2026-05-01t00:00:00.001z');
  });

  it('[WI-84 review] scopes the terminal-consent shield to GDPR only', async () => {
    const db = {
      ...createMockDb(),
      execute: jest.fn().mockResolvedValue({ rowCount: 0 }),
    } as unknown as Database;

    await deleteProfileIfNoConsent(
      db,
      'profile-1',
      new Date('2026-05-01T00:00:00.000Z'),
    );

    const sqlArg = (db.execute as jest.Mock).mock.calls[0]?.[0];
    const sqlText = extractSqlTextAndValues(sqlArg).join(' ');
    expect(sqlText).toContain('consent_type');
    expect(sqlText).toContain('gdpr');
  });
});
