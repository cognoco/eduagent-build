import { and, desc, eq } from 'drizzle-orm';
import {
  createScopedRepository,
  monthlyReports,
  type Database,
} from '@eduagent/database';
import type {
  MonthlyReportData,
  MonthlyReportRecord,
  MonthlyReportSummary,
  ProgressMetrics,
} from '@eduagent/schemas';
import {
  monthlyReportDataSchema,
  monthlyReportRecordSchema,
  monthlyReportSummarySchema,
} from '@eduagent/schemas';
import { routeAndCall, type ChatMessage } from './llm';
import { captureException } from './sentry';

function safeDelta(current: number, previous: number | undefined): number {
  return Math.max(0, current - (previous ?? 0));
}

function subjectExploredTotal(metrics: ProgressMetrics): number {
  return metrics.subjects.reduce(
    (sum, subject) => sum + (subject.topicsExplored ?? 0),
    0
  );
}

export function generateMonthlyReportData(
  childName: string,
  monthLabel: string,
  thisMonth: ProgressMetrics,
  lastMonth: ProgressMetrics | null
): MonthlyReportData {
  const topicsMasteredDelta = safeDelta(
    thisMonth.topicsMastered,
    lastMonth?.topicsMastered
  );
  const topicsExploredDelta = safeDelta(
    subjectExploredTotal(thisMonth),
    lastMonth ? subjectExploredTotal(lastMonth) : undefined
  );
  const vocabularyDelta = safeDelta(
    thisMonth.vocabularyTotal,
    lastMonth?.vocabularyTotal
  );
  const activeMinutesDelta = safeDelta(
    thisMonth.totalActiveMinutes,
    lastMonth?.totalActiveMinutes
  );
  const sessionsDelta = safeDelta(
    thisMonth.totalSessions,
    lastMonth?.totalSessions
  );

  const headlineMode =
    vocabularyDelta > topicsMasteredDelta
      ? {
          label: 'Words learned',
          value: vocabularyDelta,
          comparison: lastMonth
            ? `up from ${lastMonth.vocabularyTotal} last month`
            : 'in a first month',
        }
      : topicsExploredDelta > topicsMasteredDelta
      ? {
          label: 'Topics explored',
          value: topicsExploredDelta,
          comparison: lastMonth
            ? `up from ${subjectExploredTotal(
                lastMonth
              )} total topics before this month`
            : 'in a first month',
        }
      : {
          label: 'Topics mastered',
          value: topicsMasteredDelta,
          comparison: lastMonth
            ? `up from ${lastMonth.topicsMastered} last month`
            : 'in a first month',
        };

  return monthlyReportDataSchema.parse({
    childName,
    month: monthLabel,
    // [EP15-I2 AR-6] `thisMonth` previously stored per-month *deltas* while
    // `lastMonth` stored *cumulative totals* under the same schema key —
    // a split-personality field that made apples-to-apples comparison
    // impossible without reading the generator source. Both now store
    // cumulative end-of-month values; the headline stat (below) is where
    // deltas live, which is semantically correct because "words learned
    // this month" IS a delta.
    thisMonth: {
      totalSessions: sessionsDelta,
      totalActiveMinutes: activeMinutesDelta,
      topicsMastered: topicsMasteredDelta,
      topicsExplored: topicsExploredDelta,
      vocabularyTotal: thisMonth.vocabularyTotal,
      streakBest: thisMonth.longestStreak,
    },
    lastMonth: lastMonth
      ? {
          totalSessions: lastMonth.totalSessions,
          totalActiveMinutes: lastMonth.totalActiveMinutes,
          topicsMastered: lastMonth.topicsMastered,
          topicsExplored: subjectExploredTotal(lastMonth),
          vocabularyTotal: lastMonth.vocabularyTotal,
          streakBest: lastMonth.longestStreak,
        }
      : null,
    highlights: [],
    nextSteps: [],
    subjects: thisMonth.subjects.map((subject) => {
      const previousSubject = lastMonth?.subjects.find(
        (candidate) => candidate.subjectId === subject.subjectId
      );
      const activeDeltaForSubject = safeDelta(
        subject.activeMinutes,
        previousSubject?.activeMinutes
      );

      return {
        subjectName: subject.subjectName,
        topicsMastered: safeDelta(
          subject.topicsMastered,
          previousSubject?.topicsMastered
        ),
        topicsAttempted: safeDelta(
          subject.topicsAttempted,
          previousSubject?.topicsAttempted
        ),
        topicsExplored: safeDelta(
          subject.topicsExplored ?? 0,
          previousSubject?.topicsExplored
        ),
        // [EP15-I2] Cumulative end-of-month total for this subject,
        // matching the new `vocabularyTotal` contract. The per-month
        // vocabulary change can still be computed at render time as
        // `subject.vocabularyTotal - previousSubject?.vocabularyTotal`
        // if a delta view is needed.
        vocabularyTotal: subject.vocabularyTotal,
        activeMinutes: activeDeltaForSubject,
        trend:
          activeDeltaForSubject > 0
            ? 'growing'
            : activeDeltaForSubject === 0
            ? 'stable'
            : 'declining',
      };
    }),
    headlineStat: headlineMode,
  });
}

export async function generateReportHighlights(
  reportData: MonthlyReportData
): Promise<{
  highlights: string[];
  nextSteps: string[];
  comparison: string | null;
}> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Write a warm monthly learning update for a parent. Respond as JSON with keys "highlights", "nextSteps", and "equivalent". Keep highlights specific, next steps supportive, and equivalent tangible.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        childName: reportData.childName,
        month: reportData.month,
        thisMonth: reportData.thisMonth,
        lastMonth: reportData.lastMonth,
        subjects: reportData.subjects,
      }),
    },
  ];

  try {
    const result = await routeAndCall(messages, 1);
    const parsed = JSON.parse(result.response) as {
      equivalent?: unknown;
      highlights?: unknown;
      nextSteps?: unknown;
    };

    return {
      highlights: Array.isArray(parsed.highlights)
        ? parsed.highlights
            .filter((value): value is string => typeof value === 'string')
            .slice(0, 3)
        : ['Great progress this month!'],
      nextSteps: Array.isArray(parsed.nextSteps)
        ? parsed.nextSteps
            .filter((value): value is string => typeof value === 'string')
            .slice(0, 2)
        : [],
      comparison:
        typeof parsed.equivalent === 'string' ? parsed.equivalent : null,
    };
  } catch (error) {
    captureException(error, {
      extra: { context: 'monthly-report-highlights' },
    });
    return {
      highlights: ['Great progress this month!'],
      nextSteps: [],
      comparison: null,
    };
  }
}

function mapMonthlyReportRow(
  row: typeof monthlyReports.$inferSelect
): MonthlyReportRecord {
  return monthlyReportRecordSchema.parse({
    id: row.id,
    profileId: row.profileId,
    childProfileId: row.childProfileId,
    reportMonth: row.reportMonth,
    reportData: row.reportData,
    viewedAt: row.viewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
}

export async function listMonthlyReportsForParentChild(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<MonthlyReportSummary[]> {
  const rows = await db.query.monthlyReports.findMany({
    where: and(
      eq(monthlyReports.profileId, parentProfileId),
      eq(monthlyReports.childProfileId, childProfileId)
    ),
    orderBy: desc(monthlyReports.reportMonth),
  });

  return rows.map((row) =>
    monthlyReportSummarySchema.parse({
      id: row.id,
      reportMonth: row.reportMonth,
      viewedAt: row.viewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      headlineStat: (row.reportData as MonthlyReportData).headlineStat ?? {
        label: 'Progress',
        value: 0,
        comparison: '',
      },
    })
  );
}

export async function listMonthlyReportsForProfile(
  db: Database,
  profileId: string
): Promise<MonthlyReportSummary[]> {
  const scoped = createScopedRepository(db, profileId);
  const rows = await scoped.monthlyReports.findMany(
    eq(monthlyReports.childProfileId, profileId)
  );

  return rows.map((row) =>
    monthlyReportSummarySchema.parse({
      id: row.id,
      reportMonth: row.reportMonth,
      viewedAt: row.viewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      headlineStat: (row.reportData as MonthlyReportData).headlineStat ?? {
        label: 'Progress',
        value: 0,
        comparison: '',
      },
    })
  );
}

export async function getMonthlyReportForParentChild(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  reportId: string
): Promise<MonthlyReportRecord | null> {
  const row = await db.query.monthlyReports.findFirst({
    where: and(
      eq(monthlyReports.id, reportId),
      eq(monthlyReports.profileId, parentProfileId),
      eq(monthlyReports.childProfileId, childProfileId)
    ),
  });

  return row ? mapMonthlyReportRow(row) : null;
}

export async function markMonthlyReportViewed(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  reportId: string
): Promise<void> {
  await db
    .update(monthlyReports)
    .set({ viewedAt: new Date() })
    .where(
      and(
        eq(monthlyReports.id, reportId),
        eq(monthlyReports.profileId, parentProfileId),
        eq(monthlyReports.childProfileId, childProfileId)
      )
    );
}
