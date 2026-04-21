// ---------------------------------------------------------------------------
// Weekly Report Service [BUG-524]
// Mirrors monthly-report.ts but aggregates over a 7-day window.
// ---------------------------------------------------------------------------

import { and, desc, eq } from 'drizzle-orm';
import { weeklyReports, type Database } from '@eduagent/database';
import type {
  WeeklyReportData,
  WeeklyReportRecord,
  WeeklyReportSummary,
  ProgressMetrics,
} from '@eduagent/schemas';
import {
  weeklyReportDataSchema,
  weeklyReportRecordSchema,
  weeklyReportSummarySchema,
} from '@eduagent/schemas';
import { assertParentAccess } from './family-access';

function safeDelta(current: number, previous: number | undefined): number {
  return Math.max(0, current - (previous ?? 0));
}

function subjectExploredTotal(metrics: ProgressMetrics): number {
  return metrics.subjects.reduce(
    (sum, subject) => sum + (subject.topicsExplored ?? 0),
    0
  );
}

export function generateWeeklyReportData(
  childName: string,
  weekStart: string,
  thisWeek: ProgressMetrics,
  lastWeek: ProgressMetrics | null
): WeeklyReportData {
  const topicsMasteredDelta = safeDelta(
    thisWeek.topicsMastered,
    lastWeek?.topicsMastered
  );
  const topicsExploredDelta = safeDelta(
    subjectExploredTotal(thisWeek),
    lastWeek ? subjectExploredTotal(lastWeek) : undefined
  );
  const vocabularyDelta = safeDelta(
    thisWeek.vocabularyTotal,
    lastWeek?.vocabularyTotal
  );

  const headlineMode =
    vocabularyDelta > topicsMasteredDelta
      ? {
          label: 'Words learned',
          value: vocabularyDelta,
          comparison: lastWeek
            ? `up from ${lastWeek.vocabularyTotal} last week`
            : 'in a first week',
        }
      : topicsExploredDelta > topicsMasteredDelta
      ? {
          label: 'Topics explored',
          value: topicsExploredDelta,
          comparison: lastWeek
            ? `${topicsExploredDelta} new this week`
            : 'in a first week',
        }
      : {
          label: 'Topics mastered',
          value: topicsMasteredDelta,
          comparison: lastWeek
            ? `up from ${lastWeek.topicsMastered} last week`
            : 'in a first week',
        };

  // thisWeek stores incremental deltas (not absolute values) except for
  // vocabularyTotal (cumulative) and streakBest (absolute). Callers reading
  // e.g. reportData.thisWeek.totalSessions get the week-over-week change.
  return weeklyReportDataSchema.parse({
    childName,
    weekStart,
    thisWeek: {
      totalSessions: safeDelta(thisWeek.totalSessions, lastWeek?.totalSessions),
      totalActiveMinutes: safeDelta(
        thisWeek.totalActiveMinutes,
        lastWeek?.totalActiveMinutes
      ),
      topicsMastered: topicsMasteredDelta,
      topicsExplored: topicsExploredDelta,
      vocabularyTotal: thisWeek.vocabularyTotal, // cumulative, not delta
      streakBest: thisWeek.longestStreak, // absolute, not delta
    },
    lastWeek: lastWeek
      ? {
          totalSessions: lastWeek.totalSessions,
          totalActiveMinutes: lastWeek.totalActiveMinutes,
          topicsMastered: lastWeek.topicsMastered,
          topicsExplored: subjectExploredTotal(lastWeek),
          vocabularyTotal: lastWeek.vocabularyTotal,
          streakBest: lastWeek.longestStreak,
        }
      : null,
    headlineStat: headlineMode,
  });
}

function mapWeeklyReportRow(
  row: typeof weeklyReports.$inferSelect
): WeeklyReportRecord {
  return weeklyReportRecordSchema.parse({
    id: row.id,
    profileId: row.profileId,
    childProfileId: row.childProfileId,
    reportWeek: row.reportWeek,
    reportData: row.reportData,
    viewedAt: row.viewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
}

export async function listWeeklyReportsForParentChild(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<WeeklyReportSummary[]> {
  await assertParentAccess(db, parentProfileId, childProfileId);
  const rows = await db.query.weeklyReports.findMany({
    where: and(
      eq(weeklyReports.profileId, parentProfileId),
      eq(weeklyReports.childProfileId, childProfileId)
    ),
    orderBy: desc(weeklyReports.reportWeek),
    limit: 12,
  });

  return rows.map((row) =>
    weeklyReportSummarySchema.parse({
      id: row.id,
      reportWeek: row.reportWeek,
      viewedAt: row.viewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      headlineStat: (row.reportData as WeeklyReportData).headlineStat ?? {
        label: 'Progress',
        value: 0,
        comparison: '',
      },
    })
  );
}

export async function getWeeklyReportForParentChild(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  reportId: string
): Promise<WeeklyReportRecord | null> {
  await assertParentAccess(db, parentProfileId, childProfileId);
  const row = await db.query.weeklyReports.findFirst({
    where: and(
      eq(weeklyReports.id, reportId),
      eq(weeklyReports.profileId, parentProfileId),
      eq(weeklyReports.childProfileId, childProfileId)
    ),
  });

  return row ? mapWeeklyReportRow(row) : null;
}

export async function markWeeklyReportViewed(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  reportId: string
): Promise<void> {
  await assertParentAccess(db, parentProfileId, childProfileId);
  await db
    .update(weeklyReports)
    .set({ viewedAt: new Date() })
    .where(
      and(
        eq(weeklyReports.id, reportId),
        eq(weeklyReports.profileId, parentProfileId),
        eq(weeklyReports.childProfileId, childProfileId)
      )
    );
}
