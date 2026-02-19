jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    createScopedRepository: jest.fn(),
    generateUUIDv7: jest.fn().mockReturnValue('mock-uuid-v7'),
  };
});

import {
  createScopedRepository,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import {
  precomputeCoachingCard,
  writeCoachingCardCache,
  readCoachingCardCache,
  getCoachingCardForProfile,
} from './coaching-cards';
import type { CoachingCard } from '@eduagent/schemas';

const profileId = '550e8400-e29b-41d4-a716-446655440000';
const topicId = '770e8400-e29b-41d4-a716-446655440000';
const NOW = new Date('2026-02-15T10:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockRetentionCardRow(
  overrides?: Partial<{
    topicId: string;
    xpStatus: string;
    nextReviewAt: Date | null;
    easeFactor: string;
  }>
) {
  return {
    id: 'card-1',
    profileId,
    topicId: overrides?.topicId ?? topicId,
    easeFactor: overrides?.easeFactor ?? '2.50',
    intervalDays: 7,
    repetitions: 3,
    lastReviewedAt: NOW,
    nextReviewAt:
      overrides?.nextReviewAt ?? new Date('2026-02-22T10:00:00.000Z'),
    failureCount: 0,
    consecutiveSuccesses: 2,
    xpStatus: overrides?.xpStatus ?? 'pending',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMockDb(): Database {
  return {
    query: {
      streaks: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      coachingCardCache: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        returning: jest.fn().mockResolvedValue([]),
      }),
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    }),
  } as unknown as Database;
}

function setupScopedRepo({
  retentionCardsFindMany = [] as ReturnType<typeof mockRetentionCardRow>[],
} = {}) {
  (createScopedRepository as jest.Mock).mockReturnValue({
    retentionCards: {
      findMany: jest.fn().mockResolvedValue(retentionCardsFindMany),
    },
  });
}

// ---------------------------------------------------------------------------
// precomputeCoachingCard
// ---------------------------------------------------------------------------

describe('precomputeCoachingCard', () => {
  it('returns review_due card when retention cards have overdue nextReviewAt', async () => {
    const overdueCard = mockRetentionCardRow({
      nextReviewAt: new Date('2026-02-10T10:00:00.000Z'), // 5 days overdue
    });
    setupScopedRepo({ retentionCardsFindMany: [overdueCard] });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('review_due');
    expect(card.priority).toBeGreaterThanOrEqual(7);
    expect(card.priority).toBeLessThanOrEqual(10);
    if (card.type === 'review_due') {
      expect(card.topicId).toBe(topicId);
      expect(card.easeFactor).toBe(2.5);
      expect(card.dueAt).toBeDefined();
    }
  });

  it('scales review_due priority with overdue count (capped at 10)', async () => {
    const overdue1 = mockRetentionCardRow({
      topicId: 'topic-1',
      nextReviewAt: new Date('2026-02-10T10:00:00.000Z'),
    });
    const overdue2 = mockRetentionCardRow({
      topicId: 'topic-2',
      nextReviewAt: new Date('2026-02-12T10:00:00.000Z'),
    });
    const overdue3 = mockRetentionCardRow({
      topicId: 'topic-3',
      nextReviewAt: new Date('2026-02-13T10:00:00.000Z'),
    });
    const overdue4 = mockRetentionCardRow({
      topicId: 'topic-4',
      nextReviewAt: new Date('2026-02-14T10:00:00.000Z'),
    });
    setupScopedRepo({
      retentionCardsFindMany: [overdue1, overdue2, overdue3, overdue4],
    });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('review_due');
    expect(card.priority).toBe(10);
  });

  it('returns streak card when learner is on grace period', async () => {
    // No overdue cards (all in the future)
    const futureCard = mockRetentionCardRow({
      nextReviewAt: new Date('2026-02-25T10:00:00.000Z'),
    });
    setupScopedRepo({ retentionCardsFindMany: [futureCard] });
    const db = createMockDb();

    // Streak on grace period: last activity 2 days ago (gap=2, grace remaining)
    (db.query.streaks.findFirst as jest.Mock).mockResolvedValue({
      id: 'streak-1',
      profileId,
      currentStreak: 5,
      longestStreak: 5,
      lastActivityDate: '2026-02-13', // 2 days before NOW (Feb 15)
      gracePeriodStartDate: null,
    });

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('streak');
    expect(card.priority).toBe(6);
    if (card.type === 'streak') {
      expect(card.currentStreak).toBe(5);
      expect(card.graceRemaining).toBeGreaterThan(0);
    }
  });

  it('returns insight card when there are verified topics (no overdue, no grace)', async () => {
    const verifiedCard = mockRetentionCardRow({
      xpStatus: 'verified',
      nextReviewAt: new Date('2026-02-25T10:00:00.000Z'), // not overdue
    });
    setupScopedRepo({ retentionCardsFindMany: [verifiedCard] });
    const db = createMockDb();

    // Streak is active (consecutive day), no grace period
    (db.query.streaks.findFirst as jest.Mock).mockResolvedValue({
      id: 'streak-1',
      profileId,
      currentStreak: 3,
      longestStreak: 3,
      lastActivityDate: '2026-02-15', // today, no grace
      gracePeriodStartDate: null,
    });

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('insight');
    expect(card.priority).toBe(4);
    if (card.type === 'insight') {
      expect(card.topicId).toBe(topicId);
      expect(['strength', 'growth_area', 'pattern', 'milestone']).toContain(
        card.insightType
      );
    }
  });

  it('returns challenge card as fallback', async () => {
    // No retention cards at all
    setupScopedRepo({ retentionCardsFindMany: [] });
    const db = createMockDb();

    // No streak data
    (db.query.streaks.findFirst as jest.Mock).mockResolvedValue(null);

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('challenge');
    expect(card.priority).toBe(3);
    if (card.type === 'challenge') {
      expect(['easy', 'medium', 'hard']).toContain(card.difficulty);
      expect(card.xpReward).toBeGreaterThanOrEqual(0);
    }
  });

  it('prefers review_due over streak even when streak is on grace', async () => {
    const overdueCard = mockRetentionCardRow({
      nextReviewAt: new Date('2026-02-10T10:00:00.000Z'),
    });
    setupScopedRepo({ retentionCardsFindMany: [overdueCard] });
    const db = createMockDb();

    // Streak on grace period
    (db.query.streaks.findFirst as jest.Mock).mockResolvedValue({
      id: 'streak-1',
      profileId,
      currentStreak: 5,
      longestStreak: 5,
      lastActivityDate: '2026-02-13',
      gracePeriodStartDate: null,
    });

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('review_due');
  });

  it('prefers streak over insight when on grace period', async () => {
    // A verified card but not overdue
    const verifiedCard = mockRetentionCardRow({
      xpStatus: 'verified',
      nextReviewAt: new Date('2026-02-25T10:00:00.000Z'),
    });
    setupScopedRepo({ retentionCardsFindMany: [verifiedCard] });
    const db = createMockDb();

    // Streak on grace period
    (db.query.streaks.findFirst as jest.Mock).mockResolvedValue({
      id: 'streak-1',
      profileId,
      currentStreak: 7,
      longestStreak: 7,
      lastActivityDate: '2026-02-13', // 2 days gap = grace
      gracePeriodStartDate: null,
    });

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('streak');
  });

  it('sets common base fields on all card types', async () => {
    setupScopedRepo({ retentionCardsFindMany: [] });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.id).toBe('mock-uuid-v7');
    expect(card.profileId).toBe(profileId);
    expect(card.title).toBeDefined();
    expect(card.body).toBeDefined();
    expect(card.expiresAt).toBeDefined();
    expect(card.createdAt).toBeDefined();
  });

  it('sets expiresAt to 24 hours from now', async () => {
    setupScopedRepo({ retentionCardsFindMany: [] });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    const expiresAt = new Date(card.expiresAt!);
    const expected = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(expiresAt.getTime()).toBe(expected.getTime());
  });
});

// ---------------------------------------------------------------------------
// writeCoachingCardCache
// ---------------------------------------------------------------------------

describe('writeCoachingCardCache', () => {
  it('upserts card to coaching_card_cache table', async () => {
    const db = createMockDb();
    const card: CoachingCard = {
      id: 'mock-uuid-v7',
      profileId,
      type: 'challenge',
      title: 'Try a new challenge',
      body: 'Start your next topic!',
      priority: 3,
      expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: NOW.toISOString(),
      topicId,
      difficulty: 'easy',
      xpReward: 10,
    };

    await writeCoachingCardCache(db, profileId, card);

    expect(db.insert).toHaveBeenCalled();
    const valuesCall = (db.insert as jest.Mock).mock.results[0].value.values;
    expect(valuesCall).toHaveBeenCalled();
    const onConflictCall = valuesCall.mock.results[0].value.onConflictDoUpdate;
    expect(onConflictCall).toHaveBeenCalled();
  });

  it('sets expiresAt to 24 hours from now on write', async () => {
    const db = createMockDb();
    const card: CoachingCard = {
      id: 'mock-uuid-v7',
      profileId,
      type: 'challenge',
      title: 'Try a new challenge',
      body: 'Start your next topic!',
      priority: 3,
      expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: NOW.toISOString(),
      topicId,
      difficulty: 'easy',
      xpReward: 10,
    };

    await writeCoachingCardCache(db, profileId, card);

    const valuesCall = (db.insert as jest.Mock).mock.results[0].value.values;
    const insertedValues = valuesCall.mock.calls[0][0];
    const expiresAt = insertedValues.expiresAt as Date;
    const expected = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(expiresAt.getTime()).toBe(expected.getTime());
  });
});

// ---------------------------------------------------------------------------
// readCoachingCardCache
// ---------------------------------------------------------------------------

describe('readCoachingCardCache', () => {
  it('returns null when no cached card exists', async () => {
    const db = createMockDb();
    (db.query.coachingCardCache.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await readCoachingCardCache(db, profileId);

    expect(result).toBeNull();
  });

  it('returns null when cached card is expired', async () => {
    const db = createMockDb();
    const expiredRow = {
      id: 'cache-1',
      profileId,
      cardData: {
        id: 'mock-uuid-v7',
        profileId,
        type: 'challenge',
        title: 'Test',
        body: 'Body',
        priority: 3,
        expiresAt: new Date(NOW.getTime() - 1000).toISOString(), // expired
        createdAt: NOW.toISOString(),
        topicId,
        difficulty: 'easy',
        xpReward: 10,
      },
      expiresAt: new Date(NOW.getTime() - 1000), // expired
      createdAt: NOW,
      updatedAt: NOW,
    };
    (db.query.coachingCardCache.findFirst as jest.Mock).mockResolvedValue(
      expiredRow
    );

    const result = await readCoachingCardCache(db, profileId);

    expect(result).toBeNull();
  });

  it('returns card data when cached card is valid (not expired)', async () => {
    const db = createMockDb();
    const cardData: CoachingCard = {
      id: 'mock-uuid-v7',
      profileId,
      type: 'challenge',
      title: 'Test challenge',
      body: 'Body text',
      priority: 3,
      expiresAt: new Date(NOW.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      createdAt: NOW.toISOString(),
      topicId,
      difficulty: 'medium',
      xpReward: 20,
    };
    const validRow = {
      id: 'cache-1',
      profileId,
      cardData,
      expiresAt: new Date(NOW.getTime() + 12 * 60 * 60 * 1000), // 12h in future
      createdAt: NOW,
      updatedAt: NOW,
    };
    (db.query.coachingCardCache.findFirst as jest.Mock).mockResolvedValue(
      validRow
    );

    const result = await readCoachingCardCache(db, profileId);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('challenge');
    expect(result!.profileId).toBe(profileId);
  });
});

// ---------------------------------------------------------------------------
// getCoachingCardForProfile
// ---------------------------------------------------------------------------

describe('getCoachingCardForProfile', () => {
  function setupSessionCount(db: Database, count: number): void {
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ count }]),
      }),
    });
  }

  it('returns cold-start fallback when profile has fewer than 5 sessions', async () => {
    setupScopedRepo({ retentionCardsFindMany: [] });
    const db = createMockDb();
    setupSessionCount(db, 3);

    const result = await getCoachingCardForProfile(db, profileId);

    expect(result.coldStart).toBe(true);
    expect(result.card).toBeNull();
    expect(result.fallback).not.toBeNull();
    expect(result.fallback!.actions).toHaveLength(3);
    expect(result.fallback!.actions[0].key).toBe('continue_learning');
    expect(result.fallback!.actions[1].key).toBe('start_new_topic');
    expect(result.fallback!.actions[2].key).toBe('review_progress');
  });

  it('returns cold-start fallback when profile has 0 sessions', async () => {
    setupScopedRepo({ retentionCardsFindMany: [] });
    const db = createMockDb();
    setupSessionCount(db, 0);

    const result = await getCoachingCardForProfile(db, profileId);

    expect(result.coldStart).toBe(true);
    expect(result.card).toBeNull();
  });

  it('returns cached card when cache is valid (warm path)', async () => {
    setupScopedRepo({ retentionCardsFindMany: [] });
    const db = createMockDb();
    setupSessionCount(db, 10);

    const cachedCard: CoachingCard = {
      id: 'mock-uuid-v7',
      profileId,
      type: 'challenge',
      title: 'Cached card',
      body: 'From cache',
      priority: 3,
      expiresAt: new Date(NOW.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      createdAt: NOW.toISOString(),
      topicId,
      difficulty: 'easy',
      xpReward: 10,
    };
    (db.query.coachingCardCache.findFirst as jest.Mock).mockResolvedValue({
      id: 'cache-1',
      profileId,
      cardData: cachedCard,
      expiresAt: new Date(NOW.getTime() + 12 * 60 * 60 * 1000),
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await getCoachingCardForProfile(db, profileId);

    expect(result.coldStart).toBe(false);
    expect(result.card).not.toBeNull();
    expect(result.card!.title).toBe('Cached card');
    expect(result.fallback).toBeNull();
  });

  it('computes fresh card on cache miss and writes to cache', async () => {
    setupScopedRepo({ retentionCardsFindMany: [] });
    const db = createMockDb();
    setupSessionCount(db, 10);

    // Cache miss — returns null
    (db.query.coachingCardCache.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await getCoachingCardForProfile(db, profileId);

    expect(result.coldStart).toBe(false);
    expect(result.card).not.toBeNull();
    expect(result.card!.type).toBe('challenge'); // fallback since no retention cards
    expect(result.fallback).toBeNull();
    // Verify cache was written (insert called for the write)
    expect(db.insert).toHaveBeenCalled();
  });

  it('treats exactly 5 sessions as warm (not cold start)', async () => {
    setupScopedRepo({ retentionCardsFindMany: [] });
    const db = createMockDb();
    setupSessionCount(db, 5);

    // Cache miss
    (db.query.coachingCardCache.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await getCoachingCardForProfile(db, profileId);

    expect(result.coldStart).toBe(false);
    expect(result.card).not.toBeNull();
  });
});
