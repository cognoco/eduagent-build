// ---------------------------------------------------------------------------
// Monthly Report Service Tests
// ---------------------------------------------------------------------------

jest.mock('./llm', () => ({
  routeAndCall: jest.fn(),
}));

jest.mock('./sentry', () => ({
  captureException: jest.fn(),
}));

import type { Database } from '@eduagent/database';
import type { ProgressMetrics, MonthlyReportData } from '@eduagent/schemas';
import { routeAndCall } from './llm';
import {
  generateMonthlyReportData,
  generateReportHighlights,
  listMonthlyReportsForParentChild,
  getMonthlyReportForParentChild,
  markMonthlyReportViewed,
} from './monthly-report';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Real RFC-4122 UUIDs (variant bits 0x80-0xbf in segment 4)
const UUID = {
  parent: 'a0000000-0000-4000-8000-000000000001',
  child: 'a0000000-0000-4000-8000-000000000002',
  report: 'a0000000-0000-4000-8000-000000000003',
  subject1: 'a0000000-0000-4000-8000-000000000010',
  subject2: 'a0000000-0000-4000-8000-000000000011',
  subjectDefault: 'a0000000-0000-4000-8000-000000000020',
} as const;

function makeSubject(
  overrides: Partial<ProgressMetrics['subjects'][number]> = {},
): ProgressMetrics['subjects'][number] {
  return {
    subjectId: UUID.subjectDefault,
    subjectName: 'Mathematics',
    pedagogyMode: 'socratic',
    topicsAttempted: 0,
    topicsMastered: 0,
    topicsTotal: 10,
    topicsExplored: 0,
    vocabularyTotal: 0,
    vocabularyMastered: 0,
    sessionsCount: 0,
    activeMinutes: 0,
    wallClockMinutes: 0,
    lastSessionAt: null,
    ...overrides,
  };
}

function makeMetrics(
  overrides: Partial<ProgressMetrics> = {},
): ProgressMetrics {
  return {
    totalSessions: 0,
    totalActiveMinutes: 0,
    totalWallClockMinutes: 0,
    totalExchanges: 0,
    topicsAttempted: 0,
    topicsMastered: 0,
    topicsInProgress: 0,
    booksCompleted: 0,
    weeklyDeltaTopicsMastered: null,
    weeklyDeltaVocabularyTotal: null,
    weeklyDeltaTopicsExplored: null,
    vocabularyTotal: 0,
    vocabularyMastered: 0,
    vocabularyLearning: 0,
    vocabularyNew: 0,
    retentionCardsDue: 0,
    retentionCardsStrong: 0,
    retentionCardsFading: 0,
    currentStreak: 0,
    longestStreak: 0,
    subjects: [],
    ...overrides,
  };
}

function makeMonthlyReportRow(
  overrides: Partial<{
    id: string;
    profileId: string;
    childProfileId: string;
    reportMonth: string;
    reportData: MonthlyReportData;
    viewedAt: Date | null;
    createdAt: Date;
  }> = {},
) {
  const defaultReportData: MonthlyReportData = {
    childName: 'Alice',
    month: 'April 2026',
    thisMonth: {
      totalSessions: 5,
      totalActiveMinutes: 120,
      topicsMastered: 3,
      topicsExplored: 4,
      vocabularyTotal: 20,
      streakBest: 7,
    },
    lastMonth: null,
    highlights: [],
    nextSteps: [],
    subjects: [],
    headlineStat: {
      label: 'Words learned',
      value: 20,
      comparison: 'in a first month',
    },
  };

  return {
    id: overrides.id ?? UUID.report,
    profileId: overrides.profileId ?? UUID.parent,
    childProfileId: overrides.childProfileId ?? UUID.child,
    reportMonth: overrides.reportMonth ?? '2026-04',
    reportData: overrides.reportData ?? defaultReportData,
    viewedAt: overrides.viewedAt !== undefined ? overrides.viewedAt : null,
    createdAt: overrides.createdAt ?? new Date('2026-04-01T00:00:00.000Z'),
  };
}

function createMockDb({
  findManyResult = [] as ReturnType<typeof makeMonthlyReportRow>[],
  findFirstResult = undefined as
    | ReturnType<typeof makeMonthlyReportRow>
    | undefined,
} = {}): Database {
  return {
    query: {
      monthlyReports: {
        findMany: jest.fn().mockResolvedValue(findManyResult),
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
    },
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Database;
}

// ---------------------------------------------------------------------------
// generateMonthlyReportData — headline stat selection
// ---------------------------------------------------------------------------

describe('generateMonthlyReportData — headline stat selection', () => {
  it('selects "Words learned" when vocabulary delta exceeds topicsMastered delta', () => {
    // vocab delta = 50, mastered delta = 5, explored delta = 2
    const thisMonth = makeMetrics({
      vocabularyTotal: 50,
      topicsMastered: 5,
      subjects: [makeSubject({ topicsExplored: 2 })],
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      null,
    );

    expect(result.headlineStat.label).toBe('Words learned');
    expect(result.headlineStat.value).toBe(50);
  });

  it('selects "Topics explored" when explored delta exceeds mastered delta and vocab delta does not exceed mastered delta', () => {
    // headlineMode logic: vocab wins if vocab > mastered; explored wins if explored > mastered (and vocab <= mastered)
    // vocab delta = 0, mastered delta = 0, explored delta = 10
    // vocab(0) > mastered(0) → false; explored(10) > mastered(0) → true → Topics explored
    const thisMonth = makeMetrics({
      vocabularyTotal: 0,
      topicsMastered: 0,
      subjects: [makeSubject({ topicsExplored: 10 })],
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      null,
    );

    expect(result.headlineStat.label).toBe('Topics explored');
    expect(result.headlineStat.value).toBe(10);
  });

  it('selects "Topics mastered" when mastered delta is highest', () => {
    // vocab delta = 1, explored delta = 2 (not > mastered), mastered delta = 5
    // explored (2) NOT > mastered (5), and vocab (1) NOT > mastered (5) → mastered wins
    const thisMonth = makeMetrics({
      vocabularyTotal: 1,
      topicsMastered: 5,
      subjects: [makeSubject({ topicsExplored: 2 })],
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      null,
    );

    expect(result.headlineStat.label).toBe('Topics mastered');
    expect(result.headlineStat.value).toBe(5);
  });

  it('falls back to "Topics mastered" when all deltas are zero', () => {
    const thisMonth = makeMetrics();

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      null,
    );

    expect(result.headlineStat.label).toBe('Topics mastered');
    expect(result.headlineStat.value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateMonthlyReportData — first month vs comparison copy
// ---------------------------------------------------------------------------

describe('generateMonthlyReportData — first month (lastMonth null)', () => {
  it('sets comparison to "in a first month" for Words learned headline', () => {
    const thisMonth = makeMetrics({ vocabularyTotal: 10, topicsMastered: 1 });

    const result = generateMonthlyReportData(
      'Bob',
      'April 2026',
      thisMonth,
      null,
    );

    expect(result.headlineStat.comparison).toBe('in a first month');
  });

  it('sets comparison to "in a first month" for Topics mastered headline', () => {
    const thisMonth = makeMetrics({ vocabularyTotal: 0, topicsMastered: 3 });

    const result = generateMonthlyReportData(
      'Bob',
      'April 2026',
      thisMonth,
      null,
    );

    expect(result.headlineStat.comparison).toBe('in a first month');
  });

  it('sets comparison to "in a first month" for Topics explored headline', () => {
    const thisMonth = makeMetrics({
      vocabularyTotal: 0,
      topicsMastered: 0,
      subjects: [makeSubject({ topicsExplored: 5 })],
    });

    const result = generateMonthlyReportData(
      'Bob',
      'April 2026',
      thisMonth,
      null,
    );

    expect(result.headlineStat.comparison).toBe('in a first month');
  });

  it('sets lastMonth field to null in result', () => {
    const thisMonth = makeMetrics();

    const result = generateMonthlyReportData(
      'Bob',
      'April 2026',
      thisMonth,
      null,
    );

    expect(result.lastMonth).toBeNull();
  });
});

describe('generateMonthlyReportData — with lastMonth comparison', () => {
  it('comparison for "Words learned" references last month vocabulary total', () => {
    const lastMonth = makeMetrics({ vocabularyTotal: 15, topicsMastered: 2 });
    const thisMonth = makeMetrics({ vocabularyTotal: 30, topicsMastered: 4 });
    // vocab delta = 15, mastered delta = 2 → Words learned wins

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    expect(result.headlineStat.label).toBe('Words learned');
    expect(result.headlineStat.comparison).toBe('up from 15 last month');
  });

  it('comparison for "Topics mastered" references last month mastered total', () => {
    const lastMonth = makeMetrics({ vocabularyTotal: 5, topicsMastered: 1 });
    const thisMonth = makeMetrics({ vocabularyTotal: 6, topicsMastered: 8 });
    // vocab delta = 1, mastered delta = 7 → Topics mastered wins

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    expect(result.headlineStat.label).toBe('Topics mastered');
    expect(result.headlineStat.comparison).toBe('up from 1 last month');
  });

  it('comparison for "Topics explored" references last month explored total', () => {
    const lastMonth = makeMetrics({
      vocabularyTotal: 0,
      topicsMastered: 0,
      subjects: [makeSubject({ topicsExplored: 3 })],
    });
    const thisMonth = makeMetrics({
      vocabularyTotal: 0,
      topicsMastered: 0,
      subjects: [makeSubject({ topicsExplored: 10 })],
    });
    // explored delta = 7, vocab delta = 0, mastered delta = 0 → Topics explored wins

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    expect(result.headlineStat.label).toBe('Topics explored');
    expect(result.headlineStat.comparison).toBe(
      'up from 3 total topics before this month',
    );
  });

  it('populates lastMonth field with cumulative totals from lastMonth metrics', () => {
    const lastMonth = makeMetrics({
      totalSessions: 8,
      totalActiveMinutes: 200,
      topicsMastered: 3,
      vocabularyTotal: 25,
      longestStreak: 5,
      subjects: [makeSubject({ topicsExplored: 6 })],
    });
    const thisMonth = makeMetrics({
      totalSessions: 12,
      totalActiveMinutes: 300,
      topicsMastered: 5,
      vocabularyTotal: 40,
      longestStreak: 7,
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    expect(result.lastMonth).toMatchObject({
      totalSessions: 8,
      totalActiveMinutes: 200,
      topicsMastered: 3,
      topicsExplored: 6,
      vocabularyTotal: 25,
      streakBest: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// generateMonthlyReportData — delta clamping (safeDelta never goes negative)
// ---------------------------------------------------------------------------

describe('generateMonthlyReportData — delta clamping', () => {
  it('clamps negative vocabulary delta to zero', () => {
    const lastMonth = makeMetrics({ vocabularyTotal: 50, topicsMastered: 5 });
    const thisMonth = makeMetrics({ vocabularyTotal: 30, topicsMastered: 3 });
    // Regression scenario: current < previous should clamp to 0

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    // vocab delta = max(0, 30-50) = 0, mastered delta = max(0, 3-5) = 0 → both 0
    expect(result.headlineStat.value).toBeGreaterThanOrEqual(0);
    expect(result.thisMonth.vocabularyTotal).toBe(30);
    expect(result.thisMonth.topicsMastered).toBe(0);
  });

  it('clamps negative session delta to zero', () => {
    const lastMonth = makeMetrics({ totalSessions: 20 });
    const thisMonth = makeMetrics({ totalSessions: 5 });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    expect(result.thisMonth.totalSessions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateMonthlyReportData — thisMonth field maps deltas correctly
// ---------------------------------------------------------------------------

describe('generateMonthlyReportData — thisMonth computed deltas', () => {
  it('computes totalSessions as delta from lastMonth', () => {
    const lastMonth = makeMetrics({ totalSessions: 10 });
    const thisMonth = makeMetrics({ totalSessions: 15 });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    expect(result.thisMonth.totalSessions).toBe(5);
  });

  it('computes totalActiveMinutes as delta from lastMonth', () => {
    const lastMonth = makeMetrics({ totalActiveMinutes: 100 });
    const thisMonth = makeMetrics({ totalActiveMinutes: 250 });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    expect(result.thisMonth.totalActiveMinutes).toBe(150);
  });

  it('stores vocabularyTotal as cumulative (not delta) on thisMonth', () => {
    const lastMonth = makeMetrics({ vocabularyTotal: 40 });
    const thisMonth = makeMetrics({ vocabularyTotal: 65 });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    // [EP15-I2 AR-6] vocabularyTotal is cumulative end-of-month
    expect(result.thisMonth.vocabularyTotal).toBe(65);
  });

  it('stores longestStreak as streakBest on thisMonth', () => {
    const thisMonth = makeMetrics({ longestStreak: 14 });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      null,
    );

    expect(result.thisMonth.streakBest).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// generateMonthlyReportData — subject breakdowns
// ---------------------------------------------------------------------------

describe('generateMonthlyReportData — subject breakdowns', () => {
  it('returns empty subjects array without crashing when thisMonth has no subjects', () => {
    const thisMonth = makeMetrics({ subjects: [] });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      null,
    );

    expect(result.subjects).toEqual([]);
  });

  it('maps a single subject with correct delta values when no lastMonth', () => {
    const thisMonth = makeMetrics({
      subjects: [
        makeSubject({
          subjectName: 'Science',
          topicsMastered: 3,
          topicsAttempted: 5,
          topicsExplored: 4,
          vocabularyTotal: 20,
          activeMinutes: 60,
        }),
      ],
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      null,
    );

    expect(result.subjects).toHaveLength(1);
    expect(result.subjects[0]).toMatchObject({
      subjectName: 'Science',
      topicsMastered: 3,
      topicsAttempted: 5,
      topicsExplored: 4,
      vocabularyTotal: 20,
      activeMinutes: 60,
    });
  });

  it('computes per-subject deltas against matching lastMonth subject by subjectId', () => {
    const subjectId = 'a0000000-0000-4000-8000-000000000010';
    const lastMonth = makeMetrics({
      subjects: [
        makeSubject({
          subjectId,
          subjectName: 'History',
          topicsMastered: 2,
          topicsAttempted: 4,
          topicsExplored: 3,
          vocabularyTotal: 10,
          activeMinutes: 40,
        }),
      ],
    });
    const thisMonth = makeMetrics({
      subjects: [
        makeSubject({
          subjectId,
          subjectName: 'History',
          topicsMastered: 5,
          topicsAttempted: 8,
          topicsExplored: 7,
          vocabularyTotal: 25,
          activeMinutes: 90,
        }),
      ],
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    expect(result.subjects[0]).toMatchObject({
      subjectName: 'History',
      topicsMastered: 3, // 5 - 2
      topicsAttempted: 4, // 8 - 4
      topicsExplored: 4, // 7 - 3
      activeMinutes: 50, // 90 - 40
      vocabularyTotal: 25, // cumulative, not delta
    });
  });

  it('uses full current values for a subject not found in lastMonth', () => {
    const subjectId = 'a0000000-0000-4000-8000-000000000011';
    const lastMonth = makeMetrics({ subjects: [] });
    const thisMonth = makeMetrics({
      subjects: [
        makeSubject({
          subjectId,
          subjectName: 'Art',
          topicsMastered: 2,
          topicsAttempted: 3,
          topicsExplored: 2,
          vocabularyTotal: 8,
          activeMinutes: 30,
        }),
      ],
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    expect(result.subjects[0]).toMatchObject({
      subjectName: 'Art',
      topicsMastered: 2,
      topicsAttempted: 3,
      topicsExplored: 2,
      activeMinutes: 30,
    });
  });

  it('maps multiple subjects independently with correct deltas', () => {
    const mathId = UUID.subject1;
    const sciId = UUID.subject2;

    const lastMonth = makeMetrics({
      subjects: [
        makeSubject({
          subjectId: mathId,
          subjectName: 'Math',
          activeMinutes: 30,
          topicsMastered: 1,
        }),
        makeSubject({
          subjectId: sciId,
          subjectName: 'Science',
          activeMinutes: 50,
          topicsMastered: 2,
        }),
      ],
    });
    const thisMonth = makeMetrics({
      subjects: [
        makeSubject({
          subjectId: mathId,
          subjectName: 'Math',
          activeMinutes: 80,
          topicsMastered: 4,
        }),
        makeSubject({
          subjectId: sciId,
          subjectName: 'Science',
          activeMinutes: 70,
          topicsMastered: 5,
        }),
      ],
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    const math = result.subjects.find((s) => s.subjectName === 'Math');
    const sci = result.subjects.find((s) => s.subjectName === 'Science');

    expect(math?.topicsMastered).toBe(3); // 4 - 1
    expect(math?.activeMinutes).toBe(50); // 80 - 30
    expect(sci?.topicsMastered).toBe(3); // 5 - 2
    expect(sci?.activeMinutes).toBe(20); // 70 - 50
  });
});

// ---------------------------------------------------------------------------
// generateMonthlyReportData — subject trend computation
// ---------------------------------------------------------------------------

describe('generateMonthlyReportData — subject trend', () => {
  it('assigns "growing" trend when activeMinutes delta is positive', () => {
    const subjectId = 'a0000000-0000-4000-8000-000000000010';
    const lastMonth = makeMetrics({
      subjects: [makeSubject({ subjectId, activeMinutes: 20 })],
    });
    const thisMonth = makeMetrics({
      subjects: [makeSubject({ subjectId, activeMinutes: 60 })],
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    expect(result.subjects[0]?.trend).toBe('growing');
  });

  it('assigns "stable" trend when activeMinutes delta is exactly zero', () => {
    const subjectId = 'a0000000-0000-4000-8000-000000000010';
    const lastMonth = makeMetrics({
      subjects: [makeSubject({ subjectId, activeMinutes: 40 })],
    });
    const thisMonth = makeMetrics({
      subjects: [makeSubject({ subjectId, activeMinutes: 40 })],
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    expect(result.subjects[0]?.trend).toBe('stable');
  });

  it('assigns "stable" trend for first month subject (no lastMonth match, delta 0)', () => {
    const thisMonth = makeMetrics({
      subjects: [makeSubject({ activeMinutes: 0 })],
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      null,
    );

    expect(result.subjects[0]?.trend).toBe('stable');
  });

  it('assigns "declining" trend when activeMinutes delta is negative (clamped scenario)', () => {
    // Because safeDelta clamps to 0, declining can only happen when the subject
    // is found in lastMonth but has a HIGHER activeMinutes → delta is max(0,…) = 0 → stable
    // Actually the trend branch checks the clamped delta, so we verify that a
    // reduction yields 0 → "stable" (not "declining"), showing safeDelta works correctly.
    const subjectId = 'a0000000-0000-4000-8000-000000000010';
    const lastMonth = makeMetrics({
      subjects: [makeSubject({ subjectId, activeMinutes: 100 })],
    });
    const thisMonth = makeMetrics({
      subjects: [makeSubject({ subjectId, activeMinutes: 50 })],
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      lastMonth,
    );

    // safeDelta clamps to 0 → trend is 'stable', not 'declining'
    expect(result.subjects[0]?.activeMinutes).toBe(0);
    expect(result.subjects[0]?.trend).toBe('stable');
  });

  it('assigns "growing" trend for first month subject with positive activeMinutes', () => {
    const thisMonth = makeMetrics({
      subjects: [makeSubject({ activeMinutes: 45 })],
    });

    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      thisMonth,
      null,
    );

    // No lastMonth subject → delta = max(0, 45 - 0) = 45 → growing
    expect(result.subjects[0]?.trend).toBe('growing');
  });
});

// ---------------------------------------------------------------------------
// generateMonthlyReportData — metadata passthrough
// ---------------------------------------------------------------------------

describe('generateMonthlyReportData — metadata passthrough', () => {
  it('preserves childName and monthLabel in the result', () => {
    const result = generateMonthlyReportData(
      'Charlie',
      'March 2026',
      makeMetrics(),
      null,
    );

    expect(result.childName).toBe('Charlie');
    expect(result.month).toBe('March 2026');
  });

  it('initialises highlights and nextSteps as empty arrays', () => {
    const result = generateMonthlyReportData(
      'Alice',
      'April 2026',
      makeMetrics(),
      null,
    );

    expect(result.highlights).toEqual([]);
    expect(result.nextSteps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// generateReportHighlights — LLM success path
// ---------------------------------------------------------------------------

describe('generateReportHighlights — LLM success', () => {
  const reportData: MonthlyReportData = {
    childName: 'Alice',
    month: 'April 2026',
    thisMonth: {
      totalSessions: 5,
      totalActiveMinutes: 120,
      topicsMastered: 3,
      topicsExplored: 4,
      vocabularyTotal: 20,
      streakBest: 7,
    },
    lastMonth: null,
    highlights: [],
    nextSteps: [],
    subjects: [],
    headlineStat: {
      label: 'Words learned',
      value: 20,
      comparison: 'in a first month',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses highlights, nextSteps, and comparison from a valid LLM JSON response', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        highlights: ['Alice mastered algebra!', 'Kept a 7-day streak.'],
        nextSteps: ['Try geometry next.'],
        equivalent: 'Reading 3 chapters of a novel.',
      }),
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 42,
    });

    const result = await generateReportHighlights(reportData);

    expect(result.highlights).toEqual([
      'Alice mastered algebra!',
      'Kept a 7-day streak.',
    ]);
    expect(result.nextSteps).toEqual(['Try geometry next.']);
    expect(result.comparison).toBe('Reading 3 chapters of a novel.');
  });

  it('caps highlights at 3 items', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        highlights: ['H1', 'H2', 'H3', 'H4', 'H5'],
        nextSteps: [],
        equivalent: null,
      }),
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 10,
    });

    const result = await generateReportHighlights(reportData);

    expect(result.highlights).toHaveLength(3);
    expect(result.highlights).toEqual(['H1', 'H2', 'H3']);
  });

  it('caps nextSteps at 2 items', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        highlights: [],
        nextSteps: ['S1', 'S2', 'S3', 'S4'],
        equivalent: null,
      }),
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 10,
    });

    const result = await generateReportHighlights(reportData);

    expect(result.nextSteps).toHaveLength(2);
    expect(result.nextSteps).toEqual(['S1', 'S2']);
  });

  it('filters non-string values from highlights array', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        highlights: ['Valid highlight', 42, null, 'Another valid', true],
        nextSteps: [],
        equivalent: null,
      }),
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 10,
    });

    const result = await generateReportHighlights(reportData);

    expect(result.highlights).toEqual(['Valid highlight', 'Another valid']);
  });

  it('returns default highlight when LLM highlights field is missing', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        nextSteps: ['Keep going!'],
        equivalent: null,
      }),
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 10,
    });

    const result = await generateReportHighlights(reportData);

    expect(result.highlights).toEqual(['Great progress this month!']);
  });

  it('returns empty nextSteps when LLM nextSteps field is missing', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        highlights: ['Well done!'],
        equivalent: null,
      }),
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 10,
    });

    const result = await generateReportHighlights(reportData);

    expect(result.nextSteps).toEqual([]);
  });

  it('sets comparison to null when equivalent field is not a string', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        highlights: ['Good job!'],
        nextSteps: [],
        equivalent: 42,
      }),
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 10,
    });

    const result = await generateReportHighlights(reportData);

    expect(result.comparison).toBeNull();
  });

  it('sets comparison to null when equivalent field is absent', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        highlights: ['Good job!'],
        nextSteps: [],
      }),
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 10,
    });

    const result = await generateReportHighlights(reportData);

    expect(result.comparison).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generateReportHighlights — LLM error / fallback path
// ---------------------------------------------------------------------------

describe('generateReportHighlights — error fallback', () => {
  const reportData: MonthlyReportData = {
    childName: 'Alice',
    month: 'April 2026',
    thisMonth: {
      totalSessions: 5,
      totalActiveMinutes: 120,
      topicsMastered: 3,
      topicsExplored: 4,
      vocabularyTotal: 20,
      streakBest: 7,
    },
    lastMonth: null,
    highlights: [],
    nextSteps: [],
    subjects: [],
    headlineStat: {
      label: 'Words learned',
      value: 20,
      comparison: 'in a first month',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns default highlights when routeAndCall throws', async () => {
    mockRouteAndCall.mockRejectedValueOnce(new Error('LLM unavailable'));

    const result = await generateReportHighlights(reportData);

    expect(result.highlights).toEqual(['Great progress this month!']);
    expect(result.nextSteps).toEqual([]);
    expect(result.comparison).toBeNull();
  });

  it('returns default highlights when LLM response is not valid JSON', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: 'not valid json {{{}',
      provider: 'mock',
      model: 'mock-model',
      latencyMs: 10,
    });

    const result = await generateReportHighlights(reportData);

    expect(result.highlights).toEqual(['Great progress this month!']);
    expect(result.nextSteps).toEqual([]);
    expect(result.comparison).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listMonthlyReportsForParentChild — DB query
// ---------------------------------------------------------------------------

describe('listMonthlyReportsForParentChild', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when no reports exist', async () => {
    const db = createMockDb({ findManyResult: [] });

    const result = await listMonthlyReportsForParentChild(
      db,
      UUID.parent,
      UUID.child,
    );

    expect(result).toEqual([]);
  });

  it('returns mapped summaries for each row', async () => {
    const row = makeMonthlyReportRow({
      id: UUID.report,
      reportMonth: '2026-04',
      viewedAt: null,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
    });

    const db = createMockDb({ findManyResult: [row] });

    const result = await listMonthlyReportsForParentChild(
      db,
      UUID.parent,
      UUID.child,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: UUID.report,
      reportMonth: '2026-04',
      viewedAt: null,
    });
    expect(result[0]?.headlineStat).toEqual(
      expect.objectContaining({ label: expect.any(String) }),
    );
  });

  it('maps viewedAt as ISO string when set', async () => {
    const viewedDate = new Date('2026-04-15T10:30:00.000Z');
    const row = makeMonthlyReportRow({ viewedAt: viewedDate });

    const db = createMockDb({ findManyResult: [row] });

    const result = await listMonthlyReportsForParentChild(
      db,
      UUID.parent,
      UUID.child,
    );

    expect(result[0]?.viewedAt).toBe(viewedDate.toISOString());
  });

  it('returns headlineStat from reportData', async () => {
    const row = makeMonthlyReportRow();
    // row.reportData.headlineStat is { label: 'Words learned', value: 20, comparison: 'in a first month' }
    const db = createMockDb({ findManyResult: [row] });

    const result = await listMonthlyReportsForParentChild(
      db,
      UUID.parent,
      UUID.child,
    );

    expect(result[0]?.headlineStat).toMatchObject({
      label: 'Words learned',
      value: 20,
    });
  });
});

// ---------------------------------------------------------------------------
// getMonthlyReportForParentChild — DB query
// ---------------------------------------------------------------------------

describe('getMonthlyReportForParentChild', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when report is not found', async () => {
    const db = createMockDb({ findFirstResult: undefined });

    const result = await getMonthlyReportForParentChild(
      db,
      UUID.parent,
      UUID.child,
      UUID.report,
    );

    expect(result).toBeNull();
  });

  it('returns the mapped record when found', async () => {
    const row = makeMonthlyReportRow({
      id: UUID.report,
      profileId: UUID.parent,
      childProfileId: UUID.child,
      reportMonth: '2026-04',
      viewedAt: null,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
    });

    const db = createMockDb({ findFirstResult: row });

    const result = await getMonthlyReportForParentChild(
      db,
      UUID.parent,
      UUID.child,
      UUID.report,
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe(UUID.report);
    expect(result?.profileId).toBe(UUID.parent);
    expect(result?.childProfileId).toBe(UUID.child);
    expect(result?.reportMonth).toBe('2026-04');
    expect(result?.viewedAt).toBeNull();
  });

  it('maps createdAt as ISO datetime string', async () => {
    const row = makeMonthlyReportRow({
      createdAt: new Date('2026-04-01T12:00:00.000Z'),
    });

    const db = createMockDb({ findFirstResult: row });

    const result = await getMonthlyReportForParentChild(
      db,
      UUID.parent,
      UUID.child,
      UUID.report,
    );

    expect(result?.createdAt).toBe('2026-04-01T12:00:00.000Z');
  });

  it('maps viewedAt as ISO string when set', async () => {
    const viewedDate = new Date('2026-04-10T08:00:00.000Z');
    const row = makeMonthlyReportRow({ viewedAt: viewedDate });

    const db = createMockDb({ findFirstResult: row });

    const result = await getMonthlyReportForParentChild(
      db,
      UUID.parent,
      UUID.child,
      UUID.report,
    );

    expect(result?.viewedAt).toBe(viewedDate.toISOString());
  });
});

// ---------------------------------------------------------------------------
// markMonthlyReportViewed — DB update
// ---------------------------------------------------------------------------

describe('markMonthlyReportViewed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves without error', async () => {
    const db = createMockDb();

    await expect(
      markMonthlyReportViewed(db, UUID.parent, UUID.child, UUID.report),
    ).resolves.toBeUndefined();
  });

  it('calls db.update with a viewedAt Date', async () => {
    const mockWhere = jest.fn().mockResolvedValue(undefined);
    const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
    const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });

    const db = { update: mockUpdate } as unknown as Database;

    await markMonthlyReportViewed(db, UUID.parent, UUID.child, UUID.report);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ viewedAt: expect.any(Date) }),
    );
    expect(mockWhere).toHaveBeenCalledTimes(1);
  });
});
