// ---------------------------------------------------------------------------
// Interleaved Retrieval Sessions — Tests
// ---------------------------------------------------------------------------

import { STABILITY_THRESHOLD } from './retention';
import { createDatabaseModuleMock } from '../test-utils/database-module';

// Mock database
const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockSubjectsFindFirst = jest.fn();
const mockInsert = jest.fn();
const mockReturning = jest.fn();

const mockDatabaseModule = createDatabaseModuleMock({
  exports: {
    createScopedRepository: jest.fn(() => ({
      retentionCards: { findMany: mockFindMany },
      subjects: { findFirst: mockSubjectsFindFirst },
    })),
    retentionCards: { topicId: 'topicId', profileId: 'profileId' },
    curriculumBooks: { id: 'id', subjectId: 'subjectId' },
    curriculumTopics: {
      id: 'id',
      curriculumId: 'curriculumId',
      bookId: 'bookId',
      title: 'title',
    },
    curricula: { id: 'id', subjectId: 'subjectId' },
    subjects: { id: 'id', profileId: 'profileId' },
    learningSessions: {},
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: service unit test — db boundary mocked; real DB covered by sibling .integration.test.ts where present */,
  () => mockDatabaseModule.module,
);

import {
  selectInterleavedTopics,
  startInterleavedSession,
  type InterleavedTopic,
  NoInterleavedTopicsError,
} from './interleaved';

const PROFILE_ID = 'profile-001';

function createMockCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-001',
    profileId: PROFILE_ID,
    topicId: 'topic-001',
    easeFactor: 2.5,
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
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'curriculum-001', subjectId: 'subject-001' },
          ]),
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
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([
                {
                  topicId: 'topic-001',
                  topicTitle: 'Algebra Basics',
                  curriculumId: 'curriculum-001',
                  subjectId: 'subject-001',
                },
                {
                  topicId: 'topic-002',
                  topicTitle: 'Geometry Basics',
                  curriculumId: 'curriculum-001',
                  subjectId: 'subject-001',
                },
                {
                  topicId: 'topic-003',
                  topicTitle: 'Calculus Basics',
                  curriculumId: 'curriculum-001',
                  subjectId: 'subject-001',
                },
              ]),
            }),
          }),
        }),
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
    db.query.curricula.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'curriculum-001', subjectId: 'subject-001' }]);

    const topics = await selectInterleavedTopics(db, PROFILE_ID, {
      topicCount: 3,
    });

    expect(topics).toHaveLength(3);
    // All due topics should be present
    const topicIds = topics.map((t: InterleavedTopic) => t.topicId);
    expect(topicIds).toEqual(
      expect.arrayContaining(['topic-001', 'topic-002', 'topic-003']),
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
    db.query.curricula.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'curriculum-001', subjectId: 'subject-001' }]);

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
    mockSubjectsFindFirst.mockResolvedValue({
      id: 'subject-001',
      profileId: PROFILE_ID,
    });

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
    expect(topics[0]!.topicId).toBe('topic-001');
  });

  it('returns empty when subject has no curriculum', async () => {
    mockFindMany.mockResolvedValue([createMockCard({ topicId: 'topic-001' })]);
    // Subject is owned by the caller — ownership passes. But no curriculum exists yet.
    mockSubjectsFindFirst.mockResolvedValue({
      id: 'subject-owned',
      profileId: PROFILE_ID,
    });

    const db = createMockDb();
    db.query.curricula.findFirst = jest.fn().mockResolvedValue(null);
    db.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    });

    const topics = await selectInterleavedTopics(db, PROFILE_ID, {
      subjectId: 'nonexistent-subject',
      topicCount: 5,
    });

    expect(topics).toEqual([]);
  });

  it('[CR-018] returns empty when subjectId belongs to a different profile (ownership check)', async () => {
    // Profile A's card data — would be returned if the ownership check were absent.
    const profileACard = createMockCard({
      id: 'c1',
      topicId: 'topic-001',
      nextReviewAt: new Date('2026-02-10'),
    });
    mockFindMany.mockResolvedValue([profileACard]);

    // Profile B calls with Profile A's subjectId.
    // The scoped subjects repo returns null — profile B does not own this subject.
    mockSubjectsFindFirst.mockResolvedValue(null);

    const db = createMockDb();
    // If the ownership guard were absent, curricula.findFirst would be called and
    // could return data. We leave it returning a valid curriculum to prove the guard
    // fires before reaching the DB read.
    db.query.curricula.findFirst = jest.fn().mockResolvedValue({
      id: 'curriculum-001',
      subjectId: 'subject-profile-a',
    });

    const topics = await selectInterleavedTopics(db, 'profile-b', {
      subjectId: 'subject-profile-a',
      topicCount: 5,
    });

    // Must return the same shape as "not found" — empty array, no profile A data.
    expect(topics).toEqual([]);
    // curricula must NOT have been queried — guard fires before DB reads.
    expect(db.query.curricula.findFirst).not.toHaveBeenCalled();
  });

  it('[WI-80] drops selected retention cards whose topic is not owned by the profile', async () => {
    mockFindMany.mockResolvedValue([
      createMockCard({
        id: 'owned-card',
        topicId: 'topic-owned',
        nextReviewAt: new Date('2026-02-10'),
      }),
      createMockCard({
        id: 'foreign-card',
        topicId: 'topic-foreign',
        nextReviewAt: new Date('2026-02-10'),
      }),
    ]);

    const db = createMockDb({
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockResolvedValue([
                  {
                    topicId: 'topic-owned',
                    topicTitle: 'Owned Topic',
                    curriculumId: 'curriculum-owned',
                    subjectId: 'subject-owned',
                  },
                ]),
              }),
            }),
          }),
        }),
      }),
      query: {
        curricula: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'curriculum-owned', subjectId: 'subject-owned' },
            { id: 'curriculum-foreign', subjectId: 'subject-foreign' },
          ]),
        },
        curriculumTopics: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'topic-owned',
              curriculumId: 'curriculum-owned',
              title: 'Owned Topic',
            },
            {
              id: 'topic-foreign',
              curriculumId: 'curriculum-foreign',
              title: 'Victim Secret Topic',
            },
          ]),
        },
      },
    });

    const topics = await selectInterleavedTopics(db, PROFILE_ID, {
      topicCount: 2,
    });

    expect(topics).toEqual([
      expect.objectContaining({
        topicId: 'topic-owned',
        subjectId: 'subject-owned',
        topicTitle: 'Owned Topic',
      }),
    ]);
    expect(topics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topicId: 'topic-foreign' }),
      ]),
    );
    expect(topics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topicTitle: 'Victim Secret Topic' }),
      ]),
    );
  });

  it('[WI-80] backfills owned topics when stale foreign cards sort first', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      mockFindMany.mockResolvedValue([
        createMockCard({
          id: 'foreign-1',
          topicId: 'topic-foreign-1',
          nextReviewAt: new Date('2026-02-10'),
        }),
        createMockCard({
          id: 'foreign-2',
          topicId: 'topic-foreign-2',
          nextReviewAt: new Date('2026-02-10'),
        }),
        createMockCard({
          id: 'owned-1',
          topicId: 'topic-owned-1',
          nextReviewAt: new Date('2026-02-10'),
        }),
        createMockCard({
          id: 'owned-2',
          topicId: 'topic-owned-2',
          nextReviewAt: new Date('2026-02-10'),
        }),
      ]);

      const db = createMockDb({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              innerJoin: jest.fn().mockReturnValue({
                innerJoin: jest.fn().mockReturnValue({
                  where: jest.fn().mockResolvedValue([
                    {
                      topicId: 'topic-owned-1',
                      topicTitle: 'Owned Topic 1',
                      curriculumId: 'curriculum-owned',
                      subjectId: 'subject-owned',
                    },
                    {
                      topicId: 'topic-owned-2',
                      topicTitle: 'Owned Topic 2',
                      curriculumId: 'curriculum-owned',
                      subjectId: 'subject-owned',
                    },
                  ]),
                }),
              }),
            }),
          }),
        }),
      });

      const topics = await selectInterleavedTopics(db, PROFILE_ID, {
        topicCount: 2,
      });

      expect(topics.map((topic) => topic.topicId)).toEqual([
        'topic-owned-1',
        'topic-owned-2',
      ]);
    } finally {
      randomSpy.mockRestore();
    }
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
    db.query.curricula.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'curriculum-001', subjectId: 'subject-001' }]);

    const topics = await selectInterleavedTopics(db, PROFILE_ID, {
      topicCount: 2,
    });

    const stableTopic = topics.find(
      (t: InterleavedTopic) => t.topicId === 'topic-001',
    );
    const unstableTopic = topics.find(
      (t: InterleavedTopic) => t.topicId === 'topic-002',
    );

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
    db.query.curricula.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'curriculum-001', subjectId: 'subject-001' }]);

    const result = await startInterleavedSession(db, PROFILE_ID);

    expect(result.sessionId).toBe('session-001');
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0]!.topicId).toBe('topic-001');
    expect(mockInsert).toHaveBeenCalled();
  });

  it('[BUG-764] throws NoInterleavedTopicsError when no topics are available', async () => {
    mockFindMany.mockResolvedValue([]);

    const db = createMockDb();

    // Assert on the typed class — not on the message text. The route layer
    // classifies via instanceof; this test pins the contract.
    await expect(
      startInterleavedSession(db, PROFILE_ID),
    ).rejects.toBeInstanceOf(NoInterleavedTopicsError);
  });
});
