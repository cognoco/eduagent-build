// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockFamilyLinksFindMany = jest.fn();
const mockFamilyLinksFindFirst = jest.fn();
const mockProfilesFindFirst = jest.fn();
const mockSessionsFindMany = jest.fn();
const mockCurriculaFindFirst = jest.fn();
const mockCurriculumTopicsFindMany = jest.fn();

jest.mock('@eduagent/database', () => ({
  familyLinks: {
    parentProfileId: 'parent_profile_id',
    childProfileId: 'child_profile_id',
  },
  profiles: { id: 'id' },
  learningSessions: { profileId: 'profile_id', startedAt: 'started_at' },
  curricula: { subjectId: 'subject_id' },
  curriculumTopics: { curriculumId: 'curriculum_id' },
}));

const mockGetOverallProgress = jest.fn();
const mockGetTopicProgress = jest.fn();

jest.mock('./progress', () => ({
  getOverallProgress: (...args: unknown[]) => mockGetOverallProgress(...args),
  getTopicProgress: (...args: unknown[]) => mockGetTopicProgress(...args),
}));

import {
  generateChildSummary,
  calculateTrend,
  calculateGuidedRatio,
  type DashboardInput,
} from './dashboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDashboardInput(
  overrides: Partial<DashboardInput> = {}
): DashboardInput {
  return {
    childProfileId: 'child-1',
    displayName: 'Alex',
    sessionsThisWeek: 4,
    sessionsLastWeek: 2,
    totalTimeThisWeekMinutes: 60,
    totalTimeLastWeekMinutes: 30,
    subjectRetentionData: [
      { name: 'Math', status: 'strong' },
      { name: 'Science', status: 'fading' },
    ],
    guidedCount: 3,
    totalProblemCount: 5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateChildSummary
// ---------------------------------------------------------------------------

describe('generateChildSummary', () => {
  it('includes the child display name', () => {
    const summary = generateChildSummary(createDashboardInput());

    expect(summary).toMatch(/^Alex:/);
  });

  it('includes problem count and guided count', () => {
    const summary = generateChildSummary(createDashboardInput());

    expect(summary).toContain('5 problems');
    expect(summary).toContain('3 guided');
  });

  it('includes fading subjects', () => {
    const summary = generateChildSummary(createDashboardInput());

    expect(summary).toContain('Science fading');
  });

  it('includes session trend information', () => {
    const summary = generateChildSummary(createDashboardInput());

    expect(summary).toContain('4 sessions this week');
    expect(summary).toContain('up from 2');
  });

  it('handles down trend', () => {
    const summary = generateChildSummary(
      createDashboardInput({
        sessionsThisWeek: 1,
        sessionsLastWeek: 5,
      })
    );

    expect(summary).toContain('down from 5');
  });
});

// ---------------------------------------------------------------------------
// calculateTrend
// ---------------------------------------------------------------------------

describe('calculateTrend', () => {
  it('returns up when current exceeds previous', () => {
    expect(calculateTrend(5, 3)).toBe('up');
  });

  it('returns down when current is less than previous', () => {
    expect(calculateTrend(2, 5)).toBe('down');
  });

  it('returns stable when equal', () => {
    expect(calculateTrend(3, 3)).toBe('stable');
  });
});

// ---------------------------------------------------------------------------
// calculateGuidedRatio
// ---------------------------------------------------------------------------

describe('calculateGuidedRatio', () => {
  it('calculates ratio correctly', () => {
    expect(calculateGuidedRatio(3, 10)).toBeCloseTo(0.3);
  });

  it('returns 0 when total is 0', () => {
    expect(calculateGuidedRatio(0, 0)).toBe(0);
  });

  it('returns 1 when all are guided', () => {
    expect(calculateGuidedRatio(5, 5)).toBe(1);
  });

  it('clamps to 1 if guided exceeds total', () => {
    expect(calculateGuidedRatio(10, 5)).toBe(1);
  });

  it('returns 0 when no guided problems', () => {
    expect(calculateGuidedRatio(0, 10)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DB-aware functions — lazy import to allow mock wiring
// ---------------------------------------------------------------------------

// We cannot import these at top level because they depend on mocked modules.
// Import them lazily inside the describe blocks.
async function importDbFunctions() {
  // Force re-import to pick up mocks
  return await import('./dashboard');
}

function createMockDb() {
  return {
    query: {
      familyLinks: {
        findMany: mockFamilyLinksFindMany,
        findFirst: mockFamilyLinksFindFirst,
      },
      profiles: {
        findFirst: mockProfilesFindFirst,
      },
      learningSessions: {
        findMany: mockSessionsFindMany,
      },
      curricula: {
        findFirst: mockCurriculaFindFirst,
      },
      curriculumTopics: {
        findMany: mockCurriculumTopicsFindMany,
      },
    },
  } as unknown;
}

const PARENT_ID = '00000000-0000-0000-0000-000000000001';
const CHILD_ID = '00000000-0000-0000-0000-000000000002';
const SUBJECT_ID = '00000000-0000-0000-0000-000000000003';
const CURRICULUM_ID = '00000000-0000-0000-0000-000000000004';
const TOPIC_ID_1 = '00000000-0000-0000-0000-000000000005';
const TOPIC_ID_2 = '00000000-0000-0000-0000-000000000006';

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getChildrenForParent
// ---------------------------------------------------------------------------

describe('getChildrenForParent', () => {
  it('returns empty array when no family links exist', async () => {
    const { getChildrenForParent } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindMany.mockResolvedValue([]);

    const result = await getChildrenForParent(db as never, PARENT_ID);

    expect(result).toEqual([]);
    expect(mockFamilyLinksFindMany).toHaveBeenCalled();
  });

  it('returns aggregated children data when links exist', async () => {
    const { getChildrenForParent } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindMany.mockResolvedValue([
      { parentProfileId: PARENT_ID, childProfileId: CHILD_ID },
    ]);

    mockProfilesFindFirst.mockResolvedValue({
      id: CHILD_ID,
      displayName: 'Alex',
    });

    mockGetOverallProgress.mockResolvedValue({
      subjects: [
        { name: 'Math', retentionStatus: 'strong' },
        { name: 'Science', retentionStatus: 'fading' },
      ],
      totalTopicsCompleted: 5,
      totalTopicsVerified: 2,
    });

    // Recent sessions — 2 this week, 1 last week
    const now = new Date();
    const thisWeekDate = new Date(now);
    const lastWeekDate = new Date(now);
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);

    mockSessionsFindMany.mockResolvedValue([
      { startedAt: thisWeekDate, durationSeconds: 600 },
      { startedAt: thisWeekDate, durationSeconds: 900 },
      { startedAt: lastWeekDate, durationSeconds: 300 },
    ]);

    const result = await getChildrenForParent(db as never, PARENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].profileId).toBe(CHILD_ID);
    expect(result[0].displayName).toBe('Alex');
    expect(result[0].sessionsThisWeek).toBe(2);
    expect(result[0].sessionsLastWeek).toBe(1);
    expect(result[0].trend).toBe('up');
    expect(result[0].subjects).toHaveLength(2);
    expect(result[0].subjects[0].name).toBe('Math');
    expect(result[0].subjects[1].retentionStatus).toBe('fading');
  });

  it('skips children whose profile is not found', async () => {
    const { getChildrenForParent } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindMany.mockResolvedValue([
      { parentProfileId: PARENT_ID, childProfileId: CHILD_ID },
    ]);

    mockProfilesFindFirst.mockResolvedValue(null);

    const result = await getChildrenForParent(db as never, PARENT_ID);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getChildDetail
// ---------------------------------------------------------------------------

describe('getChildDetail', () => {
  it('returns null when no parent-child link exists', async () => {
    const { getChildDetail } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue(null);

    const result = await getChildDetail(db as never, PARENT_ID, CHILD_ID);

    expect(result).toBeNull();
    expect(mockFamilyLinksFindFirst).toHaveBeenCalled();
  });

  it('returns child detail when link exists', async () => {
    const { getChildDetail } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue({
      parentProfileId: PARENT_ID,
      childProfileId: CHILD_ID,
    });

    // getChildDetail delegates to getChildrenForParent internally
    mockFamilyLinksFindMany.mockResolvedValue([
      { parentProfileId: PARENT_ID, childProfileId: CHILD_ID },
    ]);
    mockProfilesFindFirst.mockResolvedValue({
      id: CHILD_ID,
      displayName: 'Alex',
    });
    mockGetOverallProgress.mockResolvedValue({
      subjects: [],
      totalTopicsCompleted: 0,
      totalTopicsVerified: 0,
    });
    mockSessionsFindMany.mockResolvedValue([]);

    const result = await getChildDetail(db as never, PARENT_ID, CHILD_ID);

    expect(result).not.toBeNull();
    expect(result?.profileId).toBe(CHILD_ID);
  });
});

// ---------------------------------------------------------------------------
// getChildSubjectTopics
// ---------------------------------------------------------------------------

describe('getChildSubjectTopics', () => {
  it('returns empty when no parent-child link exists', async () => {
    const { getChildSubjectTopics } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue(null);

    const result = await getChildSubjectTopics(
      db as never,
      PARENT_ID,
      CHILD_ID,
      SUBJECT_ID
    );

    expect(result).toEqual([]);
  });

  it('returns empty when no curriculum exists for the subject', async () => {
    const { getChildSubjectTopics } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue({
      parentProfileId: PARENT_ID,
      childProfileId: CHILD_ID,
    });
    mockCurriculaFindFirst.mockResolvedValue(null);

    const result = await getChildSubjectTopics(
      db as never,
      PARENT_ID,
      CHILD_ID,
      SUBJECT_ID
    );

    expect(result).toEqual([]);
  });

  it('returns topic progress when link and curriculum exist', async () => {
    const { getChildSubjectTopics } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue({
      parentProfileId: PARENT_ID,
      childProfileId: CHILD_ID,
    });
    mockCurriculaFindFirst.mockResolvedValue({
      id: CURRICULUM_ID,
      subjectId: SUBJECT_ID,
    });
    mockCurriculumTopicsFindMany.mockResolvedValue([
      { id: TOPIC_ID_1, curriculumId: CURRICULUM_ID, title: 'Topic 1' },
      { id: TOPIC_ID_2, curriculumId: CURRICULUM_ID, title: 'Topic 2' },
    ]);

    mockGetTopicProgress
      .mockResolvedValueOnce({
        topicId: TOPIC_ID_1,
        title: 'Topic 1',
        description: 'Desc 1',
        completionStatus: 'completed',
        retentionStatus: 'strong',
        struggleStatus: 'normal',
        masteryScore: 0.9,
        summaryExcerpt: null,
        xpStatus: 'verified',
      })
      .mockResolvedValueOnce(null); // Topic 2 returns null (filtered out)

    const result = await getChildSubjectTopics(
      db as never,
      PARENT_ID,
      CHILD_ID,
      SUBJECT_ID
    );

    expect(result).toHaveLength(1);
    expect(result[0].topicId).toBe(TOPIC_ID_1);
    expect(result[0].completionStatus).toBe('completed');
  });
});
