// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockFamilyLinksFindMany = jest.fn();
const mockFamilyLinksFindFirst = jest.fn();
const mockProfilesFindFirst = jest.fn();
const mockProfilesFindMany = jest.fn();
const mockSessionsFindMany = jest.fn();
const mockSessionsFindFirst = jest.fn();
const mockSessionEventsFindMany = jest.fn();
const mockSubjectsFindMany = jest.fn();
const mockCurriculaFindFirst = jest.fn();
const mockCurriculumTopicsFindMany = jest.fn();
const mockProgressSnapshotsFindFirst = jest.fn();
const mockProgressSnapshotsFindMany = jest.fn();
const mockMilestonesFindMany = jest.fn();

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  exports: {
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
    subjects: {
      profileId: 'profile_id',
    },
    curricula: { subjectId: 'subject_id' },
    curriculumTopics: { curriculumId: 'curriculum_id' },
    // Epic 15: snapshot-aggregation references these column objects in eq()
    // calls. Column names don't matter for the mock — drizzle-orm's eq() only
    // needs the column reference to exist so it can build a query object.
    progressSnapshots: {
      profileId: 'profile_id',
      snapshotDate: 'snapshot_date',
    },
    milestones: {
      profileId: 'profile_id',
      createdAt: 'created_at',
    },
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

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
    exchangesThisWeek: 15,
    exchangesLastWeek: 8,
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
        findMany: mockProfilesFindMany,
      },
      learningSessions: {
        findMany: mockSessionsFindMany,
        findFirst: mockSessionsFindFirst,
      },
      sessionEvents: {
        findMany: mockSessionEventsFindMany,
      },
      subjects: {
        findMany: mockSubjectsFindMany,
      },
      curricula: {
        findFirst: mockCurriculaFindFirst,
      },
      curriculumTopics: {
        findMany: mockCurriculumTopicsFindMany,
      },
      // Snapshot aggregation reads these when building child progress —
      // mocks default to empty so the legacy getChildrenForParent path still
      // works without needing a snapshot row.
      progressSnapshots: {
        findFirst: mockProgressSnapshotsFindFirst,
        findMany: mockProgressSnapshotsFindMany,
      },
      milestones: {
        findMany: mockMilestonesFindMany,
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
  // Snapshot aggregation defaults — legacy getChildrenForParent tests expect
  // no snapshot rows, so builders fall back to the old non-snapshot path.
  mockProgressSnapshotsFindFirst.mockResolvedValue(null);
  mockProgressSnapshotsFindMany.mockResolvedValue([]);
  mockMilestonesFindMany.mockResolvedValue([]);
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

    mockProfilesFindMany.mockResolvedValue([
      { id: CHILD_ID, displayName: 'Alex' },
    ]);
    mockProfilesFindFirst.mockResolvedValue({
      id: CHILD_ID,
      displayName: 'Alex',
    });

    mockGetOverallProgress.mockResolvedValue({
      subjects: [
        { subjectId: 'subj-math', name: 'Math', retentionStatus: 'strong' },
        {
          subjectId: 'subj-science',
          name: 'Science',
          retentionStatus: 'fading',
        },
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
      {
        profileId: CHILD_ID,
        startedAt: thisWeekDate,
        durationSeconds: 600,
        wallClockSeconds: 720,
        exchangeCount: 10,
      },
      {
        profileId: CHILD_ID,
        startedAt: thisWeekDate,
        durationSeconds: 900,
        wallClockSeconds: 1080,
        exchangeCount: 12,
      },
      {
        profileId: CHILD_ID,
        startedAt: lastWeekDate,
        durationSeconds: 300,
        wallClockSeconds: 360,
        exchangeCount: 5,
      },
    ]);

    mockSessionEventsFindMany.mockResolvedValue([
      { metadata: { escalationRung: 1 } },
      { metadata: { escalationRung: 3 } },
      { metadata: { escalationRung: 4 } },
    ]);

    mockSubjectsFindMany.mockResolvedValue([
      { id: 'subj-math', profileId: CHILD_ID, name: 'Math', rawInput: null },
      {
        id: 'subj-science',
        profileId: CHILD_ID,
        name: 'Science',
        rawInput: 'bugs and stuff',
      },
    ]);

    const result = await getChildrenForParent(db as never, PARENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].profileId).toBe(CHILD_ID);
    expect(result[0].displayName).toBe('Alex');
    expect(result[0].sessionsThisWeek).toBe(2);
    expect(result[0].sessionsLastWeek).toBe(1);
    expect(result[0].trend).toBe('up');
    expect(result[0].totalTimeThisWeek).toBe(30);
    expect(result[0].totalTimeLastWeek).toBe(6);
    expect(result[0].exchangesThisWeek).toBe(22); // 10 + 12
    expect(result[0].exchangesLastWeek).toBe(5);
    expect(result[0].subjects).toHaveLength(2);
    expect(result[0].subjects[0].name).toBe('Math');
    expect(result[0].subjects[0].rawInput).toBeNull();
    expect(result[0].subjects[1].retentionStatus).toBe('fading');
    expect(result[0].subjects[1].rawInput).toBe('bugs and stuff');
    expect(result[0].guidedVsImmediateRatio).toBeCloseTo(2 / 3);
  });

  it('skips children whose profile is not found', async () => {
    const { getChildrenForParent } = await importDbFunctions();
    const db = createMockDb();

    mockFamilyLinksFindMany.mockResolvedValue([
      { parentProfileId: PARENT_ID, childProfileId: CHILD_ID },
    ]);

    // R-03: Batch lookup — profiles.findMany returns empty, so child is skipped
    mockProfilesFindMany.mockResolvedValue([]);
    mockSubjectsFindMany.mockResolvedValue([]);
    mockSessionsFindMany.mockResolvedValue([]);

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
  // [EP15-I5] Break test — previously returned null (and the route
  // serialized that as 200 `{ child: null }`, masking IDOR as a benign
  // not-found). Now throws ForbiddenError so app.onError converts to 403.
  it('throws ForbiddenError when no parent-child link exists', async () => {
    const { getChildDetail } = await importDbFunctions();
    const { ForbiddenError } = await import('../errors');
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue(null);

    await expect(
      getChildDetail(db as never, PARENT_ID, CHILD_ID)
    ).rejects.toBeInstanceOf(ForbiddenError);
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
    mockProfilesFindMany.mockResolvedValue([
      { id: CHILD_ID, displayName: 'Alex' },
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
    mockSubjectsFindMany.mockResolvedValue([]);

    const result = await getChildDetail(db as never, PARENT_ID, CHILD_ID);

    expect(result).not.toBeNull();
    expect(result?.profileId).toBe(CHILD_ID);
  });
});

// ---------------------------------------------------------------------------
// getChildSubjectTopics
// ---------------------------------------------------------------------------

describe('getChildSubjectTopics', () => {
  // [EP15-I5] Break test — `[]` on access denial masked forbidden as
  // "child has no topics yet". Routes returned 200 with empty array,
  // giving no feedback that the user had lost access (or never had it).
  it('throws ForbiddenError when no parent-child link exists', async () => {
    const { getChildSubjectTopics } = await importDbFunctions();
    const { ForbiddenError } = await import('../errors');
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue(null);

    await expect(
      getChildSubjectTopics(db as never, PARENT_ID, CHILD_ID, SUBJECT_ID)
    ).rejects.toBeInstanceOf(ForbiddenError);
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
  // [EP15-I5] Break test — sessions list is more sensitive than topic
  // progress because it contains transcript previews. Masking forbidden
  // as empty here is a particularly bad IDOR posture.
  it('throws ForbiddenError when no parent-child link exists', async () => {
    const { getChildSessions } = await importDbFunctions();
    const { ForbiddenError } = await import('../errors');
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue(null);

    await expect(
      getChildSessions(db as never, PARENT_ID, CHILD_ID)
    ).rejects.toBeInstanceOf(ForbiddenError);
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
        wallClockSeconds: 720,
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
        wallClockSeconds: null,
        metadata: {
          homeworkSummary: {
            problemCount: 5,
            practicedSkills: ['linear equations'],
            independentProblemCount: 3,
            guidedProblemCount: 2,
            summary: '5 problems, practiced linear equations.',
            displayTitle: 'Math Homework',
          },
        },
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
    expect(result[0].wallClockSeconds).toBe(720);
    expect(result[0].startedAt).toBe(now.toISOString());
    expect(result[1].endedAt).toBeNull();
    expect(result[1].durationSeconds).toBeNull();
    expect(result[1].wallClockSeconds).toBeNull();
    expect(result[1].displayTitle).toBe('Math Homework');
    expect(result[1].displaySummary).toBe(
      '5 problems, practiced linear equations.'
    );
  });
});

// ---------------------------------------------------------------------------
// getChildSessionTranscript
// ---------------------------------------------------------------------------

describe('getChildSessionTranscript', () => {
  // [EP15-I5] Break test — transcripts contain full conversation history.
  // Access denial must be a 403, not a 200 with null body. Note the
  // "returns null when session does not belong to child" test further down
  // is still correct — that null means "access granted but 404", not "forbidden".
  it('throws ForbiddenError when no parent-child link exists', async () => {
    const { getChildSessionTranscript } = await importDbFunctions();
    const { ForbiddenError } = await import('../errors');
    const db = createMockDb();

    mockFamilyLinksFindFirst.mockResolvedValue(null);

    await expect(
      getChildSessionTranscript(db as never, PARENT_ID, CHILD_ID, SESSION_ID_1)
    ).rejects.toBeInstanceOf(ForbiddenError);
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
      metadata: {
        homeworkSummary: {
          problemCount: 2,
          practicedSkills: ['fractions'],
          independentProblemCount: 1,
          guidedProblemCount: 1,
          summary: '2 problems, practiced fractions.',
          displayTitle: 'Math Homework',
        },
      },
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
    expect(result!.session.displayTitle).toBe('Math Homework');
    expect(result!.session.displaySummary).toBe(
      '2 problems, practiced fractions.'
    );

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
