import type { Database } from '@eduagent/database';
import {
  getNotificationPrefs,
  upsertNotificationPrefs,
  getLearningModeRecord,
  getCelebrationLevel,
  upsertCelebrationLevel,
  getFamilyPoolBreakdownSharing,
  getOwnedFamilyPoolBreakdownSharing,
  upsertFamilyPoolBreakdownSharing,
  getMedianResponseSeconds,
  updateMedianResponseSeconds,
  registerPushToken,
  getPushToken,
  getDailyNotificationCount,
  logNotification,
  isPushEnabled,
} from './settings';

const profileId = 'test-profile-id';

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

const TEST_ACCOUNT_ID = 'test-account-id';

function createMockDb({
  findFirstResult = undefined as Record<string, unknown> | undefined,
  familyPreferencesFindFirstResult = undefined as
    | Record<string, unknown>
    | undefined,
  profileFindFirstResult = { isOwner: true } as
    | Record<string, unknown>
    | undefined,
  selectResult = [{ id: profileId }] as Record<string, unknown>[],
} = {}): Database {
  const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
  return {
    query: {
      notificationPreferences: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
      learningModes: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
      familyPreferences: {
        findFirst: jest
          .fn()
          .mockResolvedValue(familyPreferencesFindFirstResult),
      },
      profiles: {
        findFirst: jest.fn().mockResolvedValue(profileFindFirstResult),
      },
    },
    insert: jest.fn().mockReturnValue({
      values,
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          // Default: simulate one row matched + returned (defense-in-depth
          // EXISTS subquery hit). Tests for the ownership-mismatch branch
          // override this via createMockDb({ updateReturning: [] }).
          returning: jest.fn().mockResolvedValue([{ id: profileId }]),
        }),
      }),
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(selectResult),
      }),
    }),
  } as unknown as Database;
}

// ---------------------------------------------------------------------------
// Notification Preferences
// ---------------------------------------------------------------------------

describe('getNotificationPrefs', () => {
  it('returns defaults when no row exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await getNotificationPrefs(db, profileId);

    expect(result).toEqual({
      reviewReminders: false,
      dailyReminders: false,
      pushEnabled: false,
      pushTokenRegistered: false,
      maxDailyPush: 3,
      weeklyProgressPush: true,
      weeklyProgressEmail: true,
      monthlyProgressEmail: true,
    });
  });

  it('returns stored values when row exists', async () => {
    const db = createMockDb({
      findFirstResult: {
        reviewReminders: true,
        dailyReminders: true,
        pushEnabled: true,
        maxDailyPush: 5,
        weeklyProgressPush: false,
        weeklyProgressEmail: false,
        monthlyProgressEmail: true,
        expoPushToken: 'ExponentPushToken[abc]',
      },
    });
    const result = await getNotificationPrefs(db, profileId);

    expect(result).toEqual({
      reviewReminders: true,
      dailyReminders: true,
      pushEnabled: true,
      pushTokenRegistered: true,
      maxDailyPush: 5,
      weeklyProgressPush: false,
      weeklyProgressEmail: false,
      monthlyProgressEmail: true,
    });
  });
});

describe('upsertNotificationPrefs', () => {
  it('inserts when no existing row', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await upsertNotificationPrefs(
      db,
      profileId,
      TEST_ACCOUNT_ID,
      {
        reviewReminders: true,
        dailyReminders: false,
        pushEnabled: true,
        maxDailyPush: 7,
      },
    );

    expect(result).toEqual({
      reviewReminders: true,
      dailyReminders: false,
      pushEnabled: true,
      pushTokenRegistered: false,
      maxDailyPush: 7,
      weeklyProgressPush: true,
      weeklyProgressEmail: true,
      monthlyProgressEmail: true,
    });
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates when row exists', async () => {
    const db = createMockDb({
      findFirstResult: {
        reviewReminders: false,
        dailyReminders: false,
        pushEnabled: false,
        maxDailyPush: 3,
        weeklyProgressPush: false,
        weeklyProgressEmail: false,
        monthlyProgressEmail: false,
        expoPushToken: 'ExponentPushToken[existing]',
      },
    });
    const result = await upsertNotificationPrefs(
      db,
      profileId,
      TEST_ACCOUNT_ID,
      {
        reviewReminders: true,
        dailyReminders: true,
        pushEnabled: true,
      },
    );

    expect(result).toEqual({
      reviewReminders: true,
      dailyReminders: true,
      pushEnabled: true,
      pushTokenRegistered: true,
      maxDailyPush: 3,
      weeklyProgressPush: false,
      weeklyProgressEmail: false,
      monthlyProgressEmail: false,
    });
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('defaults maxDailyPush to 3 when not provided', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await upsertNotificationPrefs(
      db,
      profileId,
      TEST_ACCOUNT_ID,
      {
        reviewReminders: false,
        dailyReminders: false,
        pushEnabled: false,
      },
    );

    expect(result.maxDailyPush).toBe(3);
  });

  // [BUG-661 / FCR-2026-05-23-L3.L3.2] Break test: defense-in-depth guard on
  // UPDATE. If verifyProfileOwnership at the top of upsertNotificationPrefs
  // were ever bypassed or raced, the EXISTS(profiles WHERE id = ? AND
  // account_id = ?) filter in the UPDATE WHERE clause must still block the
  // write. We simulate this by making the UPDATE return zero rows (which is
  // what would happen when (profileId, accountId) doesn't link to a row in
  // profiles). The function must throw rather than silently no-op.
  it('throws when UPDATE matches zero rows (account ownership mismatch defense) [BUG-661]', async () => {
    const db = createMockDb({
      findFirstResult: {
        reviewReminders: false,
        dailyReminders: false,
        pushEnabled: false,
        maxDailyPush: 3,
      },
    });
    // Override the update chain to return [] (no rows matched the EXISTS
    // subquery — simulates a mismatched (profileId, accountId) pair).
    (db.update as jest.Mock).mockReturnValueOnce({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      }),
    });

    await expect(
      upsertNotificationPrefs(db, profileId, TEST_ACCOUNT_ID, {
        reviewReminders: true,
        dailyReminders: false,
        pushEnabled: false,
      }),
    ).rejects.toThrow(/not owned by account/);
  });

  // [BUG-661] Break test on INSERT path: even when no existing row exists,
  // the ownership check immediately before INSERT must block when
  // (profileId, accountId) doesn't link in profiles.
  it('throws on INSERT path when profile is not owned by account [BUG-661]', async () => {
    // findFirstResult undefined → no existing row → INSERT path
    // selectResult: [] → ownership pre-check fails
    const db = createMockDb({
      findFirstResult: undefined,
      selectResult: [{ id: profileId }],
    });
    // First select (verifyProfileOwnership at top) returns the profile,
    // second select (pre-insert ownership check) returns empty.
    let callCount = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      callCount++;
      return {
        from: jest.fn().mockReturnValue({
          where: jest
            .fn()
            .mockResolvedValue(callCount === 1 ? [{ id: profileId }] : []),
        }),
      };
    });

    await expect(
      upsertNotificationPrefs(db, profileId, TEST_ACCOUNT_ID, {
        reviewReminders: true,
        dailyReminders: false,
        pushEnabled: false,
      }),
    ).rejects.toThrow(/not owned by account/);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Learning Mode Record (mode toggle removed; record now carries
// median response seconds + celebration level only)
// ---------------------------------------------------------------------------

describe('getLearningModeRecord', () => {
  it('returns defaults when no row exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await getLearningModeRecord(db, profileId);

    expect(result).toEqual({
      medianResponseSeconds: null,
      celebrationLevel: 'all',
    });
  });

  it('returns stored fields when row exists', async () => {
    const db = createMockDb({
      findFirstResult: {
        medianResponseSeconds: 240,
        celebrationLevel: 'big_only',
      },
    });
    const result = await getLearningModeRecord(db, profileId);

    expect(result).toEqual({
      medianResponseSeconds: 240,
      celebrationLevel: 'big_only',
    });
  });
});

describe('getCelebrationLevel', () => {
  it('defaults to all when no row exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    await expect(getCelebrationLevel(db, profileId)).resolves.toBe('all');
  });

  it('returns stored celebration level when present', async () => {
    const db = createMockDb({
      findFirstResult: { celebrationLevel: 'big_only' },
    });
    await expect(getCelebrationLevel(db, profileId)).resolves.toBe('big_only');
  });
});

describe('upsertCelebrationLevel', () => {
  it('inserts when no row exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    await expect(
      upsertCelebrationLevel(db, profileId, TEST_ACCOUNT_ID, 'off'),
    ).resolves.toEqual({ celebrationLevel: 'off' });
    expect(db.insert).toHaveBeenCalled();
  });

  it('updates when row exists', async () => {
    const db = createMockDb({
      findFirstResult: { celebrationLevel: 'all' },
    });
    await expect(
      upsertCelebrationLevel(db, profileId, TEST_ACCOUNT_ID, 'big_only'),
    ).resolves.toEqual({ celebrationLevel: 'big_only' });
    expect(db.update).toHaveBeenCalled();
  });
});

describe('family pool breakdown sharing', () => {
  it('returns false when no row exists', async () => {
    const db = createMockDb({ familyPreferencesFindFirstResult: undefined });

    await expect(getFamilyPoolBreakdownSharing(db, profileId)).resolves.toBe(
      false,
    );
  });

  it('returns the stored value', async () => {
    const db = createMockDb({
      familyPreferencesFindFirstResult: { poolBreakdownShared: true },
    });

    await expect(getFamilyPoolBreakdownSharing(db, profileId)).resolves.toBe(
      true,
    );
  });

  it('requires an owner profile for owned reads', async () => {
    const db = createMockDb({ profileFindFirstResult: { isOwner: false } });

    await expect(
      getOwnedFamilyPoolBreakdownSharing(db, profileId, TEST_ACCOUNT_ID),
    ).rejects.toThrow('Profile owner required');
  });

  it('upserts the owner setting', async () => {
    const db = createMockDb();

    await expect(
      upsertFamilyPoolBreakdownSharing(db, profileId, TEST_ACCOUNT_ID, true),
    ).resolves.toEqual({ value: true });

    expect(db.insert).toHaveBeenCalled();
  });

  it('rejects writes from non-owner profiles', async () => {
    const db = createMockDb({ profileFindFirstResult: { isOwner: false } });

    await expect(
      upsertFamilyPoolBreakdownSharing(db, profileId, TEST_ACCOUNT_ID, true),
    ).rejects.toThrow('Profile owner required');
  });
});

describe('median response baseline', () => {
  it('returns null when no row exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    await expect(getMedianResponseSeconds(db, profileId)).resolves.toBeNull();
  });

  it('returns stored median response seconds', async () => {
    const db = createMockDb({
      findFirstResult: { medianResponseSeconds: 210 },
    });
    await expect(getMedianResponseSeconds(db, profileId)).resolves.toBe(210);
  });

  it('creates a new baseline when none exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    await expect(updateMedianResponseSeconds(db, profileId, 180)).resolves.toBe(
      180,
    );
    expect(db.insert).toHaveBeenCalled();
  });

  it('updates baseline using exponential moving average', async () => {
    const db = createMockDb({
      findFirstResult: { medianResponseSeconds: 200 },
    });
    await expect(updateMedianResponseSeconds(db, profileId, 100)).resolves.toBe(
      180,
    );
    expect(db.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Push Token Registration
// ---------------------------------------------------------------------------

describe('registerPushToken', () => {
  it('inserts token when no existing preferences row', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    await registerPushToken(
      db,
      profileId,
      TEST_ACCOUNT_ID,
      'ExponentPushToken[abc]',
    );

    expect(db.insert).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates token when preferences row exists', async () => {
    const db = createMockDb({
      findFirstResult: { expoPushToken: 'old-token' },
    });
    await registerPushToken(
      db,
      profileId,
      TEST_ACCOUNT_ID,
      'ExponentPushToken[new]',
    );

    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('getPushToken', () => {
  it('returns null when no row exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await getPushToken(db, profileId);

    expect(result).toBeNull();
  });

  it('returns null when row exists but no token set', async () => {
    const db = createMockDb({
      findFirstResult: { expoPushToken: null },
    });
    const result = await getPushToken(db, profileId);

    expect(result).toBeNull();
  });

  it('returns token when row exists with token', async () => {
    const db = createMockDb({
      findFirstResult: { expoPushToken: 'ExponentPushToken[abc]' },
    });
    const result = await getPushToken(db, profileId);

    expect(result).toBe('ExponentPushToken[abc]');
  });
});

// ---------------------------------------------------------------------------
// Notification Logging
// ---------------------------------------------------------------------------

describe('getDailyNotificationCount', () => {
  it('returns 0 when no notifications sent today', async () => {
    const db = createMockDb({ selectResult: [] });
    const result = await getDailyNotificationCount(db, profileId);

    expect(result).toBe(0);
  });

  it('returns count of notifications sent today', async () => {
    const db = createMockDb({
      selectResult: [{}, {}, {}],
    });
    const result = await getDailyNotificationCount(db, profileId);

    expect(result).toBe(3);
  });

  it('[BREAK] WHERE clause includes ne(type, support_outbox_spillover) to exclude rate-limit sentinels from the push cap', async () => {
    // Capture the predicate passed to .where() so we can assert the ne()
    // filter is present. Without this filter, support_outbox_spillover rows
    // inserted by the outbox-spillover rate-limit path would count toward
    // MAX_DAILY_PUSH and silently block real push notifications.
    const whereMock = jest.fn().mockResolvedValue([]);
    const db = {
      ...createMockDb({ selectResult: [] }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: whereMock,
        }),
      }),
    } as unknown as Database;

    await getDailyNotificationCount(db, profileId);

    expect(whereMock).toHaveBeenCalledTimes(1);
    const [predicate] = whereMock.mock.calls[0];
    // The drizzle and() node stores its conditions in a 'chunks' array.
    // Each condition is a SQL node wrapping column references and values.
    // Serialise only the static value references to avoid circular PgTable
    // refs, and verify 'support_outbox_spillover' appears somewhere.
    const valueParts: unknown[] = [];
    function collectValues(node: unknown): void {
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      if ('value' in obj) valueParts.push(obj['value']);
      for (const key of Object.keys(obj)) {
        if (key === 'table') continue; // skip circular PgTable refs
        if (Array.isArray(obj[key])) {
          (obj[key] as unknown[]).forEach(collectValues);
        } else if (typeof obj[key] === 'object') {
          collectValues(obj[key]);
        }
      }
    }
    collectValues(predicate);
    expect(valueParts).toContain('support_outbox_spillover');
  });
});

describe('logNotification', () => {
  it('inserts a notification log entry', async () => {
    const db = createMockDb();
    await logNotification(db, profileId, 'review_reminder', 'ticket-abc');

    expect(db.insert).toHaveBeenCalled();
  });

  it('handles missing ticketId with null', async () => {
    const db = createMockDb();
    await logNotification(db, profileId, 'daily_reminder');

    expect(db.insert).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [WI-82] isPushEnabled
// ---------------------------------------------------------------------------

describe('isPushEnabled', () => {
  it('returns true when row.pushEnabled is true', async () => {
    const db = createMockDb({ findFirstResult: { pushEnabled: true } });
    await expect(isPushEnabled(db, profileId)).resolves.toBe(true);
  });

  it('returns false when row.pushEnabled is false', async () => {
    const db = createMockDb({ findFirstResult: { pushEnabled: false } });
    await expect(isPushEnabled(db, profileId)).resolves.toBe(false);
  });

  it('returns false when no row exists (absent row counts as disabled)', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    await expect(isPushEnabled(db, profileId)).resolves.toBe(false);
  });

  it('returns false when row exists but pushEnabled is null/undefined', async () => {
    const db = createMockDb({ findFirstResult: { pushEnabled: null } });
    await expect(isPushEnabled(db, profileId)).resolves.toBe(false);
  });
});
