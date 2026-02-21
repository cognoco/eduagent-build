jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    createScopedRepository: jest.fn(),
  };
});

jest.mock('./retention', () => ({
  processRecallResult: jest.fn(),
  getRetentionStatus: jest.fn().mockReturnValue('weak'),
}));

jest.mock('./adaptive-teaching', () => ({
  canExitNeedsDeepening: jest.fn(),
}));

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import { processRecallResult, getRetentionStatus } from './retention';
import { canExitNeedsDeepening } from './adaptive-teaching';
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
  updateNeedsDeepeningProgress,
  evaluateRecallQuality,
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

function createMockDb(): Database {
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
      teachingPreferences: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    },
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([]),
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
  it('returns default result when no retention card exists', async () => {
    setupScopedRepo({ retentionCardFindFirst: undefined });
    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'Some answer text for the recall test',
    });

    expect(result.passed).toBe(true);
    expect(result.masteryScore).toBe(0.75);
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

  it('returns failureCount: 0 when no retention card exists', async () => {
    setupScopedRepo({ retentionCardFindFirst: undefined });
    const db = createMockDb();
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

  it('returns redirect_to_learning_book with remediation on 3+ failures', async () => {
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
      failureAction: 'redirect_to_learning_book',
    });

    (getRetentionStatus as jest.Mock).mockReturnValue('weak');

    const db = createMockDb();
    const result = await processRecallTest(db, profileId, {
      topicId,
      answer: 'Short',
    });

    expect(result.passed).toBe(false);
    expect(result.failureCount).toBe(3);
    expect(result.failureAction).toBe('redirect_to_learning_book');
    expect(result.remediation).toBeDefined();
    expect(result.remediation!.action).toBe('redirect_to_learning_book');
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
      failureAction: 'redirect_to_learning_book',
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
    expect(result.remediation!.action).toBe('redirect_to_learning_book');
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
    expect(result).toEqual({ subjectId, method: 'visual_diagrams' });
  });
});

describe('setTeachingPreference', () => {
  it('inserts new preference', async () => {
    const db = createMockDb();
    const result = await setTeachingPreference(
      db,
      profileId,
      subjectId,
      'step_by_step'
    );
    expect(result).toEqual({ subjectId, method: 'step_by_step' });
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
    expect(result).toBe(4); // Long answer -> fallback quality 4
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
    expect(result).toBe(4); // Long answer -> fallback quality 4
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
    expect(result).toBe(4); // Fallback for long answer
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
