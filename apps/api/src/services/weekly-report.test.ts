jest.mock('./sentry', () => {
  const actual = jest.requireActual('./sentry') as typeof import('./sentry');
  return {
    ...actual,
    captureException: jest.fn(),
  };
});

import type { Database } from '@eduagent/database';
import type { ProgressMetrics, WeeklyReportData } from '@eduagent/schemas';
import { SchemaDriftError } from '@eduagent/schemas';
import {
  generateWeeklyReportData,
  getWeeklyReportForProfile,
} from './weekly-report';
import { extractDrizzleParamValues } from '../test-utils/drizzle-introspection';

const UUID = {
  parent: 'a0000000-0000-4000-8000-000000000001',
  child: 'a0000000-0000-4000-8000-000000000002',
  report: 'a0000000-0000-4000-8000-000000000003',
} as const;

function metrics(over: Partial<ProgressMetrics>): ProgressMetrics {
  return {
    totalSessions: 0,
    totalActiveMinutes: 0,
    totalWallClockMinutes: 0,
    totalExchanges: 0,
    topicsAttempted: 0,
    topicsMastered: 0,
    topicsInProgress: 0,
    booksCompleted: 0,
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
    ...over,
  };
}

function createMockDb(): Database {
  return {
    query: {
      weeklyReports: {
        findFirst: jest.fn().mockResolvedValue(undefined),
      },
    },
  } as unknown as Database;
}

describe('generateWeeklyReportData', () => {
  it('builds normal headline when there is real progress this week', () => {
    const result = generateWeeklyReportData(
      'Emma',
      '2026-04-27',
      metrics({ topicsMastered: 5, vocabularyTotal: 12 }),
      metrics({ topicsMastered: 2, vocabularyTotal: 8 }),
    );

    // vocabularyDelta=4, topicsMasteredDelta=3 -> Words learned wins
    expect(result.headlineStat.label).toBe('Words learned');
    expect(result.headlineStat.value).toBe(4);
    expect(result.headlineStat.comparison).toMatch(/up from 8 last week/);
  });

  // BUG-903 (a): When the week is fully zero AND last week was also fully
  // zero, "up from 0 last week" is meaningless. The comparison must read
  // as a friendly empty-state line, not a zero-diff.
  it('[BUG-903] emits a friendly empty-state comparison for a fully-quiet week', () => {
    const result = generateWeeklyReportData(
      'Emma',
      '2026-04-27',
      metrics({}),
      metrics({}),
    );

    expect(result.headlineStat.value).toBe(0);
    expect(result.headlineStat.comparison).not.toMatch(/up from 0 last week/);
    expect(result.headlineStat.comparison).toMatch(/No activity this week/i);
  });

  // BUG-903 (a): For a brand-new account with no last-week record, the
  // comparison should still be sensible (not "up from 0").
  it('[BUG-903] uses first-week framing when there is no prior week', () => {
    const result = generateWeeklyReportData(
      'Emma',
      '2026-04-27',
      metrics({}),
      null,
    );

    expect(result.headlineStat.value).toBe(0);
    expect(result.headlineStat.comparison).toMatch(/first week/i);
  });

  // BUG-903 (a): The fix is scoped to the both-zero case. When the prior
  // week had activity, "up from N last week" is preserved — the bug only
  // calls out the meaningless zero-vs-zero comparison.
  it('preserves up-from-N comparison when prior week had real activity', () => {
    const result = generateWeeklyReportData(
      'Emma',
      '2026-04-27',
      metrics({ topicsMastered: 1 }),
      metrics({ topicsMastered: 4, vocabularyTotal: 10 }),
    );

    // safeDelta clamps at 0 — this week mastered 0 new (relative). The
    // existing comparison string is the unchanged historical behavior.
    expect(result.headlineStat.comparison).toMatch(/last week/);
  });
});

describe('getWeeklyReportForProfile', () => {
  it('scopes self-view weekly report lookup by child profile id [HIGH-3]', async () => {
    const db = createMockDb();

    await getWeeklyReportForProfile(db, UUID.child, UUID.report);

    const findFirst = db.query.weeklyReports.findFirst as jest.Mock;
    const params = extractDrizzleParamValues(findFirst.mock.calls[0]?.[0]);
    expect(params).toEqual(expect.arrayContaining([UUID.report, UUID.child]));
    expect(params).not.toContain(UUID.parent);
  });
});

// ---------------------------------------------------------------------------
// [CCR PR #215] Schema-drift break tests — mapWeeklyReportRow
// See monthly-report.test.ts for the full rationale.
// ---------------------------------------------------------------------------

function makeWeeklyReportRow(
  overrides: {
    reportData?: unknown;
  } = {},
) {
  const defaultReportData: WeeklyReportData = {
    childName: 'Emma',
    weekStart: '2026-04-27',
    thisWeek: {
      totalSessions: 3,
      totalActiveMinutes: 60,
      topicsMastered: 2,
      topicsExplored: 3,
      vocabularyTotal: 12,
      streakBest: 4,
    },
    lastWeek: null,
    headlineStat: {
      label: 'Words learned',
      value: 12,
      comparison: 'in a first week',
    },
  };
  return {
    id: UUID.report,
    profileId: UUID.parent,
    childProfileId: UUID.child,
    reportWeek: '2026-04-27',
    reportData:
      overrides.reportData === undefined
        ? defaultReportData
        : overrides.reportData,
    viewedAt: null as Date | null,
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
  };
}

function dbWithFirst(row: unknown): Database {
  return {
    query: {
      weeklyReports: {
        findFirst: jest.fn().mockResolvedValue(row),
      },
    },
  } as unknown as Database;
}

describe('mapWeeklyReportRow — schema drift vs missing row [CCR PR #215]', () => {
  const { captureException: capMock } = require('./sentry') as {
    captureException: jest.Mock;
  };

  beforeEach(() => {
    capMock.mockClear();
  });

  it('missing row → returns null, NO Sentry capture', async () => {
    const db = dbWithFirst(undefined);

    const result = await getWeeklyReportForProfile(db, UUID.child, UUID.report);

    expect(result).toBeNull();
    expect(capMock).not.toHaveBeenCalled();
  });

  it('row exists but invalid shape → throws SchemaDriftError + captures Sentry with row PK and zod issues', async () => {
    const badRow = makeWeeklyReportRow({ reportData: 'not-an-object' });
    const db = dbWithFirst(badRow);

    await expect(
      getWeeklyReportForProfile(db, UUID.child, UUID.report),
    ).rejects.toBeInstanceOf(SchemaDriftError);

    expect(capMock).toHaveBeenCalledTimes(1);
    const [, contextArg] = capMock.mock.calls[0];
    expect(contextArg).toMatchObject({
      profileId: UUID.parent,
      extra: expect.objectContaining({
        context: 'mapWeeklyReportRow',
        reportId: UUID.report,
        childProfileId: UUID.child,
      }),
    });
    expect(Array.isArray(contextArg.extra.issues)).toBe(true);
    expect((contextArg.extra.issues as unknown[]).length).toBeGreaterThan(0);
  });
});
