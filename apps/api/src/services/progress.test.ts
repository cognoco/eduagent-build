jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    createScopedRepository: jest.fn(),
  };
});

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import {
  getSubjectProgress,
  getTopicProgress,
  getOverallProgress,
  getContinueSuggestion,
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
    subjectId: string;
    topicId: string | null;
  }>
) {
  return {
    id: 'session-1',
    profileId,
    subjectId: overrides?.subjectId ?? subjectId,
    topicId: overrides?.topicId ?? null,
    sessionType: 'learning' as const,
    status: 'completed' as const,
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
  topicsFindMany = [] as ReturnType<typeof mockTopicRow>[],
} = {}): Database {
  return {
    query: {
      curricula: {
        findFirst: jest.fn().mockResolvedValue(curriculumFindFirst),
        findMany: jest.fn().mockResolvedValue(curriculaFindMany),
      },
      curriculumTopics: {
        findMany: jest.fn().mockResolvedValue(topicsFindMany),
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

    // Mock repo.retentionCards.findFirst to return null (no cards for any topic)
    (createScopedRepository as jest.Mock).mockReturnValue({
      subjects: {
        findMany: jest.fn().mockResolvedValue([subject]),
      },
      retentionCards: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      assessments: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const db = {
      query: {
        curricula: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: curriculumId, subjectId }),
        },
        curriculumTopics: {
          findMany: jest.fn().mockResolvedValue([topic1, topic2]),
        },
      },
    } as unknown as Database;

    const result = await getContinueSuggestion(db, profileId);

    expect(result).not.toBeNull();
    expect(result!.topicId).toBe('topic-1');
    expect(result!.topicTitle).toBe('Algebra');
    expect(result!.subjectId).toBe(subjectId);
    expect(result!.subjectName).toBe('Mathematics');
  });

  it('skips paused subjects', async () => {
    const pausedSubject = mockSubjectRow({ status: 'paused' });
    setupScopedRepo({ subjectsFindMany: [pausedSubject] });
    const db = createMockDb();
    const result = await getContinueSuggestion(db, profileId);
    expect(result).toBeNull();
  });
});
