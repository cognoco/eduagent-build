import type { Database } from '@eduagent/database';
import {
  getNotificationPrefs,
  upsertNotificationPrefs,
  getLearningMode,
  upsertLearningMode,
} from './settings';

const profileId = 'test-profile-id';

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

function createMockDb({
  findFirstResult = undefined as Record<string, unknown> | undefined,
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
