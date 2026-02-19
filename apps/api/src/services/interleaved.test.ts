// ---------------------------------------------------------------------------
// Interleaved Retrieval Sessions — Tests
// ---------------------------------------------------------------------------

import { STABILITY_THRESHOLD } from './retention';

// Mock database
const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockInsert = jest.fn();
const mockReturning = jest.fn();

jest.mock('@eduagent/database', () => ({
  createScopedRepository: jest.fn(() => ({
    retentionCards: { findMany: mockFindMany },
  })),
  retentionCards: { topicId: 'topicId', profileId: 'profileId' },
  curriculumTopics: { id: 'id', curriculumId: 'curriculumId' },
  curricula: { id: 'id', subjectId: 'subjectId' },
  learningSessions: {},
}));

import {
  selectInterleavedTopics,
  startInterleavedSession,
} from './interleaved';

const PROFILE_ID = 'profile-001';

function createMockCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-001',
    profileId: PROFILE_ID,
    topicId: 'topic-001',
    easeFactor: '2.50',
    intervalDays: 1,
    repetitions: 1,
    lastReviewedAt: new Date('2026-02-10'),
    nextReviewAt: new Date('2026-02-11'), // past = due
    failureCount: 0,
    consecutiveSuccesses: 0,
    xpStatus: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockDb(overrides: Record<string, unknown> = {}): any {
  return {
    query: {
      curricula: {
        findFirst: mockFindFirst,
      },
      curriculumTopics: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'topic-001',
          curriculumId: 'curriculum-001',
          title: 'Algebra Basics',
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'topic-001', curriculumId: 'curriculum-001' },
          { id: 'topic-002', curriculumId: 'curriculum-001' },
        ]),
      },
    },
    insert: mockInsert.mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: mockReturning,
      }),
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selectInterleavedTopics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns due topics', async () => {
    const dueCards = [
      createMockCard({
        id: 'c1',
        topicId: 'topic-001',
        nextReviewAt: new Date('2026-02-10'),
      }),
      createMockCard({
        id: 'c2',
        topicId: 'topic-002',
        nextReviewAt: new Date('2026-02-12'),
      }),
      createMockCard({
        id: 'c3',
        topicId: 'topic-003',
        nextReviewAt: new Date('2026-02-15'),
      }),
    ];
    mockFindMany.mockResolvedValue(dueCards);

    const db = createMockDb();
    db.query.curriculumTopics.findFirst = jest.fn().mockResolvedValue({
      id: 'topic-001',
      curriculumId: 'curriculum-001',
      title: 'Test Topic',
    });
    db.query.curricula.findFirst = jest.fn().mockResolvedValue({
      id: 'curriculum-001',
      subjectId: 'subject-001',
    });

    const topics = await selectInterleavedTopics(db, PROFILE_ID, {
      topicCount: 3,
    });

    expect(topics).toHaveLength(3);
    // All due topics should be present
    const topicIds = topics.map((t) => t.topicId);
    expect(topicIds).toEqual(
      expect.arrayContaining(['topic-001', 'topic-002', 'topic-003'])
    );
  });

  it('returns empty array when no retention cards exist', async () => {
    mockFindMany.mockResolvedValue([]);

    const db = createMockDb();
    const topics = await selectInterleavedTopics(db, PROFILE_ID);

    expect(topics).toEqual([]);
  });

  it('pads with not-yet-due topics when fewer than topicCount are due', async () => {
    const cards = [
      createMockCard({
        id: 'c1',
        topicId: 'topic-001',
        nextReviewAt: new Date('2026-02-10'), // due (past)
      }),
      createMockCard({
        id: 'c2',
        topicId: 'topic-002',
        nextReviewAt: new Date('2099-01-01'), // not due (future)
      }),
      createMockCard({
        id: 'c3',
        topicId: 'topic-003',
        nextReviewAt: new Date('2099-06-01'), // not due (future)
      }),
    ];
    mockFindMany.mockResolvedValue(cards);

    const db = createMockDb();
    db.query.curriculumTopics.findFirst = jest.fn().mockResolvedValue({
      id: 'topic-001',
      curriculumId: 'curriculum-001',
      title: 'Test Topic',
    });
    db.query.curricula.findFirst = jest.fn().mockResolvedValue({
      id: 'curriculum-001',
      subjectId: 'subject-001',
    });

    const topics = await selectInterleavedTopics(db, PROFILE_ID, {
      topicCount: 3,
    });

    expect(topics).toHaveLength(3);
  });

  it('filters to a specific subject when subjectId is provided', async () => {
    const allCards = [
      createMockCard({
        id: 'c1',
        topicId: 'topic-001',
        nextReviewAt: new Date('2026-02-10'),
      }),
      createMockCard({
        id: 'c2',
        topicId: 'topic-999',
        nextReviewAt: new Date('2026-02-10'),
      }),
    ];
    mockFindMany.mockResolvedValue(allCards);

    const db = createMockDb();
    db.query.curricula.findFirst = jest.fn().mockResolvedValue({
      id: 'curriculum-001',
      subjectId: 'subject-001',
    });
    db.query.curriculumTopics.findMany = jest.fn().mockResolvedValue([
      { id: 'topic-001', curriculumId: 'curriculum-001' },
      // topic-999 is NOT in this subject
    ]);
    db.query.curriculumTopics.findFirst = jest.fn().mockResolvedValue({
      id: 'topic-001',
      curriculumId: 'curriculum-001',
      title: 'Algebra Basics',
    });

    const topics = await selectInterleavedTopics(db, PROFILE_ID, {
      subjectId: 'subject-001',
      topicCount: 5,
    });

    expect(topics).toHaveLength(1);
    expect(topics[0].topicId).toBe('topic-001');
  });

  it('returns empty when subject has no curriculum', async () => {
    mockFindMany.mockResolvedValue([createMockCard({ topicId: 'topic-001' })]);

    const db = createMockDb();
    db.query.curricula.findFirst = jest.fn().mockResolvedValue(null);

    const topics = await selectInterleavedTopics(db, PROFILE_ID, {
      subjectId: 'nonexistent-subject',
      topicCount: 5,
    });

    expect(topics).toEqual([]);
  });

  it('includes stability information on returned topics', async () => {
    const cards = [
      createMockCard({
        id: 'c1',
        topicId: 'topic-001',
        consecutiveSuccesses: STABILITY_THRESHOLD,
        nextReviewAt: new Date('2026-02-10'),
      }),
      createMockCard({
        id: 'c2',
        topicId: 'topic-002',
        consecutiveSuccesses: STABILITY_THRESHOLD - 1,
        nextReviewAt: new Date('2026-02-10'),
      }),
    ];
    mockFindMany.mockResolvedValue(cards);

    const db = createMockDb();
    db.query.curriculumTopics.findFirst = jest.fn().mockResolvedValue({
      id: 'topic-001',
      curriculumId: 'curriculum-001',
      title: 'Test Topic',
    });
    db.query.curricula.findFirst = jest.fn().mockResolvedValue({
      id: 'curriculum-001',
      subjectId: 'subject-001',
    });

    const topics = await selectInterleavedTopics(db, PROFILE_ID, {
      topicCount: 2,
    });

    const stableTopic = topics.find((t) => t.topicId === 'topic-001');
    const unstableTopic = topics.find((t) => t.topicId === 'topic-002');

    expect(stableTopic?.isStable).toBe(true);
    expect(unstableTopic?.isStable).toBe(false);
  });
});

describe('startInterleavedSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a session and returns topics', async () => {
    const cards = [
      createMockCard({
        id: 'c1',
        topicId: 'topic-001',
        nextReviewAt: new Date('2026-02-10'),
      }),
    ];
    mockFindMany.mockResolvedValue(cards);

    const sessionRow = {
      id: 'session-001',
      profileId: PROFILE_ID,
      subjectId: 'subject-001',
      topicId: 'topic-001',
      sessionType: 'interleaved',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      endedAt: null,
      durationSeconds: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockReturning.mockResolvedValue([sessionRow]);

    const db = createMockDb();
    db.query.curriculumTopics.findFirst = jest.fn().mockResolvedValue({
      id: 'topic-001',
      curriculumId: 'curriculum-001',
      title: 'Algebra Basics',
    });
    db.query.curricula.findFirst = jest.fn().mockResolvedValue({
      id: 'curriculum-001',
      subjectId: 'subject-001',
    });

    const result = await startInterleavedSession(db, PROFILE_ID);

    expect(result.sessionId).toBe('session-001');
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].topicId).toBe('topic-001');
    expect(mockInsert).toHaveBeenCalled();
  });

  it('throws when no topics are available', async () => {
    mockFindMany.mockResolvedValue([]);

    const db = createMockDb();

    await expect(startInterleavedSession(db, PROFILE_ID)).rejects.toThrow(
      'No topics available for interleaved retrieval'
    );
  });
});
