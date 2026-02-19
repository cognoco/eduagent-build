import type { Database } from '@eduagent/database';
import {
  getNotificationPrefs,
  upsertNotificationPrefs,
  getLearningMode,
  upsertLearningMode,
  getLearningModeRules,
  getConsecutiveSummarySkips,
  incrementSummarySkips,
  resetSummarySkips,
  shouldPromptCasualSwitch,
  CASUAL_SWITCH_PROMPT_THRESHOLD,
  registerPushToken,
  getPushToken,
  getDailyNotificationCount,
  logNotification,
} from './settings';

const profileId = 'test-profile-id';

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

function createMockDb({
  findFirstResult = undefined as Record<string, unknown> | undefined,
  selectResult = [] as Record<string, unknown>[],
} = {}): Database {
  return {
    query: {
      notificationPreferences: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
      learningModes: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
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
    const result = await upsertNotificationPrefs(db, profileId, {
      reviewReminders: true,
      dailyReminders: false,
      pushEnabled: true,
      maxDailyPush: 7,
    });

    expect(result).toEqual({
      reviewReminders: true,
      dailyReminders: false,
      pushEnabled: true,
      maxDailyPush: 7,
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
    const result = await upsertNotificationPrefs(db, profileId, {
      reviewReminders: true,
      dailyReminders: true,
      pushEnabled: true,
    });

    expect(result).toEqual({
      reviewReminders: true,
      dailyReminders: true,
      pushEnabled: true,
      maxDailyPush: 3,
    });
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('defaults maxDailyPush to 3 when not provided', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await upsertNotificationPrefs(db, profileId, {
      reviewReminders: false,
      dailyReminders: false,
      pushEnabled: false,
    });

    expect(result.maxDailyPush).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Learning Mode
// ---------------------------------------------------------------------------

describe('getLearningMode', () => {
  it('returns default serious mode when no row exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await getLearningMode(db, profileId);

    expect(result).toEqual({ mode: 'serious' });
  });

  it('returns stored mode when row exists', async () => {
    const db = createMockDb({
      findFirstResult: { mode: 'casual' },
    });
    const result = await getLearningMode(db, profileId);

    expect(result).toEqual({ mode: 'casual' });
  });
});

describe('upsertLearningMode', () => {
  it('inserts when no existing row', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await upsertLearningMode(db, profileId, 'casual');

    expect(result).toEqual({ mode: 'casual' });
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates when row exists', async () => {
    const db = createMockDb({
      findFirstResult: { mode: 'serious' },
    });
    const result = await upsertLearningMode(db, profileId, 'casual');

    expect(result).toEqual({ mode: 'casual' });
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
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

describe('shouldPromptCasualSwitch', () => {
  it('returns false when no row exists (defaults: serious, 0 skips)', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await shouldPromptCasualSwitch(db, profileId);

    expect(result).toBe(false);
  });

  it('returns false when mode is casual (even with many skips)', async () => {
    const db = createMockDb({
      findFirstResult: { mode: 'casual', consecutiveSummarySkips: 15 },
    });
    const result = await shouldPromptCasualSwitch(db, profileId);

    expect(result).toBe(false);
  });

  it('returns false when serious mode but skips below threshold', async () => {
    const db = createMockDb({
      findFirstResult: {
        mode: 'serious',
        consecutiveSummarySkips: CASUAL_SWITCH_PROMPT_THRESHOLD - 1,
      },
    });
    const result = await shouldPromptCasualSwitch(db, profileId);

    expect(result).toBe(false);
  });

  it('returns true when serious mode and skips at threshold', async () => {
    const db = createMockDb({
      findFirstResult: {
        mode: 'serious',
        consecutiveSummarySkips: CASUAL_SWITCH_PROMPT_THRESHOLD,
      },
    });
    const result = await shouldPromptCasualSwitch(db, profileId);

    expect(result).toBe(true);
  });

  it('returns true when serious mode and skips above threshold', async () => {
    const db = createMockDb({
      findFirstResult: {
        mode: 'serious',
        consecutiveSummarySkips: CASUAL_SWITCH_PROMPT_THRESHOLD + 5,
      },
    });
    const result = await shouldPromptCasualSwitch(db, profileId);

    expect(result).toBe(true);
  });

  it('threshold constant is 10', () => {
    expect(CASUAL_SWITCH_PROMPT_THRESHOLD).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Push Token Registration
// ---------------------------------------------------------------------------

describe('registerPushToken', () => {
  it('inserts token when no existing preferences row', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    await registerPushToken(db, profileId, 'ExponentPushToken[abc]');

    expect(db.insert).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates token when preferences row exists', async () => {
    const db = createMockDb({
      findFirstResult: { expoPushToken: 'old-token' },
    });
    await registerPushToken(db, profileId, 'ExponentPushToken[new]');

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
