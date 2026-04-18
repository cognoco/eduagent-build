import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  exports: {
    createScopedRepository: jest.fn(),
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

jest.mock('./retention', () => ({
  processRecallResult: jest.fn(),
  getRetentionStatus: jest.fn().mockReturnValue('weak'),
  isTopicStable: jest.fn().mockReturnValue(false),
  canRetestTopic: jest.fn().mockReturnValue(true),
}));

jest.mock('@eduagent/retention', () => ({
  sm2: jest.fn().mockReturnValue({
    card: {
      easeFactor: 2.6,
      interval: 6,
      repetitions: 4,
      lastReviewedAt: '2026-02-15T10:00:00.000Z',
      nextReviewAt: '2026-02-21T10:00:00.000Z',
    },
  }),
}));

jest.mock('./adaptive-teaching', () => ({
  canExitNeedsDeepening: jest.fn(),
  checkNeedsDeepeningCapacity: jest
    .fn()
    .mockReturnValue({ atCapacity: false, shouldPromote: false }),
}));

jest.mock('./xp', () => ({
  syncXpLedgerStatus: jest.fn().mockResolvedValue(undefined),
}));

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import { processRecallResult, getRetentionStatus } from './retention';
import {
  canExitNeedsDeepening,
  checkNeedsDeepeningCapacity,
} from './adaptive-teaching';
import { syncXpLedgerStatus } from './xp';
import {
  registerProvider,
  createMockProvider,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
} from './llm';
import {
  getSubjectRetention,
  getTopicRetention,
  processRecallTest,
  startRelearn,
  getSubjectNeedsDeepening,
  getTeachingPreference,
  setTeachingPreference,
  deleteTeachingPreference,
  getAnalogyDomain,
  setAnalogyDomain,
  setNativeLanguage,
  updateNeedsDeepeningProgress,
  updateRetentionFromSession,
  evaluateRecallQuality,
  ensureRetentionCard,
  getProfileOverdueCount,
} from './retention-data';

const NOW = new Date('2026-02-15T10:00:00.000Z');
const profileId = 'test-profile-id';
const subjectId = '550e8400-e29b-41d4-a716-446655440000';
const topicId = '770e8400-e29b-41d4-a716-446655440000';
const curriculumId = '660e8400-e29b-41d4-a716-446655440000';

function mockRetentionCardRow(
  overrides?: Partial<{
    topicId: string;
    xpStatus: string;
    nextReviewAt: Date | null;
  }>
) {
  return {
    id: 'card-1',
    profileId,
    topicId: overrides?.topicId ?? topicId,
    easeFactor: '2.50',
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

function createMockDb(options?: {
  retentionCardFindFirstQuery?: ReturnType<typeof mockRetentionCardRow>;
}): Database {
  return {
    query: {
      curricula: {
        findFirst: jest.fn().mockResolvedValue({ id: curriculumId, subjectId }),
      },
      curriculumTopics: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: topicId, curriculumId, title: 'Topic 1' }]),
        findFirst: jest.fn().mockResolvedValue({
          id: topicId,
          curriculumId,
          title: 'Topic 1',
        }),
      },
      retentionCards: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            options?.retentionCardFindFirstQuery ?? mockRetentionCardRow()
          ),
      },
      teachingPreferences: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    },
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => {
          const p = Promise.resolve(undefined);
          (p as Record<string, unknown>).returning = jest
            .fn()
            .mockResolvedValue([{}]);
          return p;
        }),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([]),
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{}]),
        }),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  } as unknown as Database;
}

function setupScopedRepo({
  subjectFindFirst = {
    id: subjectId,
    profileId,
    name: 'Math',
    status: 'active',
  } as unknown,
  retentionCardsFindMany = [] as ReturnType<typeof mockRetentionCardRow>[],
  retentionCardFindFirst = undefined as
    | ReturnType<typeof mockRetentionCardRow>
    | undefined,
  needsDeepeningFindMany = [] as Array<{
    id?: string;
    topicId: string;
    subjectId: string;
    status: string;
    consecutiveSuccessCount: number;
    profileId?: string;
  }>,
} = {}) {
  (createScopedRepository as jest.Mock).mockReturnValue({
    subjects: {
      findFirst: jest.fn().mockResolvedValue(subjectFindFirst),
    },
    retentionCards: {
      findMany: jest.fn().mockResolvedValue(retentionCardsFindMany),
      findFirst: jest.fn().mockResolvedValue(retentionCardFindFirst),
    },
    needsDeepeningTopics: {
      findMany: jest.fn().mockResolvedValue(needsDeepeningFindMany),
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupScopedRepo();
  (checkNeedsDeepeningCapacity as jest.Mock).mockReturnValue({
    atCapacity: false,
    shouldPromote: false,
  });
  // Register a default gemini mock that returns quality '4' for recall tests
  registerProvider(createMockProvider('gemini'));
});

// ---------------------------------------------------------------------------
// getSubjectRetention
// ---------------------------------------------------------------------------

describe('getSubjectRetention', () => {
  it('returns empty when subject not found', async () => {
    setupScopedRepo({ subjectFindFirst: undefined });
    const db = createMockDb();
    const result = await getSubjectRetention(db, profileId, subjectId);
    expect(result.topics).toEqual([]);
    expect(result.reviewDueCount).toBe(0);
  });

  it('returns retention cards for subject topics', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardsFindMany: [card] });
    const db = createMockDb();
    const result = await getSubjectRetention(db, profileId, subjectId);

    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].topicId).toBe(topicId);
    expect(result.topics[0].easeFactor).toBe(2.5);
    expect(result.topics[0].intervalDays).toBe(7);
    expect(result.topics[0].topicTitle).toBe('Topic 1');
  });

  it('counts overdue reviews', async () => {
    const overdueCard = mockRetentionCardRow({
      nextReviewAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    setupScopedRepo({ retentionCardsFindMany: [overdueCard] });
    const db = createMockDb();
    const result = await getSubjectRetention(db, profileId, subjectId);

    expect(result.reviewDueCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getTopicRetention
// ---------------------------------------------------------------------------

describe('getTopicRetention', () => {
  it('returns null when no retention card exists', async () => {
    setupScopedRepo({ retentionCardFindFirst: undefined });
    const db = createMockDb();
    const result = await getTopicRetention(db, profileId, topicId);
    expect(result).toBeNull();
  });

  it('returns mapped retention card', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });
    const db = createMockDb();
    const result = await getTopicRetention(db, profileId, topicId);

    expect(result).not.toBeNull();
    expect(result!.topicId).toBe(topicId);
    expect(result!.repetitions).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// processRecallTest
// ---------------------------------------------------------------------------

describe('processRecallTest', () => {
  it('creates retention card and runs SM-2 when no card exists', async () => {
    setupScopedRepo({ retentionCardFindFirst: undefined });

    // ensureRetentionCard creates a new card — mock the DB to return it
    const newCard = mockRetentionCardRow({
      xpStatus: 'pending',
      nextReviewAt: null,
    });
    // Override: repetitions 0, intervalDays 1 (SM-2 defaults)
    Object.assign(newCard, {
      repetitions: 0,
      intervalDays: 1,
      easeFactor: '2.50',
    });

    const db = createMockDb({ retentionCardFindFirstQuery: newCard });
    // ensureRetentionCard now checks findFirst before inserting
    (db.query.retentionCards.findFirst as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(newCard);

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        failureCount: 0,
        consecutiveSuccesses: 1,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'Some answer text for the recall test',
    });

    // Card was auto-created (insert called by ensureRetentionCard)
    expect(db.insert).toHaveBeenCalled();
    // SM-2 ran on the new card
    expect(processRecallResult).toHaveBeenCalled();
    expect(result.passed).toBe(true);
    expect(result.xpChange).toBe('verified');
    // SM-2 update persisted
    expect(db.update).toHaveBeenCalled();
  });

  it('delegates to processRecallResult when card exists', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 10,
        repetitions: 4,
        failureCount: 0,
        consecutiveSuccesses: 3,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-25T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer:
        'A detailed explanation of photosynthesis and its chemical processes',
    });

    expect(result.passed).toBe(true);
    expect(result.xpChange).toBe('verified');
    expect(processRecallResult).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it('returns failureCount from SM-2 when no card existed (auto-created)', async () => {
    setupScopedRepo({ retentionCardFindFirst: undefined });

    const newCard = mockRetentionCardRow({
      xpStatus: 'pending',
      nextReviewAt: null,
    });
    Object.assign(newCard, {
      repetitions: 0,
      intervalDays: 1,
      easeFactor: '2.50',
    });
    const db = createMockDb({ retentionCardFindFirstQuery: newCard });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        failureCount: 0,
        consecutiveSuccesses: 1,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'Short answer',
    });

    expect(result.failureCount).toBe(0);
  });

  it('returns failureAction feedback_only on early failures', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: false,
      newState: {
        topicId,
        easeFactor: 2.3,
        intervalDays: 1,
        repetitions: 0,
        failureCount: 2,
        consecutiveSuccesses: 0,
        xpStatus: 'decayed',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'decayed',
      failureAction: 'feedback_only',
    });

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'Short',
    });

    expect(result.passed).toBe(false);
    expect(result.failureCount).toBe(2);
    expect(result.failureAction).toBe('feedback_only');
    expect(result.remediation).toBeUndefined();
  });

  it('treats "I don\'t remember" as quality 0 and returns a hint', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: false,
      newState: {
        topicId,
        easeFactor: 2.3,
        intervalDays: 1,
        repetitions: 0,
        failureCount: 1,
        consecutiveSuccesses: 0,
        xpStatus: 'decayed',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'decayed',
      failureAction: 'feedback_only',
    });

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      attemptMode: 'dont_remember',
    });

    expect(processRecallResult).toHaveBeenCalledWith(expect.any(Object), 0);
    expect(result.failureCount).toBe(1);
    expect(result.hint).toContain("That's okay");
  });

  it('returns redirect_to_library with remediation on 3+ failures', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: false,
      newState: {
        topicId,
        easeFactor: 2.1,
        intervalDays: 1,
        repetitions: 0,
        failureCount: 3,
        consecutiveSuccesses: 0,
        xpStatus: 'decayed',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'decayed',
      failureAction: 'redirect_to_library',
    });

    (getRetentionStatus as jest.Mock).mockReturnValue('weak');

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'Short',
    });

    expect(result.passed).toBe(false);
    expect(result.failureCount).toBe(3);
    expect(result.failureAction).toBe('redirect_to_library');
    expect(result.remediation).toBeDefined();
    expect(result.remediation!.action).toBe('redirect_to_library');
    expect(result.remediation!.topicId).toBe(topicId);
    expect(result.remediation!.topicTitle).toBe('Topic 1');
    expect(result.remediation!.retentionStatus).toBe('weak');
    expect(result.remediation!.failureCount).toBe(3);
    expect(result.remediation!.cooldownEndsAt).toBeDefined();
    expect(result.remediation!.options).toEqual([
      'review_and_retest',
      'relearn_topic',
    ]);
    expect(getRetentionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ failureCount: 3 })
    );
  });

  it('persists failureCount: 0 on successful recall (FR52-58 reset)', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 10,
        repetitions: 4,
        failureCount: 0,
        consecutiveSuccesses: 3,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-25T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer:
        'A detailed explanation of photosynthesis and its chemical processes',
    });

    expect(result.passed).toBe(true);
    expect(result.failureCount).toBe(0);

    // Verify the DB update includes failureCount: 0
    const setArg = (db.update as jest.Mock).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setArg.failureCount).toBe(0);
  });

  it('includes topicTitle in remediation from topic lookup', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: false,
      newState: {
        topicId,
        easeFactor: 2.1,
        intervalDays: 1,
        repetitions: 0,
        failureCount: 4,
        consecutiveSuccesses: 0,
        xpStatus: 'decayed',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'decayed',
      failureAction: 'redirect_to_library',
    });

    (getRetentionStatus as jest.Mock).mockReturnValue('forgotten');

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'I have no idea',
    });

    expect(result.remediation).toBeDefined();
    expect(result.remediation!.topicId).toBe(topicId);
    expect(result.remediation!.topicTitle).toBe('Topic 1');
    expect(result.remediation!.action).toBe('redirect_to_library');
    expect(result.remediation!.retentionStatus).toBe('forgotten');
    expect(result.remediation!.failureCount).toBe(4);
  });

  it('includes failureCount in success response', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 10,
        repetitions: 4,
        failureCount: 0,
        consecutiveSuccesses: 3,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-25T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer:
        'A detailed explanation of photosynthesis and its chemical processes',
    });

    expect(result.passed).toBe(true);
    expect(result.failureCount).toBe(0);
    expect(result.failureAction).toBeUndefined();
    expect(result.remediation).toBeUndefined();
  });

  it('calls syncXpLedgerStatus with verified when delayed recall passes', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 10,
        repetitions: 4,
        failureCount: 0,
        consecutiveSuccesses: 3,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-25T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    await processRecallTest(db, profileId, {
      topicId,
      answer: 'Detailed explanation of the topic',
    });

    expect(syncXpLedgerStatus).toHaveBeenCalledWith(
      db,
      profileId,
      topicId,
      'verified'
    );
  });

  it('calls syncXpLedgerStatus with decayed when recall fails with decay', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: false,
      newState: {
        topicId,
        easeFactor: 2.3,
        intervalDays: 1,
        repetitions: 0,
        failureCount: 2,
        consecutiveSuccesses: 0,
        xpStatus: 'decayed',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'decayed',
      failureAction: 'feedback_only',
    });

    const db = createMockDb();
    await processRecallTest(db, profileId, {
      topicId,
      answer: 'Wrong answer',
    });

    expect(syncXpLedgerStatus).toHaveBeenCalledWith(
      db,
      profileId,
      topicId,
      'decayed'
    );
  });

  it('does not call syncXpLedgerStatus when xpChange is none', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        failureCount: 0,
        consecutiveSuccesses: 1,
        xpStatus: 'pending',
        nextReviewAt: '2026-02-16T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'none',
    });

    const db = createMockDb();
    await processRecallTest(db, profileId, {
      topicId,
      answer: 'Some answer for the first recall',
    });

    expect(syncXpLedgerStatus).not.toHaveBeenCalled();
  });

  it('D-02: returns cooldown response when atomic guard rejects update (0 rows)', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 10,
        repetitions: 4,
        failureCount: 0,
        consecutiveSuccesses: 3,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-25T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    // Simulate atomic guard returning 0 rows (concurrent request already claimed)
    const whereMock = jest.fn().mockImplementation(() => {
      const p = Promise.resolve(undefined);
      (p as Record<string, unknown>).returning = jest
        .fn()
        .mockResolvedValue([]); // empty = 0 rows updated
      return p;
    });
    (db.update as jest.Mock).mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: whereMock,
      }),
    });

    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'A detailed answer',
    });

    expect(result.cooldownActive).toBe(true);
    expect(result.cooldownEndsAt).toBeDefined();
    expect(result.passed).toBe(false);
    expect(result.xpChange).toBe('none');
  });

  it('D-02: atomic guard allows update when lastReviewedAt is null (first review)', async () => {
    const card = mockRetentionCardRow();
    // First review — lastReviewedAt is null
    Object.assign(card, { lastReviewedAt: null });
    setupScopedRepo({ retentionCardFindFirst: card });

    (processRecallResult as jest.Mock).mockReturnValue({
      passed: true,
      newState: {
        topicId,
        easeFactor: 2.6,
        intervalDays: 6,
        repetitions: 1,
        failureCount: 0,
        consecutiveSuccesses: 1,
        xpStatus: 'verified',
        nextReviewAt: '2026-02-21T10:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
      },
      xpChange: 'verified',
    });

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'A detailed answer about the topic',
    });

    expect(result.passed).toBe(true);
    expect(result.cooldownActive).toBeUndefined();
    expect(db.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// startRelearn
// ---------------------------------------------------------------------------

describe('startRelearn', () => {
  it('returns relearn confirmation with resetPerformed', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    // Mock session creation with returning
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
      }),
    });

    const result = await startRelearn(db, profileId, {
      topicId,
      method: 'different',
    });

    expect(result.message).toBe('Relearn started');
    expect(result.topicId).toBe(topicId);
    expect(result.method).toBe('different');
    expect(result.resetPerformed).toBe(true);
  });

  it('resets the retention card to initial SM-2 state', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
      }),
    });

    await startRelearn(db, profileId, { topicId, method: 'same' });

    expect(db.update).toHaveBeenCalled();
    const setArg = (db.update as jest.Mock).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setArg.easeFactor).toBe('2.50');
    expect(setArg.intervalDays).toBe(1);
    expect(setArg.repetitions).toBe(0);
    expect(setArg.failureCount).toBe(0);
    expect(setArg.consecutiveSuccesses).toBe(0);
    expect(setArg.xpStatus).toBe('pending');
    expect(setArg.nextReviewAt).toBeNull();
    expect(setArg.lastReviewedAt).toBeNull();
  });

  it('creates a new learning session linked to topic', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'new-session-123' }]),
      }),
    });

    const result = await startRelearn(db, profileId, {
      topicId,
      method: 'same',
    });

    expect(result.sessionId).toBe('new-session-123');
    expect(db.insert).toHaveBeenCalled();
  });

  it('includes preferredMethod when method is different', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
      }),
    });

    const result = await startRelearn(db, profileId, {
      topicId,
      method: 'different',
      preferredMethod: 'I learn better with visual examples',
    });

    expect(result.method).toBe('different');
    expect(result.preferredMethod).toBe('I learn better with visual examples');
  });

  it('does not include preferredMethod when method is same', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
      }),
    });

    const result = await startRelearn(db, profileId, {
      topicId,
      method: 'same',
    });

    expect(result.method).toBe('same');
    expect(result.preferredMethod).toBeUndefined();
  });

  it('marks topic as needs-deepening when not already active', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();

    // Track insert calls: first = needsDeepening, second = learningSessions
    const insertCallArgs: unknown[] = [];
    (db.insert as jest.Mock).mockImplementation((table) => {
      insertCallArgs.push(table);
      return {
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
        }),
      };
    });

    await startRelearn(db, profileId, { topicId, method: 'same' });

    // Should have 2 insert calls: needsDeepening + learningSessions
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('skips needs-deepening insert when already active', async () => {
    setupScopedRepo({
      needsDeepeningFindMany: [
        {
          id: 'nd-1',
          topicId,
          subjectId,
          status: 'active',
          consecutiveSuccessCount: 1,
          profileId,
        },
      ],
    });
    const db = createMockDb();
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
      }),
    });

    await startRelearn(db, profileId, { topicId, method: 'same' });

    // Only 1 insert call: learningSessions (no needsDeepening insert)
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('includes prior teaching preference when method is same', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    (db.query.teachingPreferences.findFirst as jest.Mock).mockResolvedValue({
      id: 'pref-1',
      profileId,
      subjectId,
      method: 'visual_diagrams',
      analogyDomain: null,
      nativeLanguage: null,
    });
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'session-new' }]),
      }),
    });

    const result = await startRelearn(db, profileId, {
      topicId,
      method: 'same',
    });

    expect(result.method).toBe('same');
    expect(result.preferredMethod).toBe('visual_diagrams');
  });
});

// ---------------------------------------------------------------------------
// getSubjectNeedsDeepening
// ---------------------------------------------------------------------------

describe('getSubjectNeedsDeepening', () => {
  it('returns empty when no deepening topics', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    const result = await getSubjectNeedsDeepening(db, profileId, subjectId);
    expect(result.topics).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('returns active deepening topics', async () => {
    setupScopedRepo({
      needsDeepeningFindMany: [
        { topicId, subjectId, status: 'active', consecutiveSuccessCount: 0 },
      ],
    });
    const db = createMockDb();
    const result = await getSubjectNeedsDeepening(db, profileId, subjectId);

    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].topicId).toBe(topicId);
    expect(result.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Teaching preference
// ---------------------------------------------------------------------------

describe('getTeachingPreference', () => {
  it('returns null when no preference exists', async () => {
    const db = createMockDb();
    const result = await getTeachingPreference(db, profileId, subjectId);
    expect(result).toBeNull();
  });

  it('returns preference when it exists', async () => {
    const db = createMockDb();
    (db.query.teachingPreferences.findFirst as jest.Mock).mockResolvedValue({
      id: 'pref-1',
      profileId,
      subjectId,
      method: 'visual_diagrams',
    });
    const result = await getTeachingPreference(db, profileId, subjectId);
    expect(result).toEqual({
      subjectId,
      method: 'visual_diagrams',
      analogyDomain: null,
      nativeLanguage: null,
    });
  });
});

describe('setTeachingPreference', () => {
  it('upserts new preference via INSERT ON CONFLICT DO UPDATE', async () => {
    const db = createMockDb();
    const result = await setTeachingPreference(
      db,
      profileId,
      subjectId,
      'step_by_step'
    );
    expect(result).toEqual({
      subjectId,
      method: 'step_by_step',
      analogyDomain: null,
      nativeLanguage: null,
    });
    // Uses atomic upsert, not separate findFirst + insert/update
    expect(db.insert).toHaveBeenCalled();
  });

  it('upserts preference with analogyDomain', async () => {
    const db = createMockDb();
    // Mock .returning() to echo back what the DB would return after upsert
    const returningMock = jest
      .fn()
      .mockResolvedValue([
        { method: 'step_by_step', analogyDomain: 'cooking' },
      ]);
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: returningMock,
        }),
      }),
    });
    const result = await setTeachingPreference(
      db,
      profileId,
      subjectId,
      'step_by_step',
      'cooking'
    );
    expect(result).toEqual({
      subjectId,
      method: 'step_by_step',
      analogyDomain: 'cooking',
      nativeLanguage: null,
    });
  });

  it('clears analogyDomain when null passed', async () => {
    const db = createMockDb();
    const returningMock = jest
      .fn()
      .mockResolvedValue([{ method: 'visual_diagrams', analogyDomain: null }]);
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: returningMock,
        }),
      }),
    });
    const result = await setTeachingPreference(
      db,
      profileId,
      subjectId,
      'visual_diagrams',
      null
    );
    expect(result).toEqual({
      subjectId,
      method: 'visual_diagrams',
      analogyDomain: null,
      nativeLanguage: null,
    });
  });

  it('reads back existing analogyDomain via .returning() when not provided in upsert', async () => {
    const db = createMockDb();
    // .returning() returns the full row including the existing analogyDomain
    // that wasn't changed by this upsert — this is the atomic read-back
    const returningMock = jest
      .fn()
      .mockResolvedValue([{ method: 'step_by_step', analogyDomain: 'sports' }]);
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: returningMock,
        }),
      }),
    });
    const result = await setTeachingPreference(
      db,
      profileId,
      subjectId,
      'step_by_step'
      // analogyDomain not passed — .returning() reads back existing value atomically
    );
    expect(result).toEqual({
      subjectId,
      method: 'step_by_step',
      analogyDomain: 'sports',
      nativeLanguage: null,
    });
  });

  it('rejects writes for subjects outside the caller scope', async () => {
    setupScopedRepo({ subjectFindFirst: null as unknown });
    const db = createMockDb();

    await expect(
      setTeachingPreference(db, profileId, subjectId, 'step_by_step')
    ).rejects.toThrow('Subject not found');

    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('deleteTeachingPreference', () => {
  it('calls delete on DB', async () => {
    const db = createMockDb();
    await deleteTeachingPreference(db, profileId, subjectId);
    expect(db.delete).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getAnalogyDomain / setAnalogyDomain (FR134-137)
// ---------------------------------------------------------------------------

describe('getAnalogyDomain', () => {
  it('returns null when no preference exists', async () => {
    const db = createMockDb();
    const result = await getAnalogyDomain(db, profileId, subjectId);
    expect(result).toBeNull();
  });

  it('returns analogy domain when set', async () => {
    const db = createMockDb();
    (db.query.teachingPreferences.findFirst as jest.Mock).mockResolvedValue({
      id: 'pref-1',
      profileId,
      subjectId,
      method: 'step_by_step',
      analogyDomain: 'cooking',
    });
    const result = await getAnalogyDomain(db, profileId, subjectId);
    expect(result).toBe('cooking');
  });

  it('returns null when preference exists but no analogy domain', async () => {
    const db = createMockDb();
    (db.query.teachingPreferences.findFirst as jest.Mock).mockResolvedValue({
      id: 'pref-1',
      profileId,
      subjectId,
      method: 'step_by_step',
      analogyDomain: null,
    });
    const result = await getAnalogyDomain(db, profileId, subjectId);
    expect(result).toBeNull();
  });
});

describe('setAnalogyDomain', () => {
  it('upserts preference with default method via INSERT ON CONFLICT DO UPDATE', async () => {
    const db = createMockDb();
    const result = await setAnalogyDomain(db, profileId, subjectId, 'sports');
    expect(result).toBe('sports');
    expect(db.insert).toHaveBeenCalled();
  });

  it('upserts analogy domain for existing preference', async () => {
    const db = createMockDb();
    const result = await setAnalogyDomain(db, profileId, subjectId, 'gaming');
    expect(result).toBe('gaming');
    // Uses atomic upsert — single insert with onConflictDoUpdate
    expect(db.insert).toHaveBeenCalled();
  });

  it('clears analogy domain when null passed', async () => {
    const db = createMockDb();
    const result = await setAnalogyDomain(db, profileId, subjectId, null);
    expect(result).toBeNull();
    expect(db.insert).toHaveBeenCalled();
  });

  it('rejects writes for subjects outside the caller scope', async () => {
    setupScopedRepo({ subjectFindFirst: null as unknown });
    const db = createMockDb();

    await expect(
      setAnalogyDomain(db, profileId, subjectId, 'sports')
    ).rejects.toThrow('Subject not found');

    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('setNativeLanguage', () => {
  it('upserts native language for an owned subject', async () => {
    setupScopedRepo();
    const db = createMockDb();

    const result = await setNativeLanguage(db, profileId, subjectId, 'en');

    expect(result).toBe('en');
    expect(db.insert).toHaveBeenCalled();
  });

  it('rejects writes for subjects outside the caller scope', async () => {
    setupScopedRepo({ subjectFindFirst: null as unknown });
    const db = createMockDb();

    await expect(
      setNativeLanguage(db, profileId, subjectId, 'en')
    ).rejects.toThrow('Subject not found');

    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateNeedsDeepeningProgress
// ---------------------------------------------------------------------------

describe('updateNeedsDeepeningProgress', () => {
  it('increments consecutiveSuccessCount when quality >= 3', async () => {
    setupScopedRepo({
      needsDeepeningFindMany: [
        {
          id: 'nd-1',
          topicId,
          subjectId,
          status: 'active',
          consecutiveSuccessCount: 1,
          profileId,
        },
      ],
    });
    (canExitNeedsDeepening as jest.Mock).mockReturnValue(false);

    const db = createMockDb();
    await updateNeedsDeepeningProgress(db, profileId, topicId, 3);

    expect(db.update).toHaveBeenCalled();
    const setArg = (db.update as jest.Mock).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setArg.consecutiveSuccessCount).toBe(2);
    expect(setArg.status).toBe('active');
  });

  it('resets consecutiveSuccessCount to 0 when quality < 3', async () => {
    setupScopedRepo({
      needsDeepeningFindMany: [
        {
          id: 'nd-1',
          topicId,
          subjectId,
          status: 'active',
          consecutiveSuccessCount: 2,
          profileId,
        },
      ],
    });
    (canExitNeedsDeepening as jest.Mock).mockReturnValue(false);

    const db = createMockDb();
    await updateNeedsDeepeningProgress(db, profileId, topicId, 2);

    expect(db.update).toHaveBeenCalled();
    const setArg = (db.update as jest.Mock).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setArg.consecutiveSuccessCount).toBe(0);
    expect(setArg.status).toBe('active');
  });

  it('resolves needs-deepening when count reaches 3', async () => {
    setupScopedRepo({
      needsDeepeningFindMany: [
        {
          id: 'nd-1',
          topicId,
          subjectId,
          status: 'active',
          consecutiveSuccessCount: 2,
          profileId,
        },
      ],
    });
    (canExitNeedsDeepening as jest.Mock).mockReturnValue(true);

    const db = createMockDb();
    await updateNeedsDeepeningProgress(db, profileId, topicId, 4);

    expect(db.update).toHaveBeenCalled();
    const setArg = (db.update as jest.Mock).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setArg.consecutiveSuccessCount).toBe(3);
    expect(setArg.status).toBe('resolved');
    expect(canExitNeedsDeepening).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId,
        subjectId,
        consecutiveSuccessCount: 3,
        status: 'active',
      })
    );
  });

  it('skips when no active needs-deepening record exists', async () => {
    setupScopedRepo({
      needsDeepeningFindMany: [
        {
          id: 'nd-1',
          topicId,
          subjectId,
          status: 'resolved',
          consecutiveSuccessCount: 3,
          profileId,
        },
      ],
    });

    const db = createMockDb();
    await updateNeedsDeepeningProgress(db, profileId, topicId, 4);

    expect(db.update).not.toHaveBeenCalled();
  });

  it('skips when topicId is null', async () => {
    setupScopedRepo();

    const db = createMockDb();
    await updateNeedsDeepeningProgress(db, profileId, null, 4);

    expect(createScopedRepository).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateRetentionFromSession
// ---------------------------------------------------------------------------

describe('updateRetentionFromSession', () => {
  it('creates card when missing and runs SM-2', async () => {
    setupScopedRepo({ retentionCardFindFirst: undefined });

    const newCard = mockRetentionCardRow({
      xpStatus: 'pending',
      nextReviewAt: null,
    });
    Object.assign(newCard, {
      repetitions: 0,
      intervalDays: 1,
      easeFactor: '2.50',
    });

    const db = createMockDb({ retentionCardFindFirstQuery: newCard });
    (db.query.retentionCards.findFirst as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(newCard);

    await updateRetentionFromSession(db, profileId, topicId, 4);

    // Card was auto-created
    expect(db.insert).toHaveBeenCalled();
    // SM-2 update was persisted
    expect(db.update).toHaveBeenCalled();
  });

  it('uses existing card when present', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    const db = createMockDb();

    await updateRetentionFromSession(db, profileId, topicId, 3);

    // No insert needed for existing card
    expect(db.insert).not.toHaveBeenCalled();
    // SM-2 update was persisted
    expect(db.update).toHaveBeenCalled();
  });

  it('skips SM-2 when card.updatedAt >= sessionTimestamp', async () => {
    // Card was updated at 11:00, session started at 10:00
    const card = mockRetentionCardRow();
    card.updatedAt = new Date('2026-02-15T11:00:00.000Z');
    setupScopedRepo({ retentionCardFindFirst: card });

    const db = createMockDb();

    await updateRetentionFromSession(
      db,
      profileId,
      topicId,
      4,
      '2026-02-15T10:00:00.000Z'
    );

    // SM-2 should NOT run — card was already updated after session started
    expect(db.update).not.toHaveBeenCalled();
  });

  it('runs SM-2 when card.updatedAt < sessionTimestamp', async () => {
    // Card was updated at 09:00, session started at 10:00
    const card = mockRetentionCardRow();
    card.updatedAt = new Date('2026-02-15T09:00:00.000Z');
    setupScopedRepo({ retentionCardFindFirst: card });

    const db = createMockDb();

    await updateRetentionFromSession(
      db,
      profileId,
      topicId,
      4,
      '2026-02-15T10:00:00.000Z'
    );

    // SM-2 should run — card was last updated before the session
    expect(db.update).toHaveBeenCalled();
  });

  it('runs SM-2 when sessionTimestamp not provided (backward compat)', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    const db = createMockDb();

    await updateRetentionFromSession(db, profileId, topicId, 4);

    // SM-2 should run — no timestamp means no guard
    expect(db.update).toHaveBeenCalled();
  });

  it('F-7: logs warning when optimistic lock conflict is detected (0 rows returned)', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    const db = createMockDb();
    // Simulate another writer updating the card between our read and write —
    // the WHERE clause matches 0 rows so .returning() returns an empty array.
    (db.update as jest.Mock).mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => {
          const p = Promise.resolve(undefined);
          (p as Record<string, unknown>).returning = jest
            .fn()
            .mockResolvedValue([]); // 0 rows = optimistic lock conflict
          return p;
        }),
      }),
    });

    const warnSpy = jest.spyOn(console, 'warn').mockReturnValue(undefined);
    try {
      await updateRetentionFromSession(db, profileId, topicId, 4);
      // The update was attempted but matched 0 rows
      expect(db.update).toHaveBeenCalled();
      // Warning must have been emitted for the conflict
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Optimistic lock conflict')
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('F-7: no warning when update succeeds (1 row returned)', async () => {
    const card = mockRetentionCardRow();
    setupScopedRepo({ retentionCardFindFirst: card });

    // Default mock already returns [{}] — 1 row updated successfully
    const db = createMockDb();

    const warnSpy = jest.spyOn(console, 'warn').mockReturnValue(undefined);
    try {
      await updateRetentionFromSession(db, profileId, topicId, 4);

      expect(db.update).toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// ensureRetentionCard
// ---------------------------------------------------------------------------

describe('ensureRetentionCard', () => {
  it('is idempotent — returns existing card without inserting', async () => {
    const existingCard = mockRetentionCardRow();
    const db = createMockDb({ retentionCardFindFirstQuery: existingCard });

    const result = await ensureRetentionCard(db, profileId, topicId);

    expect(db.insert).not.toHaveBeenCalled();
    expect(result.card.topicId).toBe(topicId);
    expect(result.card.profileId).toBe(profileId);
    expect(result.isNew).toBe(false);
  });

  it('returns the card after insertion', async () => {
    const newCard = mockRetentionCardRow({ xpStatus: 'pending' });
    Object.assign(newCard, { repetitions: 0 });
    const db = createMockDb({ retentionCardFindFirstQuery: newCard });
    (db.query.retentionCards.findFirst as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(newCard);

    const result = await ensureRetentionCard(db, profileId, topicId);

    expect(result).toBeDefined();
    expect(result.card.topicId).toBe(topicId);
    expect(result.isNew).toBe(true);
    expect(db.insert).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// evaluateRecallQuality
// ---------------------------------------------------------------------------

describe('evaluateRecallQuality', () => {
  afterEach(() => {
    registerProvider(createMockProvider('gemini'));
  });

  it('returns parsed SM-2 quality from LLM response', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(
        _messages: ChatMessage[],
        _config: ModelConfig
      ): Promise<string> {
        return '4';
      },
      async *chatStream(): AsyncIterable<string> {
        yield '4';
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality(
      'A thorough explanation of photosynthesis involving chlorophyll and light reactions',
      'Photosynthesis'
    );
    expect(result).toBe(4);
  });

  it('handles quality 0 (blackout)', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return '0';
      },
      async *chatStream(): AsyncIterable<string> {
        yield '0';
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('', 'Photosynthesis');
    expect(result).toBe(0);
  });

  it('handles quality 5 (perfect)', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return '5';
      },
      async *chatStream(): AsyncIterable<string> {
        yield '5';
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality(
      'Complete and perfect explanation of the topic',
      'Topic'
    );
    expect(result).toBe(5);
  });

  it('falls back to length heuristic on unparseable LLM response', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return 'I think the answer is good';
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'good';
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('A'.repeat(60), 'Topic');
    expect(result).toBe(3); // Mid-length answer -> fallback quality 3
  });

  it('falls back to short-answer heuristic on unparseable LLM response', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return 'not a number';
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'not a number';
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('idk', 'Topic');
    expect(result).toBe(2); // Short answer -> fallback quality 2
  });

  it('falls back to length heuristic on LLM error', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        throw new Error('LLM unavailable');
      },
      async *chatStream(): AsyncIterable<string> {
        yield '';
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('idk', 'Topic');
    expect(result).toBe(2); // Short answer -> fallback quality 2
  });

  it('falls back for long answer on LLM error', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        throw new Error('LLM unavailable');
      },
      async *chatStream(): AsyncIterable<string> {
        yield '';
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('A'.repeat(60), 'Topic');
    expect(result).toBe(3); // Mid-length answer -> fallback quality 3
  });

  it('clamps out-of-range values to fallback', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return '7';
      },
      async *chatStream(): AsyncIterable<string> {
        yield '7';
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('A'.repeat(60), 'Topic');
    expect(result).toBe(3); // Fallback for mid-length answer
  });

  it('clamps negative values to fallback', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return '-1';
      },
      async *chatStream(): AsyncIterable<string> {
        yield '-1';
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality('short', 'Topic');
    expect(result).toBe(2); // Fallback for short answer
  });

  it('handles LLM response with whitespace', async () => {
    const provider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return '  3  \n';
      },
      async *chatStream(): AsyncIterable<string> {
        yield '3';
      },
    };
    registerProvider(provider);

    const result = await evaluateRecallQuality(
      'Some answer about the topic',
      'Topic'
    );
    expect(result).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getProfileOverdueCount
// ---------------------------------------------------------------------------

describe('getProfileOverdueCount', () => {
  it('returns correct count and top topic IDs with nextReviewTopic', async () => {
    const now = new Date();
    const overduePast = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const overdueRecent = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago

    const mockRepo = {
      retentionCards: {
        findMany: jest.fn().mockResolvedValue([
          { topicId: 'topic-old', nextReviewAt: overduePast },
          { topicId: 'topic-recent', nextReviewAt: overdueRecent },
        ]),
      },
      subjects: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'subject-1', name: 'Math' }),
      },
    };
    (createScopedRepository as jest.Mock).mockReturnValue(mockRepo);

    const selectChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    const db = {
      select: jest.fn().mockReturnValue(selectChain),
      query: {
        curriculumTopics: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'topic-old',
            curriculumId: 'curr-1',
            title: 'Algebra Basics',
          }),
        },
        curricula: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'curr-1', subjectId: 'subject-1' }),
        },
      },
    } as unknown as Database;

    const { overdueCount, topTopicIds, nextReviewTopic } =
      await getProfileOverdueCount(db, 'profile-1');

    expect(overdueCount).toBe(2);
    // Most overdue first
    expect(topTopicIds[0]).toBe('topic-old');
    expect(topTopicIds[1]).toBe('topic-recent');
    expect(nextReviewTopic).toEqual({
      topicId: 'topic-old',
      subjectId: 'subject-1',
      subjectName: 'Math',
      topicTitle: 'Algebra Basics',
    });
  });

  it('returns empty state when no overdue cards', async () => {
    const mockRepo = {
      retentionCards: { findMany: jest.fn().mockResolvedValue([]) },
    };
    (createScopedRepository as jest.Mock).mockReturnValue(mockRepo);

    const selectChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    const db = {
      select: jest.fn().mockReturnValue(selectChain),
    } as unknown as Database;
    const result = await getProfileOverdueCount(db, 'profile-1');

    expect(result.overdueCount).toBe(0);
    expect(result.topTopicIds).toHaveLength(0);
    expect(result.nextReviewTopic).toBeNull();
  });
});
