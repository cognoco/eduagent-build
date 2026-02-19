jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    createScopedRepository: jest.fn(),
  };
});

jest.mock('./retention', () => ({
  processRecallResult: jest.fn(),
}));

jest.mock('./adaptive-teaching', () => ({
  canExitNeedsDeepening: jest.fn(),
}));

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import { processRecallResult } from './retention';
import { canExitNeedsDeepening } from './adaptive-teaching';
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
});

// ---------------------------------------------------------------------------
// startRelearn
// ---------------------------------------------------------------------------

describe('startRelearn', () => {
  it('returns relearn confirmation', async () => {
    setupScopedRepo({ needsDeepeningFindMany: [] });
    const db = createMockDb();
    const result = await startRelearn(db, profileId, {
      topicId,
      method: 'different',
    });

    expect(result.message).toBe('Relearn started');
    expect(result.topicId).toBe(topicId);
    expect(result.method).toBe('different');
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
