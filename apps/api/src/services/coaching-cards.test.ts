import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  exports: {
    createScopedRepository: jest.fn(),
    generateUUIDv7: jest.fn().mockReturnValue('mock-uuid-v7'),
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// [BREAK] Sentry is a true external boundary — mock it to assert escalation.
const mockCaptureException = jest.fn();
jest.mock('./sentry' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('./sentry'),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import {
  createScopedRepository,
  applyStreakDecay,
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
    easeFactor: number;
  }>,
) {
  return {
    id: 'card-1',
    profileId,
    topicId: overrides?.topicId ?? topicId,
    easeFactor: overrides?.easeFactor ?? 2.5,
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
  const db: Record<string, unknown> = {
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
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        returning: jest.fn().mockResolvedValue([]),
      }),
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          for: jest.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  };
  // transaction passes itself as tx so the same mock chains work inside
  db.transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  return db as unknown as Database;
}

interface StreakRowInput {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  gracePeriodStartDate: string | null;
}

function setupScopedRepo({
  retentionCardsFindMany = [] as ReturnType<typeof mockRetentionCardRow>[],
  streakRow = null as StreakRowInput | null,
}: {
  retentionCardsFindMany?: ReturnType<typeof mockRetentionCardRow>[];
  streakRow?: StreakRowInput | null;
} = {}) {
  const today = NOW.toISOString().slice(0, 10);
  (createScopedRepository as jest.Mock).mockReturnValue({
    retentionCards: {
      findMany: jest.fn().mockResolvedValue(retentionCardsFindMany),
    },
    streaks: {
      findCurrentForToday: jest
        .fn()
        .mockResolvedValue(
          streakRow ? applyStreakDecay(streakRow, today) : null,
        ),
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
      expect(typeof card.dueAt).toBe('string');
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
    // Streak on grace period: last activity 2 days ago (gap=2, grace remaining)
    setupScopedRepo({
      retentionCardsFindMany: [futureCard],
      streakRow: {
        currentStreak: 5,
        longestStreak: 5,
        lastActivityDate: '2026-02-13', // 2 days before NOW (Feb 15)
        gracePeriodStartDate: null,
      },
    });
    const db = createMockDb();

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
    // Streak is active (consecutive day), no grace period
    setupScopedRepo({
      retentionCardsFindMany: [verifiedCard],
      streakRow: {
        currentStreak: 3,
        longestStreak: 3,
        lastActivityDate: '2026-02-15', // today, no grace
        gracePeriodStartDate: null,
      },
    });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('insight');
    expect(card.priority).toBe(4);
    if (card.type === 'insight') {
      expect(card.topicId).toBe(topicId);
      expect(['strength', 'growth_area', 'pattern', 'milestone']).toContain(
        card.insightType,
      );
    }
  });

  it('returns curriculum_complete when no retention cards exist', async () => {
    // [BUG-55] No retention cards = no valid topicId, returns curriculum_complete
    // No streak data (streakRow defaults to null in setupScopedRepo)
    setupScopedRepo({ retentionCardsFindMany: [] });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('curriculum_complete');
    expect(card.priority).toBe(3);
  });

  it('returns curriculum_complete card when all retention cards are verified (>= 3 cards)', async () => {
    const verifiedCards = [
      mockRetentionCardRow({
        topicId: 'topic-1',
        xpStatus: 'verified',
        nextReviewAt: new Date('2026-02-25T10:00:00.000Z'),
      }),
      mockRetentionCardRow({
        topicId: 'topic-2',
        xpStatus: 'verified',
        nextReviewAt: new Date('2026-02-25T10:00:00.000Z'),
      }),
      mockRetentionCardRow({
        topicId: 'topic-3',
        xpStatus: 'verified',
        nextReviewAt: new Date('2026-02-25T10:00:00.000Z'),
      }),
    ];
    // No streak on grace period
    setupScopedRepo({
      retentionCardsFindMany: verifiedCards,
      streakRow: {
        currentStreak: 10,
        longestStreak: 10,
        lastActivityDate: '2026-02-15', // today
        gracePeriodStartDate: null,
      },
    });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('curriculum_complete');
    expect(card.priority).toBe(5);
    expect(card.title).toContain('mastered');
  });

  it('does not return curriculum_complete when fewer than 3 verified cards', async () => {
    const verifiedCards = [
      mockRetentionCardRow({
        topicId: 'topic-1',
        xpStatus: 'verified',
        nextReviewAt: new Date('2026-02-25T10:00:00.000Z'),
      }),
      mockRetentionCardRow({
        topicId: 'topic-2',
        xpStatus: 'verified',
        nextReviewAt: new Date('2026-02-25T10:00:00.000Z'),
      }),
    ];
    // No streak on grace
    setupScopedRepo({
      retentionCardsFindMany: verifiedCards,
      streakRow: {
        currentStreak: 5,
        longestStreak: 5,
        lastActivityDate: '2026-02-15',
        gracePeriodStartDate: null,
      },
    });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    // Should fall through to insight since cards are verified but count < 3
    expect(card.type).toBe('insight');
    expect(card.priority).toBe(4);
  });

  it('does not return curriculum_complete when some cards are not verified', async () => {
    const mixedCards = [
      mockRetentionCardRow({
        topicId: 'topic-1',
        xpStatus: 'verified',
        nextReviewAt: new Date('2026-02-25T10:00:00.000Z'),
      }),
      mockRetentionCardRow({
        topicId: 'topic-2',
        xpStatus: 'verified',
        nextReviewAt: new Date('2026-02-25T10:00:00.000Z'),
      }),
      mockRetentionCardRow({
        topicId: 'topic-3',
        xpStatus: 'pending', // not verified
        nextReviewAt: new Date('2026-02-25T10:00:00.000Z'),
      }),
    ];
    setupScopedRepo({
      retentionCardsFindMany: mixedCards,
      streakRow: {
        currentStreak: 5,
        longestStreak: 5,
        lastActivityDate: '2026-02-15',
        gracePeriodStartDate: null,
      },
    });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    // Should be insight (not curriculum_complete) since not all are verified
    expect(card.type).toBe('insight');
    expect(card.type).not.toBe('curriculum_complete');
  });

  it('review_due priority scales: single overdue = 7, multiple increases up to 10', async () => {
    // Single overdue card: priority should be 7
    const singleOverdue = mockRetentionCardRow({
      topicId: 'topic-1',
      nextReviewAt: new Date('2026-02-10T10:00:00.000Z'),
    });
    setupScopedRepo({ retentionCardsFindMany: [singleOverdue] });
    const db1 = createMockDb();

    const card1 = await precomputeCoachingCard(db1, profileId);
    expect(card1.type).toBe('review_due');
    expect(card1.priority).toBe(7);

    // Two overdue cards: priority should be 8
    const twoOverdue = [
      mockRetentionCardRow({
        topicId: 'topic-1',
        nextReviewAt: new Date('2026-02-10T10:00:00.000Z'),
      }),
      mockRetentionCardRow({
        topicId: 'topic-2',
        nextReviewAt: new Date('2026-02-12T10:00:00.000Z'),
      }),
    ];
    setupScopedRepo({ retentionCardsFindMany: twoOverdue });
    const db2 = createMockDb();

    const card2 = await precomputeCoachingCard(db2, profileId);
    expect(card2.type).toBe('review_due');
    expect(card2.priority).toBe(8);
  });

  it('review_due picks the most overdue card (earliest nextReviewAt)', async () => {
    const overdueCards = [
      mockRetentionCardRow({
        topicId: 'topic-newer',
        nextReviewAt: new Date('2026-02-12T10:00:00.000Z'), // less overdue
      }),
      mockRetentionCardRow({
        topicId: 'topic-older',
        nextReviewAt: new Date('2026-02-08T10:00:00.000Z'), // most overdue
      }),
    ];
    setupScopedRepo({ retentionCardsFindMany: overdueCards });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('review_due');
    if (card.type === 'review_due') {
      expect(card.topicId).toBe('topic-older');
    }
  });

  it('prefers review_due over streak even when streak is on grace', async () => {
    const overdueCard = mockRetentionCardRow({
      nextReviewAt: new Date('2026-02-10T10:00:00.000Z'),
    });
    // Streak on grace period
    setupScopedRepo({
      retentionCardsFindMany: [overdueCard],
      streakRow: {
        currentStreak: 5,
        longestStreak: 5,
        lastActivityDate: '2026-02-13',
        gracePeriodStartDate: null,
      },
    });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('review_due');
  });

  it('prefers streak over insight when on grace period', async () => {
    // A verified card but not overdue
    const verifiedCard = mockRetentionCardRow({
      xpStatus: 'verified',
      nextReviewAt: new Date('2026-02-25T10:00:00.000Z'),
    });
    // Streak on grace period
    setupScopedRepo({
      retentionCardsFindMany: [verifiedCard],
      streakRow: {
        currentStreak: 7,
        longestStreak: 7,
        lastActivityDate: '2026-02-13', // 2 days gap = grace
        gracePeriodStartDate: null,
      },
    });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.type).toBe('streak');
  });

  it('sets common base fields on all card types', async () => {
    setupScopedRepo({ retentionCardsFindMany: [] });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    expect(card.id).toBe('mock-uuid-v7');
    expect(card.profileId).toBe(profileId);
    expect(typeof card.title).toBe('string');
    expect(typeof card.body).toBe('string');
    expect(typeof card.expiresAt).toBe('string');
    expect(typeof card.createdAt).toBe('string');
  });

  it('sets expiresAt to 24 hours from now', async () => {
    setupScopedRepo({ retentionCardsFindMany: [] });
    const db = createMockDb();

    const card = await precomputeCoachingCard(db, profileId);

    const expiresAt = new Date(card.expiresAt!);
    const expected = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(expiresAt.getTime()).toBe(expected.getTime());
  });

  it('[BREAK] review_due book-enrichment DB throw still returns review_due card AND calls captureException with surface=coaching-cards', async () => {
    // Arrange: one overdue card so the review_due branch is entered
    const overdueCard = mockRetentionCardRow({
      topicId: 'topic-break',
      nextReviewAt: new Date('2026-02-10T10:00:00.000Z'),
    });
    setupScopedRepo({ retentionCardsFindMany: [overdueCard] });
    const db = createMockDb();

    // Make the enrichment query (db.query.curriculumTopics.findFirst) throw
    db.query = {
      ...db.query,
      curriculumTopics: {
        findFirst: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      },
    } as unknown as typeof db.query;

    mockCaptureException.mockClear();

    // Act
    const card = await precomputeCoachingCard(db, profileId);

    // Assert 1: fallthrough behaviour preserved — card is still returned
    expect(card.type).toBe('review_due');

    // Assert 2: escalation fired at least once, including the enrichment site,
    // with the correct surface in extra (birthYear_lookup may also fire due to
    // mock db not having db.query.profiles — both correctly include surface).
    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ surface: 'coaching-cards' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// writeCoachingCardCache
// ---------------------------------------------------------------------------

describe('writeCoachingCardCache', () => {
  it('writes card to coaching_card_cache via transaction', async () => {
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

    // mergeHomeSurfaceCacheData now uses a transaction with:
    // 1. insert().values().onConflictDoNothing() — ensure row exists
    // 2. select().from().where().for('update') — lock row
    // 3. update().set().where() — write merged data
    expect(db.transaction).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
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

    // expiresAt is now passed to update().set() instead of insert().values()
    const setCall = (db.update as jest.Mock).mock.results[0]!.value.set;
    const setValues = setCall.mock.calls[0]![0];
    const expiresAt = setValues.expiresAt as Date;
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
      expiredRow,
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
      validRow,
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
    // select() is used for both session-count queries and FOR UPDATE locks.
    // The mock must support both: .where() resolves to [{count}] for counts,
    // and .where().for('update') resolves to [] for the cache lock.
    const whereResult = Object.assign(Promise.resolve([{ count }]), {
      for: jest.fn().mockResolvedValue([]),
    });
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue(whereResult),
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
    expect(result.fallback!.actions[0]!.key).toBe('continue_learning');
    expect(result.fallback!.actions[1]!.key).toBe('start_new_topic');
    expect(result.fallback!.actions[2]!.key).toBe('review_progress');
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
    // [BUG-55] No retention cards = no valid topicId, so returns curriculum_complete
    expect(result.card!.type).toBe('curriculum_complete');
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
