import type { Database } from '@eduagent/database';
import {
  getNotificationPrefs,
  upsertNotificationPrefs,
  getLearningMode,
  upsertLearningMode,
  getCelebrationLevel,
  upsertCelebrationLevel,
  getFamilyPoolBreakdownSharing,
  getOwnedFamilyPoolBreakdownSharing,
  upsertFamilyPoolBreakdownSharing,
  getMedianResponseSeconds,
  updateMedianResponseSeconds,
  getLearningModeRules,
  getConsecutiveSummarySkips,
  incrementSummarySkips,
  resetSummarySkips,
  SKIP_WARNING_THRESHOLD,
  registerPushToken,
  getPushToken,
  getDailyNotificationCount,
  logNotification,
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
        findFirst: jest.fn().mockResolvedValue(familyPreferencesFindFirstResult),
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
        where: jest.fn().mockResolvedValue(undefined),
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
      maxDailyPush: 3,
      weeklyProgressPush: true,
    });
  });

  it('returns stored values when row exists', async () => {
    const db = createMockDb({
      findFirstResult: {
        reviewReminders: true,
        dailyReminders: true,
        pushEnabled: true,
        maxDailyPush: 5,
      },
    });
    const result = await getNotificationPrefs(db, profileId);

    expect(result).toEqual({
      reviewReminders: true,
      dailyReminders: true,
      pushEnabled: true,
      maxDailyPush: 5,
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
      }
    );

    expect(result).toEqual({
      reviewReminders: true,
      dailyReminders: false,
      pushEnabled: true,
      maxDailyPush: 7,
      weeklyProgressPush: true,
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
      }
    );

    expect(result).toEqual({
      reviewReminders: true,
      dailyReminders: true,
      pushEnabled: true,
      maxDailyPush: 3,
      weeklyProgressPush: true,
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
      }
    );

    expect(result.maxDailyPush).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Learning Mode
// ---------------------------------------------------------------------------

describe('getLearningMode', () => {
  it('returns default casual mode when no row exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await getLearningMode(db, profileId);

    expect(result).toEqual({
      mode: 'casual',
      medianResponseSeconds: null,
      celebrationLevel: 'all',
    });
  });

  it('returns stored mode when row exists', async () => {
    const db = createMockDb({
      findFirstResult: {
        mode: 'casual',
        medianResponseSeconds: 240,
        celebrationLevel: 'big_only',
      },
    });
    const result = await getLearningMode(db, profileId);

    expect(result).toEqual({
      mode: 'casual',
      medianResponseSeconds: 240,
      celebrationLevel: 'big_only',
    });
  });
});

describe('upsertLearningMode', () => {
  it('inserts when no existing row', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await upsertLearningMode(
      db,
      profileId,
      TEST_ACCOUNT_ID,
      'casual'
    );

    expect(result).toEqual({ mode: 'casual' });
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates when row exists', async () => {
    const db = createMockDb({
      findFirstResult: { mode: 'serious' },
    });
    const result = await upsertLearningMode(
      db,
      profileId,
      TEST_ACCOUNT_ID,
      'casual'
    );

    expect(result).toEqual({ mode: 'casual' });
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
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
      upsertCelebrationLevel(db, profileId, TEST_ACCOUNT_ID, 'off')
    ).resolves.toEqual({ celebrationLevel: 'off' });
    expect(db.insert).toHaveBeenCalled();
  });

  it('updates when row exists', async () => {
    const db = createMockDb({
      findFirstResult: { celebrationLevel: 'all' },
    });
    await expect(
      upsertCelebrationLevel(db, profileId, TEST_ACCOUNT_ID, 'big_only')
    ).resolves.toEqual({ celebrationLevel: 'big_only' });
    expect(db.update).toHaveBeenCalled();
  });
});

describe('family pool breakdown sharing', () => {
  it('returns false when no row exists', async () => {
    const db = createMockDb({ familyPreferencesFindFirstResult: undefined });

    await expect(getFamilyPoolBreakdownSharing(db, profileId)).resolves.toBe(
      false
    );
  });

  it('returns the stored value', async () => {
    const db = createMockDb({
      familyPreferencesFindFirstResult: { poolBreakdownShared: true },
    });

    await expect(getFamilyPoolBreakdownSharing(db, profileId)).resolves.toBe(
      true
    );
  });

  it('requires an owner profile for owned reads', async () => {
    const db = createMockDb({ profileFindFirstResult: { isOwner: false } });

    await expect(
      getOwnedFamilyPoolBreakdownSharing(db, profileId, TEST_ACCOUNT_ID)
    ).rejects.toThrow('Profile owner required');
  });

  it('upserts the owner setting', async () => {
    const db = createMockDb();

    await expect(
      upsertFamilyPoolBreakdownSharing(
        db,
        profileId,
        TEST_ACCOUNT_ID,
        true
      )
    ).resolves.toEqual({ value: true });

    expect(db.insert).toHaveBeenCalled();
  });

  it('rejects writes from non-owner profiles', async () => {
    const db = createMockDb({ profileFindFirstResult: { isOwner: false } });

    await expect(
      upsertFamilyPoolBreakdownSharing(
        db,
        profileId,
        TEST_ACCOUNT_ID,
        true
      )
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
      180
    );
    expect(db.insert).toHaveBeenCalled();
  });

  it('updates baseline using exponential moving average', async () => {
    const db = createMockDb({
      findFirstResult: { medianResponseSeconds: 200 },
    });
    await expect(updateMedianResponseSeconds(db, profileId, 100)).resolves.toBe(
      180
    );
    expect(db.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Learning Mode Rules
// ---------------------------------------------------------------------------

describe('getLearningModeRules', () => {
  it('returns strict rules for serious mode', () => {
    const rules = getLearningModeRules('serious');

    expect(rules).toEqual({
      masteryGates: true,
      verifiedXpOnly: true,
      mandatorySummaries: true,
    });
  });

  it('returns relaxed rules for casual mode', () => {
    const rules = getLearningModeRules('casual');

    expect(rules).toEqual({
      masteryGates: false,
      verifiedXpOnly: false,
      mandatorySummaries: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Summary Skip Tracking
// ---------------------------------------------------------------------------

describe('getConsecutiveSummarySkips', () => {
  it('returns 0 when no row exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await getConsecutiveSummarySkips(db, profileId);

    expect(result).toBe(0);
  });

  it('returns stored count when row exists', async () => {
    const db = createMockDb({
      findFirstResult: { consecutiveSummarySkips: 7 },
    });
    const result = await getConsecutiveSummarySkips(db, profileId);

    expect(result).toBe(7);
  });
});

describe('incrementSummarySkips', () => {
  it('inserts with count 1 when no existing row', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await incrementSummarySkips(db, profileId);

    expect(result).toBe(1);
    expect(db.insert).toHaveBeenCalled();
  });

  it('updates incremented count when row exists', async () => {
    const db = createMockDb({
      findFirstResult: { consecutiveSummarySkips: 5 },
    });
    const result = await incrementSummarySkips(db, profileId);

    expect(result).toBe(6);
    expect(db.update).toHaveBeenCalled();
  });
});

describe('resetSummarySkips', () => {
  it('no-ops when no row exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    await resetSummarySkips(db, profileId);

    expect(db.update).not.toHaveBeenCalled();
  });

  it('no-ops when count is already 0', async () => {
    const db = createMockDb({
      findFirstResult: { consecutiveSummarySkips: 0 },
    });
    await resetSummarySkips(db, profileId);

    expect(db.update).not.toHaveBeenCalled();
  });

  it('resets count to 0 when count is > 0', async () => {
    const db = createMockDb({
      findFirstResult: { consecutiveSummarySkips: 8 },
    });
    await resetSummarySkips(db, profileId);

    expect(db.update).toHaveBeenCalled();
  });
});

describe('SKIP_WARNING_THRESHOLD', () => {
  it('remains 5', () => {
    expect(SKIP_WARNING_THRESHOLD).toBe(5);
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
      'ExponentPushToken[abc]'
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
      'ExponentPushToken[new]'
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
