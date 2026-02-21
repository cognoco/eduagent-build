// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockFamilyLinksFindMany = jest.fn();
const mockFamilyLinksFindFirst = jest.fn();
const mockProfilesFindFirst = jest.fn();
const mockSessionsFindMany = jest.fn();
const mockSessionsFindFirst = jest.fn();
const mockSessionEventsFindMany = jest.fn();
const mockCurriculaFindFirst = jest.fn();
const mockCurriculumTopicsFindMany = jest.fn();

jest.mock('@eduagent/database', () => ({
  familyLinks: {
    parentProfileId: 'parent_profile_id',
    childProfileId: 'child_profile_id',
  },
  profiles: { id: 'id' },
  learningSessions: {
    id: 'id',
    profileId: 'profile_id',
    startedAt: 'started_at',
  },
  sessionEvents: {
    profileId: 'profile_id',
    eventType: 'event_type',
    sessionId: 'session_id',
    createdAt: 'created_at',
  },
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
  calculateRetentionTrend,
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
// calculateRetentionTrend
// ---------------------------------------------------------------------------

describe('calculateRetentionTrend', () => {
  it('returns improving when strong subjects outnumber weak+fading', () => {
    expect(
      calculateRetentionTrend([
        { status: 'strong' },
        { status: 'strong' },
        { status: 'fading' },
      ])
    ).toBe('improving');
  });

  it('returns declining when weak+fading outnumber strong', () => {
    expect(
      calculateRetentionTrend([
        { status: 'strong' },
        { status: 'weak' },
        { status: 'fading' },
      ])
    ).toBe('declining');
  });

  it('returns stable when counts are equal', () => {
    expect(
      calculateRetentionTrend([{ status: 'strong' }, { status: 'weak' }])
    ).toBe('stable');
  });

  it('returns stable for empty array', () => {
    expect(calculateRetentionTrend([])).toBe('stable');
  });

  it('returns improving when all subjects are strong', () => {
    expect(
      calculateRetentionTrend([{ status: 'strong' }, { status: 'strong' }])
    ).toBe('improving');
  });

  it('returns declining when all subjects are weak', () => {
    expect(
      calculateRetentionTrend([{ status: 'weak' }, { status: 'fading' }])
    ).toBe('declining');
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
        findFirst: mockSessionsFindFirst,
      },
      sessionEvents: {
        findMany: mockSessionEventsFindMany,
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

    mockSessionEventsFindMany.mockResolvedValue([
      { metadata: { escalationRung: 1 } },
      { metadata: { escalationRung: 3 } },
      { metadata: { escalationRung: 4 } },
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
    expect(result[0].guidedVsImmediateRatio).toBeCloseTo(2 / 3);
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
// countGuidedMetrics
// ---------------------------------------------------------------------------

describe('countGuidedMetrics', () => {
  it('counts guided (rung >= 3) and total AI response events', async () => {
    const { countGuidedMetrics } = await importDbFunctions();
    const db = createMockDb();
    mockSessionEventsFindMany.mockResolvedValue([
      { metadata: { escalationRung: 1 } },
      { metadata: { escalationRung: 2 } },
      { metadata: { escalationRung: 3 } },
      { metadata: { escalationRung: 4 } },
      { metadata: { escalationRung: 5 } },
    ]);
    const result = await countGuidedMetrics(db as never, CHILD_ID, new Date());
    expect(result.totalProblemCount).toBe(5);
    expect(result.guidedCount).toBe(3); // rungs 3, 4, 5
  });

  it('returns zeros when no events exist', async () => {
    const { countGuidedMetrics } = await importDbFunctions();
    const db = createMockDb();
    mockSessionEventsFindMany.mockResolvedValue([]);
    const result = await countGuidedMetrics(db as never, CHILD_ID, new Date());
    expect(result.totalProblemCount).toBe(0);
    expect(result.guidedCount).toBe(0);
  });

  it('handles events with missing metadata gracefully', async () => {
    const { countGuidedMetrics } = await importDbFunctions();
    const db = createMockDb();
    mockSessionEventsFindMany.mockResolvedValue([
      { metadata: null },
      { metadata: {} },
      { metadata: { escalationRung: 3 } },
    ]);
    const result = await countGuidedMetrics(db as never, CHILD_ID, new Date());
    expect(result.totalProblemCount).toBe(3);
    expect(result.guidedCount).toBe(1);
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
    mockSessionEventsFindMany.mockResolvedValue([]);

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

// ---------------------------------------------------------------------------
// getChildSessions
// ---------------------------------------------------------------------------

const SESSION_ID_1 = '00000000-0000-0000-0000-000000000010';
const SESSION_ID_2 = '00000000-0000-0000-0000-000000000011';

describe('getChildSessions', () => {
  it('returns empty array when no parent-child link exists', async () => {
    const { getChildSessions } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue(null);

    const result = await getChildSessions(db as never, PARENT_ID, CHILD_ID);

    expect(result).toEqual([]);
    expect(mockFamilyLinksFindFirst).toHaveBeenCalled();
    expect(mockSessionsFindMany).not.toHaveBeenCalled();
  });

  it('returns sessions when parent-child link exists', async () => {
    const { getChildSessions } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue({
      parentProfileId: PARENT_ID,
      childProfileId: CHILD_ID,
    });

    const now = new Date();
    const earlier = new Date(now.getTime() - 3600_000);

    mockSessionsFindMany.mockResolvedValue([
      {
        id: SESSION_ID_1,
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID_1,
        sessionType: 'learning',
        startedAt: now,
        endedAt: now,
        exchangeCount: 8,
        escalationRung: 2,
        durationSeconds: 600,
      },
      {
        id: SESSION_ID_2,
        subjectId: SUBJECT_ID,
        topicId: null,
        sessionType: 'homework',
        startedAt: earlier,
        endedAt: null,
        exchangeCount: 3,
        escalationRung: 1,
        durationSeconds: null,
      },
    ]);

    const result = await getChildSessions(db as never, PARENT_ID, CHILD_ID);

    expect(result).toHaveLength(2);
    expect(result[0].sessionId).toBe(SESSION_ID_1);
    expect(result[0].subjectId).toBe(SUBJECT_ID);
    expect(result[0].topicId).toBe(TOPIC_ID_1);
    expect(result[0].sessionType).toBe('learning');
    expect(result[0].exchangeCount).toBe(8);
    expect(result[0].escalationRung).toBe(2);
    expect(result[0].durationSeconds).toBe(600);
    expect(result[0].startedAt).toBe(now.toISOString());
    expect(result[1].endedAt).toBeNull();
    expect(result[1].durationSeconds).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getChildSessionTranscript
// ---------------------------------------------------------------------------

describe('getChildSessionTranscript', () => {
  it('returns null when no parent-child link exists', async () => {
    const { getChildSessionTranscript } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue(null);

    const result = await getChildSessionTranscript(
      db as never,
      PARENT_ID,
      CHILD_ID,
      SESSION_ID_1
    );

    expect(result).toBeNull();
    expect(mockSessionsFindFirst).not.toHaveBeenCalled();
  });

  it('returns null when session does not belong to child', async () => {
    const { getChildSessionTranscript } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue({
      parentProfileId: PARENT_ID,
      childProfileId: CHILD_ID,
    });
    mockSessionsFindFirst.mockResolvedValue(null);

    const result = await getChildSessionTranscript(
      db as never,
      PARENT_ID,
      CHILD_ID,
      SESSION_ID_1
    );

    expect(result).toBeNull();
  });

  it('returns transcript with exchanges in chronological order', async () => {
    const { getChildSessionTranscript } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue({
      parentProfileId: PARENT_ID,
      childProfileId: CHILD_ID,
    });

    const sessionStart = new Date('2025-06-01T10:00:00Z');
    mockSessionsFindFirst.mockResolvedValue({
      id: SESSION_ID_1,
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID_1,
      sessionType: 'learning',
      startedAt: sessionStart,
      exchangeCount: 4,
    });

    const t1 = new Date('2025-06-01T10:00:10Z');
    const t2 = new Date('2025-06-01T10:00:20Z');
    const t3 = new Date('2025-06-01T10:00:30Z');
    const t4 = new Date('2025-06-01T10:00:40Z');

    mockSessionEventsFindMany.mockResolvedValue([
      {
        eventType: 'user_message',
        content: 'What is gravity?',
        createdAt: t1,
        metadata: null,
      },
      {
        eventType: 'ai_response',
        content:
          'Great question! What do you think happens when you drop a ball?',
        createdAt: t2,
        metadata: { escalationRung: 1 },
      },
      {
        eventType: 'user_message',
        content: 'It falls down',
        createdAt: t3,
        metadata: null,
      },
      {
        eventType: 'ai_response',
        content: 'Exactly! Gravity pulls objects toward Earth.',
        createdAt: t4,
        metadata: { escalationRung: 2 },
      },
    ]);

    const result = await getChildSessionTranscript(
      db as never,
      PARENT_ID,
      CHILD_ID,
      SESSION_ID_1
    );

    expect(result).not.toBeNull();
    expect(result!.session.sessionId).toBe(SESSION_ID_1);
    expect(result!.session.subjectId).toBe(SUBJECT_ID);
    expect(result!.session.topicId).toBe(TOPIC_ID_1);
    expect(result!.session.startedAt).toBe(sessionStart.toISOString());
    expect(result!.session.exchangeCount).toBe(4);

    expect(result!.exchanges).toHaveLength(4);
    expect(result!.exchanges[0].role).toBe('user');
    expect(result!.exchanges[0].content).toBe('What is gravity?');
    expect(result!.exchanges[1].role).toBe('assistant');
    expect(result!.exchanges[1].escalationRung).toBe(1);
    expect(result!.exchanges[2].role).toBe('user');
    expect(result!.exchanges[2].escalationRung).toBeUndefined();
    expect(result!.exchanges[3].role).toBe('assistant');
    expect(result!.exchanges[3].escalationRung).toBe(2);
  });

  it('handles AI responses with missing metadata gracefully', async () => {
    const { getChildSessionTranscript } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue({
      parentProfileId: PARENT_ID,
      childProfileId: CHILD_ID,
    });

    mockSessionsFindFirst.mockResolvedValue({
      id: SESSION_ID_1,
      subjectId: SUBJECT_ID,
      topicId: null,
      sessionType: 'learning',
      startedAt: new Date('2025-06-01T10:00:00Z'),
      exchangeCount: 2,
    });

    const t1 = new Date('2025-06-01T10:00:10Z');
    const t2 = new Date('2025-06-01T10:00:20Z');

    mockSessionEventsFindMany.mockResolvedValue([
      {
        eventType: 'user_message',
        content: 'Hello',
        createdAt: t1,
        metadata: null,
      },
      {
        eventType: 'ai_response',
        content: 'Hi there!',
        createdAt: t2,
        metadata: null,
      },
    ]);

    const result = await getChildSessionTranscript(
      db as never,
      PARENT_ID,
      CHILD_ID,
      SESSION_ID_1
    );

    expect(result).not.toBeNull();
    expect(result!.exchanges).toHaveLength(2);
    expect(result!.exchanges[1].role).toBe('assistant');
    expect(result!.exchanges[1].escalationRung).toBeUndefined();
  });
});
