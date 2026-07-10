import { createDatabaseModuleMock } from '../test-utils/database-module';
import { emptyPracticeActivitySummary } from '../test-utils/practice-activity-summary-fixture';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  exports: {
    createScopedRepository: jest.fn(),
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: service unit test — db boundary mocked; real DB covered by sibling .integration.test.ts where present */,
  () => mockDatabaseModule.module,
);

const mockGetPracticeActivitySummary = jest.fn().mockResolvedValue({
  ...emptyPracticeActivitySummary,
});

function mockPracticeSummary(
  overrides?: Partial<
    Awaited<ReturnType<typeof mockGetPracticeActivitySummary>>
  >,
) {
  return {
    ...emptyPracticeActivitySummary,
    ...overrides,
  };
}

const mockGetPracticeActivitySummaryBatch = jest
  .fn<Promise<Map<string, unknown>>, [unknown, string[], unknown]>()
  .mockResolvedValue(new Map());

jest.mock(
  './practice-activity-summary' /* gc1-allow: unit test boundary */,
  () => ({
    getPracticeActivitySummary: (...args: unknown[]) =>
      mockGetPracticeActivitySummary(...args),
    getPracticeActivitySummaryBatch: (...args: unknown[]) =>
      mockGetPracticeActivitySummaryBatch(
        ...(args as [unknown, string[], unknown]),
      ),
  }),
);

import type { Database } from '@eduagent/database';
import type { SubjectProgress } from '@eduagent/schemas';
import { createScopedRepository } from '@eduagent/database';
import {
  getSubjectProgress,
  getTopicProgress,
  getTopicProgressBatch,
  getOverallProgress,
  getOverallProgressBatch,
  getContinueSuggestion,
  getLearningResumeTarget,
  getActiveSessionForTopic,
  resolveTopicSubject,
} from './progress';

const NOW = new Date('2026-02-15T10:00:00.000Z');
const profileId = 'test-profile-id';
const subjectId = '550e8400-e29b-41d4-a716-446655440000';
const curriculumId = '660e8400-e29b-41d4-a716-446655440000';
const topicId = '770e8400-e29b-41d4-a716-446655440000';

function mockSubjectRow(
  overrides?: Partial<{ id: string; name: string; status: string }>,
) {
  return {
    id: overrides?.id ?? subjectId,
    profileId,
    name: overrides?.name ?? 'Mathematics',
    status: overrides?.status ?? 'active',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockTopicRow(
  overrides?: Partial<{
    id: string;
    title: string;
    sortOrder: number;
    curriculumId: string;
    bookId: string | null;
  }>,
) {
  return {
    id: overrides?.id ?? topicId,
    curriculumId: overrides?.curriculumId ?? curriculumId,
    title: overrides?.title ?? 'Algebra Basics',
    description: 'Introduction to algebra',
    bookId: overrides?.bookId ?? null,
    sortOrder: overrides?.sortOrder ?? 1,
    relevance: 'core' as const,
    estimatedMinutes: 30,
    skipped: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockOwnedTopicRow(topic: ReturnType<typeof mockTopicRow>) {
  return {
    profileId,
    topicId: topic.id,
    topicTitle: topic.title,
    topicDescription: topic.description,
    topicChapter: null,
    bookId: topic.bookId ?? 'book-1',
    bookTitle: 'Book 1',
    curriculumId: topic.curriculumId,
    subjectId,
  };
}

function mockRetentionCard(
  overrides?: Partial<{
    topicId: string;
    xpStatus: string;
    nextReviewAt: Date | null;
    failureCount: number;
    masteredAt: Date | null;
  }>,
) {
  return {
    id: 'card-1',
    profileId,
    topicId: overrides?.topicId ?? topicId,
    easeFactor: 2.5,
    intervalDays: 7,
    repetitions: 3,
    lastReviewedAt: NOW,
    nextReviewAt:
      overrides?.nextReviewAt ?? new Date('2026-02-22T10:00:00.000Z'),
    failureCount: overrides?.failureCount ?? 0,
    consecutiveSuccesses: 2,
    xpStatus: overrides?.xpStatus ?? 'pending',
    masteredAt: overrides?.masteredAt ?? null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockAssessmentRow(
  overrides?: Partial<{
    topicId: string;
    status: string;
    masteryScore: number | null;
    masteryChallengeVerifiedAt: Date | null;
  }>,
) {
  return {
    id: 'assessment-1',
    profileId,
    subjectId,
    topicId: overrides?.topicId ?? topicId,
    sessionId: null,
    verificationDepth: 'recall' as const,
    status: overrides?.status ?? 'in_progress',
    masteryScore: overrides?.masteryScore ?? null,
    masteryChallengeVerifiedAt: overrides?.masteryChallengeVerifiedAt ?? null,
    qualityRating: null,
    exchangeHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockSessionRow(
  overrides?: Partial<{
    id: string;
    subjectId: string;
    topicId: string | null;
    status: 'active' | 'paused' | 'completed' | 'auto_closed';
    exchangeCount: number;
    lastActivityAt: Date;
  }>,
) {
  return {
    id: overrides?.id ?? 'session-1',
    profileId,
    subjectId: overrides?.subjectId ?? subjectId,
    topicId: overrides?.topicId ?? null,
    sessionType: 'learning' as const,
    status: overrides?.status ?? ('completed' as const),
    escalationRung: 1,
    exchangeCount: overrides?.exchangeCount ?? 5,
    startedAt: NOW,
    lastActivityAt: overrides?.lastActivityAt ?? NOW,
    endedAt: NOW,
    durationSeconds: 300,
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMockDb({
  curriculumFindFirst = undefined as
    | { id: string; subjectId: string }
    | undefined,
  curriculaFindMany = [] as Array<{
    id: string;
    subjectId: string;
    version?: number;
  }>,
  curriculumSelectRows = [] as Array<{
    id: string;
    subjectId: string;
    version: number;
  }>,
  topicsFindMany = [] as ReturnType<typeof mockTopicRow>[],
  topicFindFirst = undefined as ReturnType<typeof mockTopicRow> | undefined,
  topicSubjectJoinRows = [{ topicId }] as Array<{ topicId: string }>,
  ownedTopicRows,
}: {
  curriculumFindFirst?: { id: string; subjectId: string } | undefined;
  curriculaFindMany?: Array<{
    id: string;
    subjectId: string;
    version?: number;
  }>;
  curriculumSelectRows?: Array<{
    id: string;
    subjectId: string;
    version: number;
  }>;
  topicsFindMany?: ReturnType<typeof mockTopicRow>[];
  topicFindFirst?: ReturnType<typeof mockTopicRow> | undefined;
  topicSubjectJoinRows?: Array<{ topicId: string }>;
  ownedTopicRows?: ReturnType<typeof mockOwnedTopicRow>[];
} = {}): Database {
  const effectiveOwnedTopicRows =
    ownedTopicRows ??
    (topicSubjectJoinRows.length === 0
      ? []
      : topicFindFirst
        ? [mockOwnedTopicRow(topicFindFirst)]
        : topicsFindMany.map(mockOwnedTopicRow));
  const orderBy = jest.fn().mockResolvedValue(curriculumSelectRows);
  const selectWhere = jest.fn().mockReturnValue({ orderBy });
  const ownedTopicLimit = jest.fn().mockResolvedValue(effectiveOwnedTopicRows);
  const ownedTopicWhereResult = Object.assign(
    { limit: ownedTopicLimit },
    {
      then: (
        resolve: (value: typeof effectiveOwnedTopicRows) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(effectiveOwnedTopicRows).then(resolve, reject),
    },
  );
  const ownedTopicWhere = jest.fn().mockReturnValue(ownedTopicWhereResult);
  const ownedTopicThirdJoin = jest.fn().mockReturnValue({
    where: ownedTopicWhere,
  });
  const ownedTopicSecondJoin = jest.fn().mockReturnValue({
    innerJoin: ownedTopicThirdJoin,
  });
  const ownedTopicFirstJoin = jest.fn().mockReturnValue({
    innerJoin: ownedTopicSecondJoin,
  });
  const from = jest.fn().mockReturnValue({
    where: selectWhere,
    innerJoin: ownedTopicFirstJoin,
  });

  return {
    select: jest.fn().mockReturnValue({
      from,
    }),
    query: {
      curricula: {
        findFirst: jest.fn().mockResolvedValue(curriculumFindFirst),
        findMany: jest.fn().mockResolvedValue(curriculaFindMany),
      },
      curriculumTopics: {
        findMany: jest.fn().mockResolvedValue(topicsFindMany),
        findFirst: jest.fn().mockResolvedValue(topicFindFirst),
      },
    },
  } as unknown as Database;
}

function setupScopedRepo({
  subjectFindFirst = undefined as ReturnType<typeof mockSubjectRow> | undefined,
  subjectsFindMany = [] as ReturnType<typeof mockSubjectRow>[],
  retentionCardsFindMany = [] as ReturnType<typeof mockRetentionCard>[],
  retentionCardFindFirst = undefined as
    | ReturnType<typeof mockRetentionCard>
    | undefined,
  assessmentsFindMany = [] as ReturnType<typeof mockAssessmentRow>[],
  sessionsFindMany = [] as ReturnType<typeof mockSessionRow>[],
  needsDeepeningFindMany = [] as Array<{
    topicId: string;
    status: string;
    createdAt?: Date;
  }>,
  xpLedgerFindMany = [] as Array<{
    topicId: string;
    status: string;
    createdAt: Date;
  }>,
  sessionSummariesFindFirst = undefined as { content: string } | undefined,
  sessionSummariesFindMany = [] as Array<{
    sessionId: string;
    profileId?: string;
    status: string;
    content?: string;
  }>,
} = {}) {
  (createScopedRepository as jest.Mock).mockReturnValue({
    subjects: {
      findFirst: jest.fn().mockResolvedValue(subjectFindFirst),
      findMany: jest.fn().mockResolvedValue(subjectsFindMany),
    },
    retentionCards: {
      findMany: jest.fn().mockResolvedValue(retentionCardsFindMany),
      findFirst: jest.fn().mockResolvedValue(retentionCardFindFirst),
    },
    assessments: {
      findMany: jest.fn().mockResolvedValue(assessmentsFindMany),
    },
    sessions: {
      findMany: jest.fn().mockResolvedValue(sessionsFindMany),
    },
    needsDeepeningTopics: {
      findMany: jest.fn().mockResolvedValue(needsDeepeningFindMany),
    },
    xpLedger: {
      findMany: jest.fn().mockResolvedValue(xpLedgerFindMany),
    },
    sessionSummaries: {
      findFirst: jest.fn().mockResolvedValue(sessionSummariesFindFirst),
      findMany: jest.fn().mockResolvedValue(sessionSummariesFindMany),
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getSubjectProgress
// ---------------------------------------------------------------------------

describe('getSubjectProgress', () => {
  it('returns null when subject not found', async () => {
    setupScopedRepo({ subjectFindFirst: undefined });
    const db = createMockDb();
    const result = await getSubjectProgress(db, profileId, subjectId);
    expect(result).toBeNull();
  });

  it('returns progress with zero topics when no curriculum exists', async () => {
    setupScopedRepo({ subjectFindFirst: mockSubjectRow() });
    const db = createMockDb({ curriculumFindFirst: undefined });
    const result = await getSubjectProgress(db, profileId, subjectId);

    expect(result).not.toBeNull();
    expect(result!.topicsTotal).toBe(0);
    expect(result!.topicsCompleted).toBe(0);
    expect(result!.topicsVerified).toBe(0);
    expect(result!.retentionStatus).toBe('strong');
  });

  it('counts topics, completed, and verified correctly', async () => {
    const topic1 = mockTopicRow({ id: 'topic-1', sortOrder: 1 });
    const topic2 = mockTopicRow({ id: 'topic-2', sortOrder: 2 });
    const topic3 = mockTopicRow({ id: 'topic-3', sortOrder: 3 });

    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardsFindMany: [
        mockRetentionCard({ topicId: 'topic-1', xpStatus: 'verified' }),
      ],
      assessmentsFindMany: [
        mockAssessmentRow({ topicId: 'topic-2', status: 'passed' }),
      ],
      sessionsFindMany: [mockSessionRow()],
    });
    const db = createMockDb({
      curriculumFindFirst: { id: curriculumId, subjectId },
      topicsFindMany: [topic1, topic2, topic3],
    });

    const result = await getSubjectProgress(db, profileId, subjectId);

    expect(result!.topicsTotal).toBe(3);
    expect(result!.topicsCompleted).toBe(2); // 1 verified + 1 passed
    expect(result!.topicsVerified).toBe(1);
    expect(result!.name).toBe('Mathematics');
  });

  it('partitions topics into mastered, learning, and untouched states', async () => {
    const topics = [
      mockTopicRow({ id: 'topic-mastered', sortOrder: 1 }),
      mockTopicRow({ id: 'topic-assessment', sortOrder: 2 }),
      mockTopicRow({ id: 'topic-session', sortOrder: 3 }),
      mockTopicRow({ id: 'topic-summary', sortOrder: 4 }),
      mockTopicRow({ id: 'topic-card-only', sortOrder: 5 }),
      mockTopicRow({ id: 'topic-untouched', sortOrder: 6 }),
    ];

    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardsFindMany: [
        mockRetentionCard({
          topicId: 'topic-mastered',
          xpStatus: 'verified',
          masteredAt: NOW,
        }),
        mockRetentionCard({
          topicId: 'topic-card-only',
          xpStatus: 'pending',
        }),
      ],
      assessmentsFindMany: [
        mockAssessmentRow({ topicId: 'topic-assessment', status: 'passed' }),
      ],
      sessionsFindMany: [
        mockSessionRow({ id: 'session-complete', topicId: 'topic-session' }),
        mockSessionRow({
          id: 'session-summary',
          topicId: 'topic-summary',
          exchangeCount: 1,
        }),
      ],
      sessionSummariesFindMany: [
        { sessionId: 'session-summary', status: 'accepted' },
      ],
    });
    const db = createMockDb({
      curriculumFindFirst: { id: curriculumId, subjectId },
      topicsFindMany: topics,
    });

    const result = await getSubjectProgress(db, profileId, subjectId);

    expect(result).toMatchObject({
      topicsTotal: 6,
      topicsCompleted: 4,
      topicsVerified: 1,
      topicsMastered: 1,
      topicsLearning: 4,
    });
    expect(
      result!.topicsMastered +
        result!.topicsLearning +
        (result!.topicsTotal - result!.topicsMastered - result!.topicsLearning),
    ).toBe(result!.topicsTotal);
  });

  it('[WI-80] excludes mixed-parent topics from subject progress totals', async () => {
    const ownedTopic = mockTopicRow({ id: 'owned-topic', sortOrder: 1 });
    const mixedParentTopic = mockTopicRow({
      id: 'mixed-parent-topic',
      bookId: 'foreign-book',
      sortOrder: 2,
    });

    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardsFindMany: [
        mockRetentionCard({ topicId: 'owned-topic', xpStatus: 'verified' }),
        mockRetentionCard({
          topicId: 'mixed-parent-topic',
          xpStatus: 'verified',
        }),
      ],
      assessmentsFindMany: [
        mockAssessmentRow({ topicId: 'mixed-parent-topic', status: 'passed' }),
      ],
    });
    const db = createMockDb({
      curriculumFindFirst: { id: curriculumId, subjectId },
      topicsFindMany: [ownedTopic, mixedParentTopic],
      ownedTopicRows: [mockOwnedTopicRow(ownedTopic)],
    });

    const result = await getSubjectProgress(db, profileId, subjectId);

    expect(result).toMatchObject({
      topicsTotal: 1,
      topicsCompleted: 1,
      topicsVerified: 1,
    });
  });

  it('includes lastSessionAt from most recent session', async () => {
    const session = mockSessionRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      sessionsFindMany: [session],
    });
    const db = createMockDb({
      curriculumFindFirst: { id: curriculumId, subjectId },
      topicsFindMany: [],
    });

    const result = await getSubjectProgress(db, profileId, subjectId);

    expect(result!.lastSessionAt).toBe(NOW.toISOString());
  });

  describe('[STATUS-STRICT] session-based topic completion', () => {
    it('counts a topic with a meaningful completed session as completed, even without assessment or retention card', async () => {
      const topic = mockTopicRow({ id: 'topic-1' });
      setupScopedRepo({
        subjectFindFirst: mockSubjectRow(),
        retentionCardsFindMany: [],
        assessmentsFindMany: [],
        sessionsFindMany: [mockSessionRow({ topicId: 'topic-1' })],
      });
      const db = createMockDb({
        curriculumFindFirst: { id: curriculumId, subjectId },
        topicsFindMany: [topic],
      });

      const result = await getSubjectProgress(db, profileId, subjectId);

      expect(result!.topicsTotal).toBe(1);
      expect(result!.topicsCompleted).toBe(1);
      expect(result!.topicsVerified).toBe(0);
    });

    it('does not count a short completed session as topic completion', async () => {
      const topic = mockTopicRow({ id: 'topic-1' });
      setupScopedRepo({
        subjectFindFirst: mockSubjectRow(),
        retentionCardsFindMany: [],
        assessmentsFindMany: [],
        sessionsFindMany: [
          mockSessionRow({ topicId: 'topic-1', exchangeCount: 1 }),
        ],
      });
      const db = createMockDb({
        curriculumFindFirst: { id: curriculumId, subjectId },
        topicsFindMany: [topic],
      });

      const result = await getSubjectProgress(db, profileId, subjectId);

      expect(result!.topicsTotal).toBe(1);
      expect(result!.topicsCompleted).toBe(0);
      expect(result!.lastSessionAt).toBe(NOW.toISOString());
    });

    it('counts an accepted summary as topic completion even for a short session', async () => {
      const topic = mockTopicRow({ id: 'topic-1' });
      setupScopedRepo({
        subjectFindFirst: mockSubjectRow(),
        retentionCardsFindMany: [],
        assessmentsFindMany: [],
        sessionsFindMany: [
          mockSessionRow({
            id: 'session-accepted',
            topicId: 'topic-1',
            exchangeCount: 1,
          }),
        ],
        sessionSummariesFindMany: [
          { sessionId: 'session-accepted', status: 'accepted' },
        ],
      });
      const db = createMockDb({
        curriculumFindFirst: { id: curriculumId, subjectId },
        topicsFindMany: [topic],
      });

      const result = await getSubjectProgress(db, profileId, subjectId);

      expect(result!.topicsCompleted).toBe(1);
    });

    it('counts auto_closed sessions (but not active/paused) as completed topics', async () => {
      const topic1 = mockTopicRow({ id: 'topic-1' });
      const topic2 = mockTopicRow({ id: 'topic-2' });
      const topic3 = mockTopicRow({ id: 'topic-3' });
      setupScopedRepo({
        subjectFindFirst: mockSubjectRow(),
        sessionsFindMany: [
          mockSessionRow({
            id: 's1',
            topicId: 'topic-1',
            status: 'auto_closed',
          }),
          mockSessionRow({ id: 's2', topicId: 'topic-2', status: 'active' }),
          mockSessionRow({ id: 's3', topicId: 'topic-3', status: 'paused' }),
        ],
      });
      const db = createMockDb({
        curriculumFindFirst: { id: curriculumId, subjectId },
        topicsFindMany: [topic1, topic2, topic3],
      });

      const result = await getSubjectProgress(db, profileId, subjectId);

      // Only auto_closed counts; active + paused are in-progress, not complete.
      expect(result!.topicsCompleted).toBe(1);
    });

    it('ignores sessions without a topicId (generic sessions)', async () => {
      const topic = mockTopicRow({ id: 'topic-1' });
      setupScopedRepo({
        subjectFindFirst: mockSubjectRow(),
        sessionsFindMany: [mockSessionRow({ topicId: null })],
      });
      const db = createMockDb({
        curriculumFindFirst: { id: curriculumId, subjectId },
        topicsFindMany: [topic],
      });

      const result = await getSubjectProgress(db, profileId, subjectId);

      expect(result!.topicsCompleted).toBe(0);
    });

    it('does not double-count a topic that has both a verified card and a completed session', async () => {
      const topic = mockTopicRow({ id: 'topic-1' });
      setupScopedRepo({
        subjectFindFirst: mockSubjectRow(),
        retentionCardsFindMany: [
          mockRetentionCard({ topicId: 'topic-1', xpStatus: 'verified' }),
        ],
        sessionsFindMany: [mockSessionRow({ topicId: 'topic-1' })],
      });
      const db = createMockDb({
        curriculumFindFirst: { id: curriculumId, subjectId },
        topicsFindMany: [topic],
      });

      const result = await getSubjectProgress(db, profileId, subjectId);

      expect(result!.topicsCompleted).toBe(1);
      expect(result!.topicsVerified).toBe(1);
    });

    it('only counts sessions for topics in the current curriculum', async () => {
      const topic = mockTopicRow({ id: 'topic-in-curriculum' });
      setupScopedRepo({
        subjectFindFirst: mockSubjectRow(),
        sessionsFindMany: [
          mockSessionRow({ topicId: 'topic-not-in-curriculum' }),
        ],
      });
      const db = createMockDb({
        curriculumFindFirst: { id: curriculumId, subjectId },
        topicsFindMany: [topic],
      });

      const result = await getSubjectProgress(db, profileId, subjectId);

      // Session on a stale/skipped topic must not inflate the count.
      expect(result!.topicsCompleted).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// getTopicProgress
// ---------------------------------------------------------------------------

describe('getTopicProgress', () => {
  it('returns null when subject not found', async () => {
    setupScopedRepo({ subjectFindFirst: undefined });
    const db = createMockDb();
    const result = await getTopicProgress(db, profileId, subjectId, topicId);
    expect(result).toBeNull();
  });

  it('returns null when topic not found', async () => {
    setupScopedRepo({ subjectFindFirst: mockSubjectRow() });
    const db = createMockDb({ ownedTopicRows: [] });
    const result = await getTopicProgress(db, profileId, subjectId, topicId);
    expect(result).toBeNull();
  });

  it('[WI-80] returns null when topicId is not owned by the scoped subject/profile', async () => {
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: undefined,
      assessmentsFindMany: [],
      sessionsFindMany: [],
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [],
    });
    const db = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              innerJoin: jest.fn(() => ({
                where: jest.fn(() => ({
                  limit: jest.fn().mockResolvedValue([]),
                })),
              })),
            })),
          })),
        })),
      })),
      query: {
        curriculumTopics: {
          findFirst: jest
            .fn()
            .mockResolvedValue(mockTopicRow({ id: 'foreign-topic' })),
        },
      },
    } as unknown as Database;

    const result = await getTopicProgress(
      db,
      profileId,
      subjectId,
      'foreign-topic',
    );

    expect(result).toBeNull();
  });

  // [BUG-656 / L3.M3.2] BREAK TEST — cross-profile topic read attempt
  // Pre-fix: topic was fetched by `eq(curriculumTopics.id, topicId)` alone,
  // so a crafted topicId from another profile returned its title,
  // description, and downstream progress (xpStatus, struggleStatus,
  // summaryExcerpt). Subject was verified for the caller but the topic was
  // NOT joined back to that subject.
  // Post-fix: parent-chain join (curriculum_topics -> curricula ->
  // subjects.id = subjectId) returns 0 rows when the topic belongs to a
  // different subject; function returns null without ever surfacing the
  // foreign topic's data.
  it('[BUG-656] returns null when topicId belongs to a different subject (no leak)', async () => {
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      // These would fire ONLY if the function continued past the ownership
      // check — they must not be reached for a foreign topicId.
      retentionCardFindFirst: mockRetentionCard(),
      assessmentsFindMany: [
        mockAssessmentRow({ status: 'passed', masteryScore: 0.95 }),
      ],
      sessionsFindMany: [mockSessionRow({ topicId })],
      xpLedgerFindMany: [{ topicId, status: 'pending', createdAt: NOW }],
    });
    // Parent-chain join returns 0 rows — simulates an attacker passing a
    // leaked topicId that lives under another profile's subject.
    // topicFindFirst is still set to the foreign topic so pre-fix the
    // function would have returned it.
    const db = createMockDb({
      topicSubjectJoinRows: [],
      topicFindFirst: mockTopicRow({
        title: 'Victim Topic Title',
        curriculumId: 'other-curriculum',
      }),
    });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result).toBeNull();
  });

  it('returns topic progress with correct fields', async () => {
    const topic = mockTopicRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: mockRetentionCard(),
      assessmentsFindMany: [
        mockAssessmentRow({ status: 'passed', masteryScore: 0.85 }),
      ],
      sessionsFindMany: [mockSessionRow({ topicId })],
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [{ topicId, status: 'pending', createdAt: NOW }],
    });
    const db = createMockDb({
      curriculumFindFirst: { id: curriculumId, subjectId },
      topicFindFirst: topic,
      topicsFindMany: [topic],
    });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result).not.toBeNull();
    expect(result!.topicId).toBe(topicId);
    expect(result!.title).toBe('Algebra Basics');
    expect(result!.completionStatus).toBe('completed');
    expect(result!.masteryScore).toBe(0.85);
    expect(result!.xpStatus).toBe('pending');
    expect(result!.totalSessions).toBe(1);
    expect(result!.daysSinceLastReview).toEqual(expect.any(Number));
  });

  it('keeps a short terminal topic session in progress instead of completed', async () => {
    const topic = mockTopicRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: undefined,
      assessmentsFindMany: [],
      sessionsFindMany: [mockSessionRow({ topicId, exchangeCount: 1 })],
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [],
    });
    const db = createMockDb({ topicFindFirst: topic });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result!.completionStatus).toBe('in_progress');
    expect(result!.totalSessions).toBe(1);
  });

  it('marks struggle status as needs_deepening when active', async () => {
    const topic = mockTopicRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: undefined,
      assessmentsFindMany: [],
      sessionsFindMany: [],
      needsDeepeningFindMany: [{ topicId, status: 'active' }],
      xpLedgerFindMany: [],
    });
    const db = createMockDb({ topicFindFirst: topic });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result!.struggleStatus).toBe('needs_deepening');
  });

  it('returns forgotten retention when failureCount >= 3', async () => {
    const topic = mockTopicRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: mockRetentionCard({ failureCount: 3 }),
      assessmentsFindMany: [],
      sessionsFindMany: [],
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [],
    });
    const db = createMockDb({ topicFindFirst: topic });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result!.retentionStatus).toBe('forgotten');
  });

  it('marks struggle status as blocked when active deepening AND failureCount >= 3 [BUG-58]', async () => {
    const topic = mockTopicRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: mockRetentionCard({ failureCount: 3 }),
      assessmentsFindMany: [],
      sessionsFindMany: [],
      needsDeepeningFindMany: [{ topicId, status: 'active' }],
      xpLedgerFindMany: [],
    });
    const db = createMockDb({ topicFindFirst: topic });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result!.struggleStatus).toBe('blocked');
  });

  it('excludes ghost sessions: a topic whose only session has exchangeCount = 0 must be not_started [PROG-GHOST]', async () => {
    // Ghost-session scenario: user tapped a topic, a learning_sessions row was
    // created (exchangeCount=0), user abandoned before sending any message.
    // The topic must NOT appear "started" in progress. Dashboard (dashboard.ts)
    // and library/book status (curriculum.ts) already filter gte(exchangeCount,1);
    // progress.ts must match.
    //
    // We simulate the DB doing its job — after the filter, findMany returns [].
    // The behavioral check: completionStatus = not_started, totalSessions = 0.
    // The structural check: sessions.findMany was called with a composite
    // filter containing gte(exchangeCount, 1), not a bare eq(topicId).
    const topic = mockTopicRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: undefined,
      assessmentsFindMany: [],
      sessionsFindMany: [], // DB filtered the ghost session out
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [],
    });
    const db = createMockDb({ topicFindFirst: topic });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result!.completionStatus).toBe('not_started');
    expect(result!.totalSessions).toBe(0);

    // Structural guard: verify the query filter includes the exchangeCount gate.
    // Break test — removing gte(exchangeCount, 1) from the query will fail this.
    // Drizzle SQL trees are circular (PgTable ⇄ PgColumn), so use util.inspect
    // which handles cycles natively.
    const repoMock = (createScopedRepository as jest.Mock).mock.results[0]!
      .value as { sessions: { findMany: jest.Mock } };
    const filterArg = repoMock.sessions.findMany.mock.calls[0]?.[0];
    const { inspect } = await import('util');
    const rendered = inspect(filterArg, { depth: 10, breakLength: Infinity });
    expect(rendered).toContain('exchange_count');
  });

  // ---------------------------------------------------------------------------
  // [WI-1469 / MMT-ADR-0031] Challenge verification and SM-2 retention are
  // complementary, never-aliased axes. These four quadrants pin the
  // co-presentation contract: `masteryVerificationState` (Challenge axis) and
  // `xpStatus`/`retentionStatus`/`masteredAt` (SM-2 axis) must each reflect
  // their own signal, never cross-contaminate, and a historical `masteredAt`
  // must survive later staleness/decay on the other axis (ADR point 4).
  // ---------------------------------------------------------------------------

  it('[WI-1469] Challenge-verified/fresh: co-presents with an independent, unaffected retention state', async () => {
    jest.useFakeTimers({ now: NOW });
    try {
      const topic = mockTopicRow();
      const verifiedAt = new Date('2026-02-01T00:00:00.000Z');
      setupScopedRepo({
        subjectFindFirst: mockSubjectRow(),
        retentionCardFindFirst: mockRetentionCard({
          nextReviewAt: new Date('2026-02-25T00:00:00.000Z'), // ~9.6 days after NOW → 'strong'
        }),
        assessmentsFindMany: [
          mockAssessmentRow({
            status: 'passed',
            masteryChallengeVerifiedAt: verifiedAt,
          }),
        ],
        sessionsFindMany: [mockSessionRow({ topicId })],
        needsDeepeningFindMany: [],
        xpLedgerFindMany: [],
      });
      const db = createMockDb({ topicFindFirst: topic });

      const result = await getTopicProgress(db, profileId, subjectId, topicId);

      expect(result!.masteryVerificationState).toBe('fresh');
      expect(result!.retentionStatus).toBe('strong');
      // Challenge verification alone never sets the XP-ledger-derived xpStatus.
      expect(result!.xpStatus).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('[WI-1469] Challenge-verified/stale-or-due: a later weak-spot demotes verification to stale while retention independently shows due, and the historical masteredAt stamp survives both', async () => {
    const topic = mockTopicRow();
    const verifiedAt = new Date('2026-02-01T00:00:00.000Z');
    const laterWeakSpot = new Date('2026-02-10T00:00:00.000Z'); // postdates verification
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      // failureCount >= 3 deterministically forces retentionStatus 'forgotten'
      // (the due/decayed signal) without depending on wall-clock time.
      retentionCardFindFirst: mockRetentionCard({
        failureCount: 3,
        masteredAt: verifiedAt,
      }),
      assessmentsFindMany: [
        mockAssessmentRow({
          status: 'passed',
          masteryChallengeVerifiedAt: verifiedAt,
        }),
      ],
      sessionsFindMany: [mockSessionRow({ topicId })],
      needsDeepeningFindMany: [
        { topicId, status: 'active', createdAt: laterWeakSpot },
      ],
      xpLedgerFindMany: [],
    });
    const db = createMockDb({ topicFindFirst: topic });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result!.masteryVerificationState).toBe('stale');
    expect(result!.retentionStatus).toBe('forgotten');
    // ADR point 4: a sticky mastered timestamp is historical and is never
    // erased by later staleness on the other axis.
    expect(result!.masteredAt).toBe(verifiedAt.toISOString());
  });

  it('[WI-1469] SM-2-verified-without-Challenge: xpStatus verified from the XP ledger, masteryVerificationState stays unverified', async () => {
    const topic = mockTopicRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: mockRetentionCard(),
      assessmentsFindMany: [], // no Challenge Round ever run for this topic
      sessionsFindMany: [mockSessionRow({ topicId })],
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [{ topicId, status: 'verified', createdAt: NOW }],
    });
    const db = createMockDb({ topicFindFirst: topic });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result!.xpStatus).toBe('verified');
    expect(result!.masteryVerificationState).toBe('unverified');
  });

  it('[WI-1469] neither-verified: no Challenge Round and no verified XP ledger entry', async () => {
    const topic = mockTopicRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: undefined,
      assessmentsFindMany: [],
      sessionsFindMany: [],
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [],
    });
    const db = createMockDb({ topicFindFirst: topic });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result!.xpStatus).toBeNull();
    expect(result!.masteryVerificationState).toBe('unverified');
  });
});

// ---------------------------------------------------------------------------
// getTopicProgressBatch
// ---------------------------------------------------------------------------

describe('getTopicProgressBatch', () => {
  it('[WI-80] excludes mixed-parent topics from batched topic progress', async () => {
    const ownedTopic = mockTopicRow({
      id: 'owned-topic',
      title: 'Owned Topic',
    });
    const mixedParentTopic = mockTopicRow({
      id: 'mixed-parent-topic',
      title: 'Foreign Topic',
      bookId: 'foreign-book',
    });

    setupScopedRepo({
      retentionCardsFindMany: [
        mockRetentionCard({
          topicId: 'owned-topic',
          xpStatus: 'verified',
        }),
        mockRetentionCard({
          topicId: 'mixed-parent-topic',
          xpStatus: 'verified',
        }),
      ],
      assessmentsFindMany: [
        mockAssessmentRow({
          topicId: 'mixed-parent-topic',
          status: 'passed',
          masteryScore: 0.95,
        }),
      ],
      sessionsFindMany: [
        mockSessionRow({ topicId: 'owned-topic' }),
        mockSessionRow({ topicId: 'mixed-parent-topic' }),
      ],
    });
    const db = createMockDb({
      topicsFindMany: [ownedTopic, mixedParentTopic],
      ownedTopicRows: [mockOwnedTopicRow(ownedTopic)],
    });

    const result = await getTopicProgressBatch(db, profileId, [
      {
        id: 'owned-topic',
        title: 'Owned Topic',
        description: 'Owned description',
      },
      {
        id: 'mixed-parent-topic',
        title: 'Foreign Topic',
        description: 'Foreign description',
      },
    ]);

    expect(result.map((topic) => topic.topicId)).toEqual(['owned-topic']);
    expect(JSON.stringify(result)).not.toContain('Foreign Topic');
  });

  // ---------------------------------------------------------------------------
  // [WI-1469 / MMT-ADR-0031] Same co-presentation contract as the
  // `getTopicProgress` quadrant tests above — `getTopicProgressBatch` is a
  // separate implementation (not a wrapper), so it needs its own coverage per
  // the sibling-call-site sweep rule.
  // ---------------------------------------------------------------------------

  it('[WI-1469] Challenge-verified/fresh: batch co-presents with an independent, unaffected retention state', async () => {
    jest.useFakeTimers({ now: NOW });
    try {
      const topic = mockTopicRow({ id: 'batch-topic', title: 'Batch Topic' });
      const verifiedAt = new Date('2026-02-01T00:00:00.000Z');
      setupScopedRepo({
        retentionCardsFindMany: [
          mockRetentionCard({
            topicId: 'batch-topic',
            nextReviewAt: new Date('2026-02-25T00:00:00.000Z'),
          }),
        ],
        assessmentsFindMany: [
          mockAssessmentRow({
            topicId: 'batch-topic',
            status: 'passed',
            masteryChallengeVerifiedAt: verifiedAt,
          }),
        ],
        sessionsFindMany: [mockSessionRow({ topicId: 'batch-topic' })],
        needsDeepeningFindMany: [],
        xpLedgerFindMany: [],
      });
      const db = createMockDb({
        topicsFindMany: [topic],
        ownedTopicRows: [mockOwnedTopicRow(topic)],
      });

      const [result] = await getTopicProgressBatch(db, profileId, [
        { id: 'batch-topic', title: 'Batch Topic', description: '' },
      ]);

      expect(result!.masteryVerificationState).toBe('fresh');
      expect(result!.retentionStatus).toBe('strong');
      expect(result!.xpStatus).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('[WI-1469] Challenge-verified/stale-or-due: batch demotes verification to stale while retention independently shows due, historical masteredAt survives both', async () => {
    const topic = mockTopicRow({ id: 'batch-topic', title: 'Batch Topic' });
    const verifiedAt = new Date('2026-02-01T00:00:00.000Z');
    const laterWeakSpot = new Date('2026-02-10T00:00:00.000Z');
    setupScopedRepo({
      retentionCardsFindMany: [
        mockRetentionCard({
          topicId: 'batch-topic',
          failureCount: 3,
          masteredAt: verifiedAt,
        }),
      ],
      assessmentsFindMany: [
        mockAssessmentRow({
          topicId: 'batch-topic',
          status: 'passed',
          masteryChallengeVerifiedAt: verifiedAt,
        }),
      ],
      sessionsFindMany: [mockSessionRow({ topicId: 'batch-topic' })],
      needsDeepeningFindMany: [
        { topicId: 'batch-topic', status: 'active', createdAt: laterWeakSpot },
      ],
      xpLedgerFindMany: [],
    });
    const db = createMockDb({
      topicsFindMany: [topic],
      ownedTopicRows: [mockOwnedTopicRow(topic)],
    });

    const [result] = await getTopicProgressBatch(db, profileId, [
      { id: 'batch-topic', title: 'Batch Topic', description: '' },
    ]);

    expect(result!.masteryVerificationState).toBe('stale');
    expect(result!.retentionStatus).toBe('forgotten');
    expect(result!.masteredAt).toBe(verifiedAt.toISOString());
  });

  it('[WI-1469] SM-2-verified-without-Challenge: batch xpStatus verified from the XP ledger, masteryVerificationState stays unverified', async () => {
    const topic = mockTopicRow({ id: 'batch-topic', title: 'Batch Topic' });
    setupScopedRepo({
      retentionCardsFindMany: [mockRetentionCard({ topicId: 'batch-topic' })],
      assessmentsFindMany: [],
      sessionsFindMany: [mockSessionRow({ topicId: 'batch-topic' })],
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [
        { topicId: 'batch-topic', status: 'verified', createdAt: NOW },
      ],
    });
    const db = createMockDb({
      topicsFindMany: [topic],
      ownedTopicRows: [mockOwnedTopicRow(topic)],
    });

    const [result] = await getTopicProgressBatch(db, profileId, [
      { id: 'batch-topic', title: 'Batch Topic', description: '' },
    ]);

    expect(result!.xpStatus).toBe('verified');
    expect(result!.masteryVerificationState).toBe('unverified');
  });

  it('[WI-1469] neither-verified: batch has no Challenge Round and no verified XP ledger entry', async () => {
    const topic = mockTopicRow({ id: 'batch-topic', title: 'Batch Topic' });
    setupScopedRepo({
      retentionCardsFindMany: [],
      assessmentsFindMany: [],
      sessionsFindMany: [],
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [],
    });
    const db = createMockDb({
      topicsFindMany: [topic],
      ownedTopicRows: [mockOwnedTopicRow(topic)],
    });

    const [result] = await getTopicProgressBatch(db, profileId, [
      { id: 'batch-topic', title: 'Batch Topic', description: '' },
    ]);

    expect(result!.xpStatus).toBeNull();
    expect(result!.masteryVerificationState).toBe('unverified');
  });
});

// ---------------------------------------------------------------------------
// getOverallProgress
// ---------------------------------------------------------------------------

describe('getOverallProgress', () => {
  it('returns empty when no subjects', async () => {
    const practiceSummary = mockPracticeSummary({
      totals: {
        activitiesCompleted: 4,
        reviewsCompleted: 1,
        pointsEarned: 25,
        celebrations: 2,
        distinctActivityTypes: 2,
      },
    });
    mockGetPracticeActivitySummary.mockResolvedValueOnce(practiceSummary);
    setupScopedRepo({ subjectsFindMany: [] });
    const db = createMockDb();
    const result = await getOverallProgress(db, profileId);

    expect(result.subjects).toEqual([]);
    expect(result.totalTopicsCompleted).toBe(0);
    expect(result.totalTopicsVerified).toBe(0);
    expect(result.practiceActivityCount).toBe(4);
    expect(result.practiceSummary).toBe(practiceSummary);
  });

  it('limits practice activity summary to a rolling 90-day window', async () => {
    jest.useFakeTimers({ now: new Date('2026-05-13T12:00:00.000Z') });
    try {
      setupScopedRepo({ subjectsFindMany: [] });
      const db = createMockDb();

      await getOverallProgress(db, profileId);

      expect(mockGetPracticeActivitySummary).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          profileId,
          period: {
            start: new Date('2026-02-12T12:00:00.000Z'),
            endExclusive: new Date('2026-05-13T12:00:00.000Z'),
          },
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts subject loading and practice summary in parallel', async () => {
    const order: string[] = [];
    let resolveSubjects: (
      subjects: ReturnType<typeof mockSubjectRow>[],
    ) => void;
    const subjectsPromise = new Promise<ReturnType<typeof mockSubjectRow>[]>(
      (resolve) => {
        resolveSubjects = resolve;
      },
    );
    (createScopedRepository as jest.Mock).mockReturnValue({
      subjects: {
        findMany: jest.fn(() => {
          order.push('subjects-start');
          return subjectsPromise;
        }),
      },
      retentionCards: { findMany: jest.fn().mockResolvedValue([]) },
      assessments: { findMany: jest.fn().mockResolvedValue([]) },
      sessions: { findMany: jest.fn().mockResolvedValue([]) },
      needsDeepeningTopics: { findMany: jest.fn().mockResolvedValue([]) },
      xpLedger: { findMany: jest.fn().mockResolvedValue([]) },
      sessionSummaries: { findFirst: jest.fn().mockResolvedValue(undefined) },
    });
    mockGetPracticeActivitySummary.mockImplementationOnce(() => {
      order.push('practice-start');
      return Promise.resolve(emptyPracticeActivitySummary);
    });

    const db = createMockDb();
    const resultPromise = getOverallProgress(db, profileId);
    // This probe intentionally uses one microtask tick to prove both loads were
    // started before the unresolved subjects query settles. If the service adds
    // awaits before Promise.all(), this brittle ordering guard should fail.
    await Promise.resolve();

    expect(order).toEqual(['subjects-start', 'practice-start']);

    resolveSubjects!([]);
    await expect(resultPromise).resolves.toMatchObject({
      subjects: [],
      practiceActivityCount: 0,
    });
  });

  it('aggregates across multiple subjects with batch queries', async () => {
    const subject1 = mockSubjectRow({ id: 'sub-1', name: 'Math' });
    const subject2 = mockSubjectRow({ id: 'sub-2', name: 'Science' });
    const curriculum1Id = 'curr-1';
    const curriculum2Id = 'curr-2';

    const topic1 = mockTopicRow({
      id: 'topic-1',
      title: 'Algebra',
      sortOrder: 1,
    });
    const topic2 = mockTopicRow({
      id: 'topic-2',
      title: 'Biology',
      sortOrder: 1,
    });

    // Override curriculumId on topic2 to belong to curriculum2
    const topic2WithCurriculum = { ...topic2, curriculumId: curriculum2Id };
    const topic1WithCurriculum = { ...topic1, curriculumId: curriculum1Id };

    setupScopedRepo({
      subjectsFindMany: [subject1, subject2],
      retentionCardsFindMany: [
        mockRetentionCard({ topicId: 'topic-1', xpStatus: 'verified' }),
      ],
      assessmentsFindMany: [
        mockAssessmentRow({ topicId: 'topic-2', status: 'passed' }),
      ],
      sessionsFindMany: [mockSessionRow({ subjectId: 'sub-1' })],
    });

    const db = createMockDb({
      curriculaFindMany: [
        { id: curriculum1Id, subjectId: 'sub-1' },
        { id: curriculum2Id, subjectId: 'sub-2' },
      ],
      topicsFindMany: [topic1WithCurriculum, topic2WithCurriculum],
    });

    const result = await getOverallProgress(db, profileId);

    expect(result.subjects).toHaveLength(2);
    expect(result.totalTopicsCompleted).toBe(2); // 1 verified + 1 passed
    expect(result.totalTopicsVerified).toBe(1);

    const math = result.subjects.find(
      (s: SubjectProgress) => s.name === 'Math',
    );
    const science = result.subjects.find(
      (s: SubjectProgress) => s.name === 'Science',
    );
    expect(math).toEqual(expect.objectContaining({}));
    expect(math!.topicsTotal).toBe(1);
    expect(math!.topicsCompleted).toBe(1);
    expect(math!.topicsVerified).toBe(1);
    expect(science).toEqual(expect.objectContaining({}));
    expect(science!.topicsTotal).toBe(1);
    expect(science!.topicsCompleted).toBe(1);
    expect(science!.topicsVerified).toBe(0);
  });

  it('[WI-916] uses the latest curriculum when a subject has multiple versions', async () => {
    const subject = mockSubjectRow({ id: 'sub-1', name: 'Math' });
    const olderCurriculumId = 'curr-v1';
    const latestCurriculumId = 'curr-v2';
    const olderTopic = {
      ...mockTopicRow({
        id: 'topic-v1',
        title: 'Old outline topic',
        sortOrder: 1,
      }),
      curriculumId: olderCurriculumId,
    };
    const latestTopicA = {
      ...mockTopicRow({
        id: 'topic-v2-a',
        title: 'Current outline topic A',
        sortOrder: 1,
      }),
      curriculumId: latestCurriculumId,
    };
    const latestTopicB = {
      ...mockTopicRow({
        id: 'topic-v2-b',
        title: 'Current outline topic B',
        sortOrder: 2,
      }),
      curriculumId: latestCurriculumId,
    };

    setupScopedRepo({
      subjectsFindMany: [subject],
      retentionCardsFindMany: [],
      assessmentsFindMany: [],
      sessionsFindMany: [],
    });
    const db = createMockDb({
      curriculaFindMany: [
        { id: latestCurriculumId, subjectId: 'sub-1', version: 2 },
        { id: olderCurriculumId, subjectId: 'sub-1', version: 1 },
      ],
      topicsFindMany: [latestTopicA, latestTopicB, olderTopic],
    });

    const result = await getOverallProgress(db, profileId);

    expect(result.subjects).toHaveLength(1);
    expect(result.subjects[0]).toMatchObject({
      subjectId: 'sub-1',
      topicsTotal: 2,
      topicsCompleted: 0,
      topicsVerified: 0,
    });
  });

  it('[WI-80] excludes mixed-parent topics from overall progress aggregation', async () => {
    const subject = mockSubjectRow({ id: 'sub-1', name: 'Math' });
    const curriculumIdLocal = 'curr-1';
    const ownedTopic = {
      ...mockTopicRow({ id: 'owned-topic', sortOrder: 1 }),
      curriculumId: curriculumIdLocal,
    };
    const mixedParentTopic = {
      ...mockTopicRow({
        id: 'mixed-parent-topic',
        bookId: 'foreign-book',
        sortOrder: 2,
      }),
      curriculumId: curriculumIdLocal,
    };

    setupScopedRepo({
      subjectsFindMany: [subject],
      retentionCardsFindMany: [
        mockRetentionCard({ topicId: 'owned-topic', xpStatus: 'verified' }),
        mockRetentionCard({
          topicId: 'mixed-parent-topic',
          xpStatus: 'verified',
        }),
      ],
      assessmentsFindMany: [
        mockAssessmentRow({ topicId: 'mixed-parent-topic', status: 'passed' }),
      ],
    });

    const db = createMockDb({
      curriculaFindMany: [{ id: curriculumIdLocal, subjectId: 'sub-1' }],
      topicsFindMany: [ownedTopic, mixedParentTopic],
      ownedTopicRows: [mockOwnedTopicRow(ownedTopic)],
    });

    const result = await getOverallProgress(db, profileId);

    expect(result.subjects[0]).toMatchObject({
      topicsTotal: 1,
      topicsCompleted: 1,
      topicsVerified: 1,
    });
    expect(result.totalTopicsCompleted).toBe(1);
    expect(result.totalTopicsVerified).toBe(1);
  });

  it('handles subjects without curricula', async () => {
    const subject = mockSubjectRow({ id: 'sub-1', name: 'Math' });

    setupScopedRepo({
      subjectsFindMany: [subject],
      retentionCardsFindMany: [],
      assessmentsFindMany: [],
      sessionsFindMany: [],
    });

    const db = createMockDb({
      curriculaFindMany: [],
      topicsFindMany: [],
    });

    const result = await getOverallProgress(db, profileId);

    expect(result.subjects).toHaveLength(1);
    expect(result.subjects[0]!.topicsTotal).toBe(0);
    expect(result.subjects[0]!.retentionStatus).toBe('strong');
    expect(result.totalTopicsCompleted).toBe(0);
  });

  describe('[STATUS-STRICT] session-based topic completion', () => {
    it('counts topics with meaningful completed sessions as completed in the overall aggregate', async () => {
      const subject = mockSubjectRow({ id: 'sub-1', name: 'Geography' });
      const curriculumIdLocal = 'curr-1';
      const topic = {
        ...mockTopicRow({ id: 'topic-1' }),
        curriculumId: curriculumIdLocal,
      };

      setupScopedRepo({
        subjectsFindMany: [subject],
        retentionCardsFindMany: [],
        assessmentsFindMany: [],
        sessionsFindMany: [
          mockSessionRow({ subjectId: 'sub-1', topicId: 'topic-1' }),
        ],
      });

      const db = createMockDb({
        curriculaFindMany: [{ id: curriculumIdLocal, subjectId: 'sub-1' }],
        topicsFindMany: [topic],
      });

      const result = await getOverallProgress(db, profileId);

      expect(result.subjects).toHaveLength(1);
      expect(result.subjects[0]!.topicsTotal).toBe(1);
      expect(result.subjects[0]!.topicsCompleted).toBe(1);
      expect(result.subjects[0]!.topicsVerified).toBe(0);
      expect(result.totalTopicsCompleted).toBe(1);
      expect(result.totalTopicsVerified).toBe(0);
    });

    it('does not count short completed sessions as completed in the overall aggregate', async () => {
      const subject = mockSubjectRow({ id: 'sub-1', name: 'Geography' });
      const curriculumIdLocal = 'curr-1';
      const topic = {
        ...mockTopicRow({ id: 'topic-1' }),
        curriculumId: curriculumIdLocal,
      };

      setupScopedRepo({
        subjectsFindMany: [subject],
        retentionCardsFindMany: [],
        assessmentsFindMany: [],
        sessionsFindMany: [
          mockSessionRow({
            subjectId: 'sub-1',
            topicId: 'topic-1',
            exchangeCount: 1,
          }),
        ],
      });

      const db = createMockDb({
        curriculaFindMany: [{ id: curriculumIdLocal, subjectId: 'sub-1' }],
        topicsFindMany: [topic],
      });

      const result = await getOverallProgress(db, profileId);

      expect(result.subjects[0]!.topicsCompleted).toBe(0);
      expect(result.totalTopicsCompleted).toBe(0);
    });

    it('does not double-count topics that are both session-completed and SRS-verified', async () => {
      const subject = mockSubjectRow({ id: 'sub-1', name: 'Geography' });
      const curriculumIdLocal = 'curr-1';
      const topic = {
        ...mockTopicRow({ id: 'topic-1' }),
        curriculumId: curriculumIdLocal,
      };

      setupScopedRepo({
        subjectsFindMany: [subject],
        retentionCardsFindMany: [
          mockRetentionCard({ topicId: 'topic-1', xpStatus: 'verified' }),
        ],
        sessionsFindMany: [
          mockSessionRow({ subjectId: 'sub-1', topicId: 'topic-1' }),
        ],
      });

      const db = createMockDb({
        curriculaFindMany: [{ id: curriculumIdLocal, subjectId: 'sub-1' }],
        topicsFindMany: [topic],
      });

      const result = await getOverallProgress(db, profileId);

      expect(result.subjects[0]!.topicsCompleted).toBe(1);
      expect(result.subjects[0]!.topicsVerified).toBe(1);
      expect(result.totalTopicsCompleted).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// getLearningResumeTarget
// ---------------------------------------------------------------------------

describe('getLearningResumeTarget', () => {
  it('returns the newest active session as the global resume target', async () => {
    const subject = mockSubjectRow();
    const topic = mockTopicRow({ id: 'topic-1', title: 'Algebra' });
    setupScopedRepo({
      subjectsFindMany: [subject],
      sessionsFindMany: [
        {
          ...mockSessionRow({
            id: 'completed-session',
            topicId: 'topic-1',
            status: 'completed',
            lastActivityAt: new Date('2026-02-14T10:00:00.000Z'),
          }),
        },
        {
          ...mockSessionRow({
            id: 'active-session',
            topicId: 'topic-1',
            status: 'active',
            lastActivityAt: new Date('2026-02-15T09:00:00.000Z'),
          }),
        },
      ],
    });
    const db = createMockDb({
      curriculumSelectRows: [{ id: curriculumId, subjectId, version: 1 }],
      topicsFindMany: [topic],
    });

    const result = await getLearningResumeTarget(db, profileId);

    expect(result).toMatchObject({
      subjectId,
      subjectName: 'Mathematics',
      topicId: 'topic-1',
      topicTitle: 'Algebra',
      sessionId: 'active-session',
      resumeFromSessionId: null,
      resumeKind: 'active_session',
    });
  });

  it('uses the newest meaningful subject-scoped conversation, not the first incomplete topic', async () => {
    const subject = mockSubjectRow({ id: 'biology-sub', name: 'Biology' });
    const olderTopic = mockTopicRow({
      id: 'cells-topic',
      title: 'Cells',
      sortOrder: 1,
    });
    const newerTopic = mockTopicRow({
      id: 'photosynthesis-topic',
      title: 'Photosynthesis',
      sortOrder: 2,
    });
    setupScopedRepo({
      subjectsFindMany: [subject],
      sessionsFindMany: [
        mockSessionRow({
          id: 'old-bio-chat',
          subjectId: 'biology-sub',
          topicId: 'cells-topic',
          status: 'completed',
          lastActivityAt: new Date('2026-02-12T09:00:00.000Z'),
        }),
        mockSessionRow({
          id: 'new-bio-chat',
          subjectId: 'biology-sub',
          topicId: 'photosynthesis-topic',
          status: 'completed',
          lastActivityAt: new Date('2026-02-15T09:00:00.000Z'),
        }),
      ],
    });
    const db = createMockDb({
      curriculumSelectRows: [
        { id: curriculumId, subjectId: 'biology-sub', version: 1 },
      ],
      topicsFindMany: [olderTopic, newerTopic],
    });

    const result = await getLearningResumeTarget(db, profileId, {
      subjectId: 'biology-sub',
    });

    expect(result).toMatchObject({
      subjectId: 'biology-sub',
      subjectName: 'Biology',
      topicId: 'photosynthesis-topic',
      topicTitle: 'Photosynthesis',
      sessionId: null,
      resumeFromSessionId: 'new-bio-chat',
      resumeKind: 'recent_topic',
    });
  });

  it('picks the newest meaningful thread across active subjects', async () => {
    const biology = mockSubjectRow({ id: 'biology-sub', name: 'Biology' });
    const maths = mockSubjectRow({ id: 'maths-sub', name: 'Maths' });
    const bioTopic = mockTopicRow({
      id: 'bio-topic',
      title: 'DNA',
      curriculumId: 'bio-curriculum',
    });
    const mathsTopic = mockTopicRow({
      id: 'maths-topic',
      title: 'Fractions',
      curriculumId: 'maths-curriculum',
    });
    setupScopedRepo({
      subjectsFindMany: [biology, maths],
      sessionsFindMany: [
        mockSessionRow({
          id: 'bio-chat',
          subjectId: 'biology-sub',
          topicId: 'bio-topic',
          status: 'completed',
          lastActivityAt: new Date('2026-02-14T09:00:00.000Z'),
        }),
        mockSessionRow({
          id: 'maths-chat',
          subjectId: 'maths-sub',
          topicId: 'maths-topic',
          status: 'completed',
          lastActivityAt: new Date('2026-02-15T09:00:00.000Z'),
        }),
      ],
    });
    const db = createMockDb({
      curriculumSelectRows: [
        { id: 'bio-curriculum', subjectId: 'biology-sub', version: 1 },
        { id: 'maths-curriculum', subjectId: 'maths-sub', version: 1 },
      ],
      topicsFindMany: [bioTopic, mathsTopic],
    });

    const result = await getLearningResumeTarget(db, profileId);

    expect(result).toMatchObject({
      subjectId: 'maths-sub',
      subjectName: 'Maths',
      topicId: 'maths-topic',
      topicTitle: 'Fractions',
      resumeFromSessionId: 'maths-chat',
    });
  });

  it('ignores ghost sessions and falls back to the next topic', async () => {
    const subject = mockSubjectRow();
    const topic = mockTopicRow({ id: 'topic-1', title: 'Algebra' });
    setupScopedRepo({
      subjectsFindMany: [subject],
      retentionCardsFindMany: [],
      assessmentsFindMany: [],
      sessionsFindMany: [
        mockSessionRow({
          id: 'ghost-session',
          topicId: 'topic-1',
          status: 'active',
          exchangeCount: 0,
        }),
      ],
    });
    const db = createMockDb({
      curriculumSelectRows: [{ id: curriculumId, subjectId, version: 1 }],
      topicsFindMany: [topic],
    });

    const result = await getLearningResumeTarget(db, profileId);

    expect(result).toMatchObject({
      topicId: 'topic-1',
      sessionId: null,
      resumeFromSessionId: null,
      resumeKind: 'next_topic',
    });
  });

  it('[WI-80] does not resume a session attached to a mixed-parent topic', async () => {
    const subject = mockSubjectRow();
    const mixedParentTopic = mockTopicRow({
      id: 'mixed-parent-topic',
      title: 'Foreign Book Topic',
      bookId: 'foreign-book',
    });
    setupScopedRepo({
      subjectsFindMany: [subject],
      sessionsFindMany: [
        mockSessionRow({
          id: 'mixed-parent-session',
          topicId: 'mixed-parent-topic',
          status: 'active',
          lastActivityAt: new Date('2026-02-15T09:00:00.000Z'),
        }),
      ],
    });
    const db = createMockDb({
      curriculumSelectRows: [{ id: curriculumId, subjectId, version: 1 }],
      topicsFindMany: [mixedParentTopic],
      ownedTopicRows: [],
    });

    const result = await getLearningResumeTarget(db, profileId);

    expect(result).toBeNull();
  });

  it('[WI-80] does not suggest a next topic from a mixed parent chain', async () => {
    const subject = mockSubjectRow();
    const mixedParentTopic = mockTopicRow({
      id: 'mixed-parent-topic',
      title: 'Foreign Book Topic',
      bookId: 'foreign-book',
    });
    setupScopedRepo({
      subjectsFindMany: [subject],
      retentionCardsFindMany: [],
      assessmentsFindMany: [],
      sessionsFindMany: [],
    });
    const db = createMockDb({
      curriculumSelectRows: [{ id: curriculumId, subjectId, version: 1 }],
      topicsFindMany: [mixedParentTopic],
      ownedTopicRows: [],
    });

    const result = await getLearningResumeTarget(db, profileId);

    expect(result).toBeNull();
  });

  it('resumes a subject-level session even when no curriculum exists yet', async () => {
    const subject = mockSubjectRow({ name: 'Biography' });
    setupScopedRepo({
      subjectsFindMany: [subject],
      sessionsFindMany: [
        mockSessionRow({
          id: 'biography-chat',
          topicId: null,
          status: 'completed',
          lastActivityAt: new Date('2026-02-15T09:00:00.000Z'),
        }),
      ],
    });
    const db = createMockDb({ curriculumSelectRows: [] });

    const result = await getLearningResumeTarget(db, profileId);

    expect(result).toMatchObject({
      subjectId,
      subjectName: 'Biography',
      topicId: null,
      sessionId: null,
      resumeFromSessionId: 'biography-chat',
      resumeKind: 'subject_freeform',
    });
  });

  it('limits book-scoped resume to topics in that book', async () => {
    const subject = mockSubjectRow();
    const otherBookTopic = mockTopicRow({
      id: 'other-topic',
      title: 'Other book',
      bookId: 'other-book',
    });
    const targetTopic = mockTopicRow({
      id: 'book-topic',
      title: 'Target book',
      bookId: 'book-1',
    });
    setupScopedRepo({
      subjectsFindMany: [subject],
      sessionsFindMany: [
        mockSessionRow({
          id: 'other-book-chat',
          topicId: 'other-topic',
          status: 'completed',
          lastActivityAt: new Date('2026-02-15T09:30:00.000Z'),
        }),
        mockSessionRow({
          id: 'target-book-chat',
          topicId: 'book-topic',
          status: 'completed',
          lastActivityAt: new Date('2026-02-15T09:00:00.000Z'),
        }),
      ],
    });
    const db = createMockDb({
      curriculumSelectRows: [{ id: curriculumId, subjectId, version: 1 }],
      topicsFindMany: [otherBookTopic, targetTopic],
    });

    const result = await getLearningResumeTarget(db, profileId, {
      bookId: 'book-1',
    });

    expect(result).toMatchObject({
      topicId: 'book-topic',
      resumeFromSessionId: 'target-book-chat',
    });
  });
});

// ---------------------------------------------------------------------------
// getContinueSuggestion
// ---------------------------------------------------------------------------

describe('getContinueSuggestion', () => {
  it('returns null when no subjects', async () => {
    setupScopedRepo({ subjectsFindMany: [] });
    const db = createMockDb();
    const result = await getContinueSuggestion(db, profileId);
    expect(result).toBeNull();
  });

  it('returns first incomplete topic', async () => {
    const subject = mockSubjectRow();
    const topic1 = mockTopicRow({
      id: 'topic-1',
      title: 'Algebra',
      sortOrder: 1,
    });
    const topic2 = mockTopicRow({
      id: 'topic-2',
      title: 'Geometry',
      sortOrder: 2,
    });

    setupScopedRepo({
      subjectsFindMany: [subject],
      retentionCardsFindMany: [],
      assessmentsFindMany: [],
    });
    const db = createMockDb({
      curriculumSelectRows: [{ id: curriculumId, subjectId, version: 1 }],
      topicsFindMany: [topic1, topic2],
    });

    const result = await getContinueSuggestion(db, profileId);

    expect(result).not.toBeNull();
    expect(result!.topicId).toBe('topic-1');
    expect(result!.topicTitle).toBe('Algebra');
    expect(result!.subjectId).toBe(subjectId);
    expect(result!.subjectName).toBe('Mathematics');
    expect(result!.lastSessionId).toBeNull();
  });

  it('[WI-80] does not suggest a mixed-parent topic', async () => {
    const subject = mockSubjectRow();
    const mixedParentTopic = mockTopicRow({
      id: 'mixed-parent-topic',
      title: 'Foreign Book Topic',
      bookId: 'foreign-book',
      sortOrder: 1,
    });

    setupScopedRepo({
      subjectsFindMany: [subject],
      retentionCardsFindMany: [],
      assessmentsFindMany: [],
      sessionsFindMany: [],
    });
    const db = createMockDb({
      curriculumSelectRows: [{ id: curriculumId, subjectId, version: 1 }],
      topicsFindMany: [mixedParentTopic],
      ownedTopicRows: [],
    });

    const result = await getContinueSuggestion(db, profileId);

    expect(result).toBeNull();
  });

  it('includes lastSessionId when an active session exists', async () => {
    const subject = mockSubjectRow();
    const topic1 = mockTopicRow({
      id: 'topic-1',
      title: 'Algebra',
      sortOrder: 1,
    });

    setupScopedRepo({
      subjectsFindMany: [subject],
      retentionCardsFindMany: [],
      assessmentsFindMany: [],
      sessionsFindMany: [
        {
          ...mockSessionRow({ topicId: 'topic-1' }),
          id: 'active-session-1',
          status: 'active' as const,
          lastActivityAt: new Date('2026-02-15T09:00:00.000Z'),
        },
      ],
    });
    const db = createMockDb({
      curriculumSelectRows: [{ id: curriculumId, subjectId, version: 1 }],
      topicsFindMany: [topic1],
    });

    const result = await getContinueSuggestion(db, profileId);

    expect(result).not.toBeNull();
    expect(result!.lastSessionId).toBe('active-session-1');
  });

  it('[F-001] returns null lastSessionId when resumable session is on a different topic', async () => {
    // Scenario from 2026-04-18 end-user test report:
    //   - Resumable session exists, but it's on topic-2 (a topic already
    //     paused/skipped-over in the curriculum).
    //   - First unpassed topic (nextTopic) is topic-1.
    //   - Previous behavior: returned sessionId from topic-2 with topicId
    //     of topic-1 — a mismatch that caused the client to create a new
    //     session row on top of a mismatched sessionId param.
    //   - Correct behavior: lastSessionId is null so the client starts a
    //     fresh session on topic-1 cleanly.
    const subject = mockSubjectRow();
    const topic1 = mockTopicRow({
      id: 'topic-1',
      title: 'Algebra',
      sortOrder: 1,
    });
    const topic2 = mockTopicRow({
      id: 'topic-2',
      title: 'Geometry',
      sortOrder: 2,
    });

    setupScopedRepo({
      subjectsFindMany: [subject],
      retentionCardsFindMany: [],
      assessmentsFindMany: [],
      sessionsFindMany: [
        {
          // resumable session on topic-2 — nextTopic will be topic-1
          ...mockSessionRow({ topicId: 'topic-2' }),
          id: 'mismatched-session',
          status: 'active' as const,
          lastActivityAt: new Date('2026-02-15T09:00:00.000Z'),
        },
      ],
    });
    const db = createMockDb({
      curriculumSelectRows: [{ id: curriculumId, subjectId, version: 1 }],
      topicsFindMany: [topic1, topic2],
    });

    const result = await getContinueSuggestion(db, profileId);

    expect(result).not.toBeNull();
    expect(result!.topicId).toBe('topic-1');
    expect(result!.lastSessionId).toBeNull();
  });

  it('skips paused subjects', async () => {
    const pausedSubject = mockSubjectRow({ status: 'paused' });
    setupScopedRepo({ subjectsFindMany: [pausedSubject] });
    const db = createMockDb();
    const result = await getContinueSuggestion(db, profileId);
    expect(result).toBeNull();
  });

  it('picks the most recently active subject, not the oldest', async () => {
    const geoSubjectId = 'geo-subject-id';
    const sciSubjectId = 'sci-subject-id';
    const geoCurriculumId = 'geo-curriculum-id';
    const sciCurriculumId = 'sci-curriculum-id';

    // Geography enrolled first (insertion order), Science enrolled second
    const geography = mockSubjectRow({
      id: geoSubjectId,
      name: 'Geography',
    });
    const science = mockSubjectRow({ id: sciSubjectId, name: 'Science' });

    const geoTopic = mockTopicRow({
      id: 'geo-topic',
      title: 'Map Reading',
      sortOrder: 1,
    });
    // Override curriculumId for science topic
    const sciTopic = {
      ...mockTopicRow({
        id: 'sci-topic',
        title: 'Photosynthesis',
        sortOrder: 1,
      }),
      curriculumId: sciCurriculumId,
    };

    setupScopedRepo({
      subjectsFindMany: [geography, science], // Geography first by insertion order
      retentionCardsFindMany: [],
      assessmentsFindMany: [],
      sessionsFindMany: [
        {
          // [F-001] Sessions must carry topicId matching the subject's
          // nextTopic so the resumable filter finds them. Previously this
          // test relied on the default topicId=null because the service
          // didn't filter by topic.
          ...mockSessionRow({ subjectId: geoSubjectId, topicId: 'geo-topic' }),
          id: 'old-geo-session',
          status: 'completed' as const,
          lastActivityAt: new Date('2026-02-08T10:00:00.000Z'), // 1 week ago
        },
        {
          ...mockSessionRow({ subjectId: sciSubjectId, topicId: 'sci-topic' }),
          id: 'recent-sci-session',
          status: 'active' as const,
          lastActivityAt: new Date('2026-02-15T09:00:00.000Z'), // 1 hour ago
        },
      ],
    });

    const db = createMockDb({
      curriculumSelectRows: [
        { id: geoCurriculumId, subjectId: geoSubjectId, version: 1 },
        { id: sciCurriculumId, subjectId: sciSubjectId, version: 1 },
      ],
      topicsFindMany: [geoTopic, sciTopic],
    });

    const result = await getContinueSuggestion(db, profileId);

    expect(result).not.toBeNull();
    // Should pick Science (most recent activity), NOT Geography (oldest)
    expect(result!.subjectId).toBe(sciSubjectId);
    expect(result!.subjectName).toBe('Science');
    expect(result!.lastSessionId).toBe('recent-sci-session');
  });
});

// ---------------------------------------------------------------------------
// getActiveSessionForTopic [F-4]
// ---------------------------------------------------------------------------

describe('getActiveSessionForTopic', () => {
  it('returns the most recent active/paused session for a topic', async () => {
    const olderSession = {
      ...mockSessionRow({ topicId }),
      id: 'older-session',
      status: 'active' as const,
      lastActivityAt: new Date('2026-02-14T10:00:00.000Z'),
    };
    const newerSession = {
      ...mockSessionRow({ topicId }),
      id: 'newer-session',
      status: 'paused' as const,
      lastActivityAt: new Date('2026-02-15T09:00:00.000Z'),
    };

    setupScopedRepo({
      sessionsFindMany: [olderSession, newerSession],
    });
    const db = createMockDb({ topicFindFirst: mockTopicRow() });

    const result = await getActiveSessionForTopic(db, profileId, topicId);

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('newer-session');
  });

  it('returns null when no active/paused sessions exist', async () => {
    setupScopedRepo({
      sessionsFindMany: [],
    });
    const db = createMockDb();

    const result = await getActiveSessionForTopic(db, profileId, topicId);

    expect(result).toBeNull();
  });

  it('[WI-80] returns null when the topic is not owned through the parent chain', async () => {
    setupScopedRepo({
      sessionsFindMany: [
        {
          ...mockSessionRow({ topicId }),
          id: 'stale-session',
          status: 'active' as const,
        },
      ],
    });
    const db = createMockDb({
      topicFindFirst: mockTopicRow({ id: topicId, bookId: 'foreign-book' }),
      ownedTopicRows: [],
    });

    const result = await getActiveSessionForTopic(db, profileId, topicId);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveTopicSubject [I2]
// ---------------------------------------------------------------------------

describe('resolveTopicSubject', () => {
  it('returns null when topic does not exist', async () => {
    setupScopedRepo();
    const db = createMockDb({ topicFindFirst: undefined });

    const result = await resolveTopicSubject(db, profileId, topicId);
    expect(result).toBeNull();
  });

  it('returns null when curriculum does not exist', async () => {
    setupScopedRepo();
    const db = createMockDb({
      topicFindFirst: mockTopicRow({
        id: topicId,
        title: 'Algebra Basics',
        curriculumId,
      }),
      curriculumFindFirst: undefined,
    });

    const result = await resolveTopicSubject(db, profileId, topicId);
    expect(result).toBeNull();
  });

  it('returns null when subject belongs to a different profile', async () => {
    setupScopedRepo({ subjectFindFirst: undefined });
    const db = createMockDb({
      topicFindFirst: mockTopicRow({
        id: topicId,
        title: 'Algebra Basics',
        curriculumId,
      }),
      curriculumFindFirst: { id: curriculumId, subjectId },
    });

    const result = await resolveTopicSubject(db, profileId, topicId);
    expect(result).toBeNull();
  });

  it('[WI-80] returns null when the topic has a mixed parent chain', async () => {
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow({ name: 'Mathematics' }),
    });
    const db = createMockDb({
      topicFindFirst: mockTopicRow({
        id: topicId,
        title: 'Foreign Book Topic',
        curriculumId,
        bookId: 'foreign-book',
      }),
      curriculumFindFirst: { id: curriculumId, subjectId },
      ownedTopicRows: [],
    });

    const result = await resolveTopicSubject(db, profileId, topicId);

    expect(result).toBeNull();
  });

  it('returns subjectId, subjectName, and topicTitle on success', async () => {
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow({ name: 'Mathematics' }),
    });
    const db = createMockDb({
      topicFindFirst: mockTopicRow({
        id: topicId,
        title: 'Algebra Basics',
        curriculumId,
      }),
      curriculumFindFirst: { id: curriculumId, subjectId },
    });

    const result = await resolveTopicSubject(db, profileId, topicId);

    expect(result).toEqual({
      subjectId,
      subjectName: 'Mathematics',
      topicTitle: 'Algebra Basics',
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 4 additions — profile isolation, null recap, retention edge cases
// ---------------------------------------------------------------------------

describe('getSubjectProgress — profile isolation', () => {
  // The scoped repository enforces profileId at the DB level. The test
  // validates that our service correctly passes the caller's profileId
  // through createScopedRepository so the repo filter is applied.

  it('returns null when the subject exists but belongs to a different profile', async () => {
    // Simulate: repo.subjects.findFirst returns undefined because the subject
    // is owned by a different profile (scoped repo filtered it out).
    setupScopedRepo({ subjectFindFirst: undefined });
    const db = createMockDb();

    const foreignSubjectId = 'foreign-subject-id';
    const result = await getSubjectProgress(db, profileId, foreignSubjectId);

    // Must return null — not throw, and not return data belonging to another profile.
    expect(result).toBeNull();
  });

  it('passes the correct profileId to createScopedRepository on every call', async () => {
    // Break test: if getSubjectProgress hard-codes or silently substitutes a
    // profileId, this check will fail.
    setupScopedRepo({ subjectFindFirst: undefined });
    const db = createMockDb();
    const callerProfileId = 'specific-profile-id-12345';

    await getSubjectProgress(db, callerProfileId, subjectId);

    expect(createScopedRepository).toHaveBeenCalledWith(db, callerProfileId);
  });

  it('[FCR-2026-05-23-L3.L3.4 break] excludes topics that do not belong to the caller profile via findOwnedCurriculumTopics', async () => {
    // Break test for FCR-2026-05-23-L3.L3.4: the initial curriculumTopics.findMany
    // fetches all topics for the curriculum without a profileId filter.
    // Ownership is enforced transitively by findOwnedCurriculumTopics, which
    // joins through subjects.profileId. This test verifies that when
    // findOwnedCurriculumTopics returns zero owned topics (simulating a caller
    // whose profileId does not match any topic's subject owner), the service
    // reports zero topics — not the raw count from the unscoped fetch.
    //
    // Red-green proof:
    //   RED  — if findOwnedCurriculumTopics is bypassed (ownedTopicRows defaults
    //          to the raw topic list), topicsTotal would be 2, not 0.
    //   GREEN — with ownedTopicRows: [] the scoped filter returns no owned topics
    //           and topicsTotal is 0.
    setupScopedRepo({ subjectFindFirst: mockSubjectRow() });
    const topic1 = mockTopicRow({ id: 'topic-a' });
    const topic2 = mockTopicRow({ id: 'topic-b' });
    const db = createMockDb({
      curriculumFindFirst: { id: curriculumId, subjectId },
      topicsFindMany: [topic1, topic2],
      // Simulate findOwnedCurriculumTopics returning nothing for this profile.
      ownedTopicRows: [],
    });

    const result = await getSubjectProgress(db, profileId, subjectId);

    // Must report zero topics — not 2 — because the caller owns none of them.
    expect(result).not.toBeNull();
    expect(result!.topicsTotal).toBe(0);
    expect(result!.topicsCompleted).toBe(0);
  });
});

describe('getOverallProgress — profile isolation', () => {
  it('returns empty subjects for a profile that has no subjects at all', async () => {
    // Simulates a child profile that has just been created — no enrolled subjects.
    setupScopedRepo({ subjectsFindMany: [] });
    const db = createMockDb();

    const result = await getOverallProgress(db, profileId);

    expect(result.subjects).toEqual([]);
    expect(result.totalTopicsCompleted).toBe(0);
    expect(result.totalTopicsVerified).toBe(0);
  });

  it('passes the correct profileId to createScopedRepository', async () => {
    setupScopedRepo({ subjectsFindMany: [] });
    const db = createMockDb();
    const callerProfileId = 'isolated-profile-xyz';

    await getOverallProgress(db, callerProfileId);

    expect(createScopedRepository).toHaveBeenCalledWith(db, callerProfileId);
  });
});

describe('getTopicProgress — null recap fields', () => {
  it('returns null summaryExcerpt when no session summary exists', async () => {
    const topic = mockTopicRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: undefined,
      assessmentsFindMany: [],
      sessionsFindMany: [mockSessionRow({ topicId })],
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [],
      sessionSummariesFindMany: [], // No summary rows
    });
    const db = createMockDb({ topicFindFirst: topic });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result).not.toBeNull();
    // null summaryExcerpt must not cause a crash or type error
    expect(result!.summaryExcerpt).toBeNull();
  });

  it('returns null retentionStatus when no retention card exists', async () => {
    const topic = mockTopicRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: undefined, // No card
      assessmentsFindMany: [],
      sessionsFindMany: [mockSessionRow({ topicId })],
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [],
    });
    const db = createMockDb({ topicFindFirst: topic });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result).not.toBeNull();
    expect(result!.retentionStatus).toBeNull();
    expect(result!.daysSinceLastReview).toBeNull();
    expect(result!.xpStatus).toBeNull();
  });

  it('returns null xpStatus when no XP ledger entry exists', async () => {
    const topic = mockTopicRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: undefined,
      assessmentsFindMany: [],
      sessionsFindMany: [],
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [], // No XP
    });
    const db = createMockDb({ topicFindFirst: topic });

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result).not.toBeNull();
    expect(result!.xpStatus).toBeNull();
    expect(result!.masteryScore).toBeNull();
  });
});

describe('getContinueSuggestion — profile isolation', () => {
  it('passes the correct profileId to createScopedRepository', async () => {
    const callerProfileId = 'isolated-suggestion-profile';
    setupScopedRepo({ subjectsFindMany: [] });
    const db = createMockDb();

    await getContinueSuggestion(db, callerProfileId);

    expect(createScopedRepository).toHaveBeenCalledWith(db, callerProfileId);
  });
});

// ---------------------------------------------------------------------------
// getOverallProgressBatch — SECURITY: cross-profile data leak break test
// (CCR PR #309 finding 3658bce9-1f7c-81c8-9db1-e461ce18c442)
//
// Before fix, the "every profile has zero subjects" branch built a single
// `emptyResult` with `practiceSummary: practiceSummaries.values().next().value`
// — the FIRST profile's practice summary. Profiles missing from
// `practiceSummaries` then received that shared object, leaking profile A's
// practice data (points, scores, byType, bySubject) to profile B.
//
// The break test exercises the all-empty-subjects branch directly with
// A populated and B explicitly absent from the practice summaries map.
// ---------------------------------------------------------------------------

describe('getOverallProgressBatch — cross-profile data leak (security)', () => {
  function makeBatchDb(allSubjects: unknown[] = []): Database {
    // The batch function only hits db.query.subjects.findMany in the
    // all-empty-subjects branch we are testing — and the practice batch
    // is module-mocked above so no other db paths execute.
    return {
      query: {
        subjects: {
          findMany: jest.fn().mockResolvedValue(allSubjects),
        },
      },
    } as unknown as Database;
  }

  it('does NOT leak profile A practice summary into profile B when B has no practice data', async () => {
    const profileA = '11111111-1111-1111-1111-111111111111';
    const profileB = '22222222-2222-2222-2222-222222222222';

    // Profile A: populated practice summary. Profile B: ABSENT from the map.
    // (This is the worst-case shape that triggered the original leak —
    // the get(B) returns undefined, so pre-fix code falls back to the
    // shared emptyResult which was seeded from A's summary.)
    const profileAPractice = {
      quizzesCompleted: 7,
      reviewsCompleted: 3,
      totals: {
        activitiesCompleted: 10,
        reviewsCompleted: 3,
        pointsEarned: 999, // sentinel — must NEVER appear in B's result
        celebrations: 4,
        distinctActivityTypes: 2,
      },
      scores: {
        scoredActivities: 7,
        score: 42,
        total: 70,
        accuracy: 0.6,
      },
      byType: [{ activityType: 'quiz', count: 7 }],
      bySubject: [
        {
          subjectId: 'subj-a-secret',
          subjectName: 'A Secret Subject',
          count: 7,
        },
      ],
    };

    mockGetPracticeActivitySummaryBatch.mockResolvedValueOnce(
      new Map<string, unknown>([[profileA, profileAPractice]]),
    );

    const db = makeBatchDb([]); // empty — triggers allSubjects.length===0 branch

    const result = await getOverallProgressBatch(db, [profileA, profileB]);

    // Profile A: gets its own data back unchanged.
    const resultA = result.get(profileA);
    expect(resultA).toBeDefined();
    expect(resultA!.practiceSummary.totals.pointsEarned).toBe(999);
    expect(resultA!.practiceSummary.bySubject).toEqual([
      { subjectId: 'subj-a-secret', subjectName: 'A Secret Subject', count: 7 },
    ]);

    // Profile B: gets the ZEROED default, NOT profile A's summary.
    // These assertions are what would fail under the pre-fix code, because
    // B fell through to `emptyResult` whose practiceSummary was A's.
    const resultB = result.get(profileB);
    expect(resultB).toBeDefined();
    expect(resultB!.practiceSummary.totals.pointsEarned).toBe(0);
    expect(resultB!.practiceSummary.totals.activitiesCompleted).toBe(0);
    expect(resultB!.practiceSummary.totals.celebrations).toBe(0);
    expect(resultB!.practiceSummary.quizzesCompleted).toBe(0);
    expect(resultB!.practiceSummary.reviewsCompleted).toBe(0);
    expect(resultB!.practiceSummary.scores.score).toBe(0);
    expect(resultB!.practiceSummary.scores.total).toBe(0);
    expect(resultB!.practiceSummary.scores.accuracy).toBeNull();
    expect(resultB!.practiceSummary.byType).toEqual([]);
    expect(resultB!.practiceSummary.bySubject).toEqual([]);
    expect(resultB!.practiceActivityCount).toBe(0);

    // And — critically — B's practiceSummary must not be the SAME OBJECT
    // as A's. Identity check catches any future regression where the
    // fallback again uses .values().next().value.
    expect(resultB!.practiceSummary).not.toBe(resultA!.practiceSummary);
  });

  it('[WI-80] excludes mixed-parent topics from batch progress aggregation', async () => {
    const subject = mockSubjectRow({ id: 'sub-1', name: 'Math' });
    const curriculumIdLocal = 'curr-1';
    const ownedTopic = {
      ...mockTopicRow({ id: 'owned-topic', sortOrder: 1 }),
      curriculumId: curriculumIdLocal,
    };
    const mixedParentTopic = {
      ...mockTopicRow({
        id: 'mixed-parent-topic',
        bookId: 'foreign-book',
        sortOrder: 2,
      }),
      curriculumId: curriculumIdLocal,
    };

    mockGetPracticeActivitySummaryBatch.mockResolvedValueOnce(
      new Map([[profileId, emptyPracticeActivitySummary]]),
    );
    const db = createMockDb({
      curriculaFindMany: [{ id: curriculumIdLocal, subjectId: 'sub-1' }],
      topicsFindMany: [ownedTopic, mixedParentTopic],
      ownedTopicRows: [mockOwnedTopicRow(ownedTopic)],
    });
    const query = db.query as unknown as Record<
      string,
      { findMany: jest.Mock }
    >;
    query.subjects = { findMany: jest.fn().mockResolvedValue([subject]) };
    query.retentionCards = {
      findMany: jest.fn().mockResolvedValue([
        mockRetentionCard({ topicId: 'owned-topic', xpStatus: 'verified' }),
        mockRetentionCard({
          topicId: 'mixed-parent-topic',
          xpStatus: 'verified',
        }),
      ]),
    };
    query.assessments = {
      findMany: jest.fn().mockResolvedValue([
        mockAssessmentRow({
          topicId: 'mixed-parent-topic',
          status: 'passed',
        }),
      ]),
    };
    query.learningSessions = { findMany: jest.fn().mockResolvedValue([]) };
    query.sessionSummaries = { findMany: jest.fn().mockResolvedValue([]) };

    const result = await getOverallProgressBatch(db, [profileId]);
    const progress = result.get(profileId);

    expect(progress).toBeDefined();
    expect(progress!.subjects[0]).toMatchObject({
      topicsTotal: 1,
      topicsCompleted: 1,
      topicsVerified: 1,
    });
    expect(progress!.totalTopicsCompleted).toBe(1);
    expect(progress!.totalTopicsVerified).toBe(1);
  });

  it('[WI-80] does not count another profile summary as completion for a profile-owned short session', async () => {
    const profileA = profileId;
    const profileB = 'other-profile-id';
    const subject = mockSubjectRow({ id: 'sub-summary-mismatch' });
    const curriculumIdLocal = 'curr-summary-mismatch';
    const ownedTopic = {
      ...mockTopicRow({ id: 'topic-summary-mismatch', sortOrder: 1 }),
      curriculumId: curriculumIdLocal,
    };

    mockGetPracticeActivitySummaryBatch.mockResolvedValueOnce(
      new Map([[profileA, emptyPracticeActivitySummary]]),
    );
    const db = createMockDb({
      curriculaFindMany: [
        { id: curriculumIdLocal, subjectId: 'sub-summary-mismatch' },
      ],
      topicsFindMany: [ownedTopic],
      ownedTopicRows: [mockOwnedTopicRow(ownedTopic)],
    });
    const query = db.query as unknown as Record<
      string,
      { findMany: jest.Mock }
    >;
    query.subjects = { findMany: jest.fn().mockResolvedValue([subject]) };
    query.retentionCards = { findMany: jest.fn().mockResolvedValue([]) };
    query.assessments = { findMany: jest.fn().mockResolvedValue([]) };
    query.learningSessions = {
      findMany: jest.fn().mockResolvedValue([
        mockSessionRow({
          id: 'session-short-owned-by-a',
          subjectId: 'sub-summary-mismatch',
          topicId: 'topic-summary-mismatch',
          exchangeCount: 1,
        }),
      ]),
    };
    query.sessionSummaries = {
      findMany: jest.fn().mockResolvedValue([
        {
          sessionId: 'session-short-owned-by-a',
          profileId: profileB,
          status: 'accepted',
        },
      ]),
    };

    const result = await getOverallProgressBatch(db, [profileA]);
    const progress = result.get(profileA);

    expect(progress).toBeDefined();
    expect(progress!.subjects[0]).toMatchObject({
      topicsTotal: 1,
      topicsCompleted: 0,
      topicsVerified: 0,
    });
    expect(progress!.totalTopicsCompleted).toBe(0);
  });
});
