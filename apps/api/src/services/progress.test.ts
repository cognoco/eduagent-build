import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  exports: {
    createScopedRepository: jest.fn(),
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import {
  getSubjectProgress,
  getTopicProgress,
  getOverallProgress,
  getContinueSuggestion,
  getActiveSessionForTopic,
  resolveTopicSubject,
} from './progress';

const NOW = new Date('2026-02-15T10:00:00.000Z');
const profileId = 'test-profile-id';
const subjectId = '550e8400-e29b-41d4-a716-446655440000';
const curriculumId = '660e8400-e29b-41d4-a716-446655440000';
const topicId = '770e8400-e29b-41d4-a716-446655440000';

function mockSubjectRow(
  overrides?: Partial<{ id: string; name: string; status: string }>
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
  overrides?: Partial<{ id: string; title: string; sortOrder: number }>
) {
  return {
    id: overrides?.id ?? topicId,
    curriculumId,
    title: overrides?.title ?? 'Algebra Basics',
    description: 'Introduction to algebra',
    sortOrder: overrides?.sortOrder ?? 1,
    relevance: 'core' as const,
    estimatedMinutes: 30,
    skipped: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockRetentionCard(
  overrides?: Partial<{
    topicId: string;
    xpStatus: string;
    nextReviewAt: Date | null;
    failureCount: number;
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
    failureCount: overrides?.failureCount ?? 0,
    consecutiveSuccesses: 2,
    xpStatus: overrides?.xpStatus ?? 'pending',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockAssessmentRow(
  overrides?: Partial<{
    topicId: string;
    status: string;
    masteryScore: string | null;
  }>
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
  }>
) {
  return {
    id: overrides?.id ?? 'session-1',
    profileId,
    subjectId: overrides?.subjectId ?? subjectId,
    topicId: overrides?.topicId ?? null,
    sessionType: 'learning' as const,
    status: overrides?.status ?? ('completed' as const),
    escalationRung: 1,
    exchangeCount: 5,
    startedAt: NOW,
    lastActivityAt: NOW,
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
  curriculaFindMany = [] as Array<{ id: string; subjectId: string }>,
  curriculumSelectRows = [] as Array<{
    id: string;
    subjectId: string;
    version: number;
  }>,
  topicsFindMany = [] as ReturnType<typeof mockTopicRow>[],
  topicFindFirst = undefined as
    | { id: string; title: string; curriculumId: string }
    | undefined,
} = {}): Database {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(curriculumSelectRows),
        }),
      }),
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
  needsDeepeningFindMany = [] as Array<{ topicId: string; status: string }>,
  xpLedgerFindMany = [] as Array<{
    topicId: string;
    status: string;
    createdAt: Date;
  }>,
  sessionSummariesFindFirst = undefined as { content: string } | undefined,
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

  // [BUG-LIB-TOPICS] Library card showed 0/10 topics while the book view showed
  // 1/10 after a completed session — because library only counted
  // assessment.passed / retention.verified, ignoring sessions. Book view counts
  // session-completed topics. Align the two: sessions should also count here.
  describe('[BUG-LIB-TOPICS] session-based topic completion', () => {
    it('counts a topic with a completed session as completed, even without assessment or retention card', async () => {
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
    const db = {
      query: {
        curricula: { findFirst: jest.fn().mockResolvedValue(undefined) },
        curriculumTopics: {
          findFirst: jest.fn().mockResolvedValue(undefined),
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    } as unknown as Database;
    const result = await getTopicProgress(db, profileId, subjectId, topicId);
    expect(result).toBeNull();
  });

  it('returns topic progress with correct fields', async () => {
    const topic = mockTopicRow();
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow(),
      retentionCardFindFirst: mockRetentionCard(),
      assessmentsFindMany: [
        mockAssessmentRow({ status: 'passed', masteryScore: '0.85' }),
      ],
      sessionsFindMany: [mockSessionRow({ topicId })],
      needsDeepeningFindMany: [],
      xpLedgerFindMany: [{ topicId, status: 'pending', createdAt: NOW }],
    });
    const db = {
      query: {
        curricula: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: curriculumId, subjectId }),
        },
        curriculumTopics: {
          findFirst: jest.fn().mockResolvedValue(topic),
          findMany: jest.fn().mockResolvedValue([topic]),
        },
      },
    } as unknown as Database;

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result).not.toBeNull();
    expect(result!.topicId).toBe(topicId);
    expect(result!.title).toBe('Algebra Basics');
    expect(result!.completionStatus).toBe('completed');
    expect(result!.masteryScore).toBe(0.85);
    expect(result!.xpStatus).toBe('pending');
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
    const db = {
      query: {
        curricula: { findFirst: jest.fn().mockResolvedValue(undefined) },
        curriculumTopics: {
          findFirst: jest.fn().mockResolvedValue(topic),
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    } as unknown as Database;

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
    const db = {
      query: {
        curricula: { findFirst: jest.fn().mockResolvedValue(undefined) },
        curriculumTopics: {
          findFirst: jest.fn().mockResolvedValue(topic),
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    } as unknown as Database;

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
    const db = {
      query: {
        curricula: { findFirst: jest.fn().mockResolvedValue(undefined) },
        curriculumTopics: {
          findFirst: jest.fn().mockResolvedValue(topic),
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    } as unknown as Database;

    const result = await getTopicProgress(db, profileId, subjectId, topicId);

    expect(result!.struggleStatus).toBe('blocked');
  });
});
// ---------------------------------------------------------------------------
// getOverallProgress
// ---------------------------------------------------------------------------

describe('getOverallProgress', () => {
  it('returns empty when no subjects', async () => {
    setupScopedRepo({ subjectsFindMany: [] });
    const db = createMockDb();
    const result = await getOverallProgress(db, profileId);

    expect(result.subjects).toEqual([]);
    expect(result.totalTopicsCompleted).toBe(0);
    expect(result.totalTopicsVerified).toBe(0);
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

    const math = result.subjects.find((s) => s.name === 'Math');
    const science = result.subjects.find((s) => s.name === 'Science');
    expect(math).toBeDefined();
    expect(math!.topicsTotal).toBe(1);
    expect(math!.topicsCompleted).toBe(1);
    expect(math!.topicsVerified).toBe(1);
    expect(science).toBeDefined();
    expect(science!.topicsTotal).toBe(1);
    expect(science!.topicsCompleted).toBe(1);
    expect(science!.topicsVerified).toBe(0);
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
    expect(result.subjects[0].topicsTotal).toBe(0);
    expect(result.subjects[0].retentionStatus).toBe('strong');
    expect(result.totalTopicsCompleted).toBe(0);
  });

  // [BUG-LIB-TOPICS] Same semantic mismatch at the overall-progress level —
  // library tab shows 0/N topics per shelf even after a session completed.
  describe('[BUG-LIB-TOPICS] session-based topic completion', () => {
    it('counts topics with completed sessions as completed in the overall aggregate', async () => {
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
      expect(result.subjects[0].topicsTotal).toBe(1);
      expect(result.subjects[0].topicsCompleted).toBe(1);
      expect(result.subjects[0].topicsVerified).toBe(0);
      expect(result.totalTopicsCompleted).toBe(1);
      expect(result.totalTopicsVerified).toBe(0);
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

      expect(result.subjects[0].topicsCompleted).toBe(1);
      expect(result.subjects[0].topicsVerified).toBe(1);
      expect(result.totalTopicsCompleted).toBe(1);
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
    const db = createMockDb();

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
      topicFindFirst: {
        id: topicId,
        title: 'Algebra Basics',
        curriculumId,
      },
      curriculumFindFirst: undefined,
    });

    const result = await resolveTopicSubject(db, profileId, topicId);
    expect(result).toBeNull();
  });

  it('returns null when subject belongs to a different profile', async () => {
    setupScopedRepo({ subjectFindFirst: undefined });
    const db = createMockDb({
      topicFindFirst: {
        id: topicId,
        title: 'Algebra Basics',
        curriculumId,
      },
      curriculumFindFirst: { id: curriculumId, subjectId },
    });

    const result = await resolveTopicSubject(db, profileId, topicId);
    expect(result).toBeNull();
  });

  it('returns subjectId, subjectName, and topicTitle on success', async () => {
    setupScopedRepo({
      subjectFindFirst: mockSubjectRow({ name: 'Mathematics' }),
    });
    const db = createMockDb({
      topicFindFirst: {
        id: topicId,
        title: 'Algebra Basics',
        curriculumId,
      },
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
