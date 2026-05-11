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
  ReportPracticeSummary,
} from '@eduagent/schemas';
import {
  weeklyReportDataSchema,
  weeklyReportRecordSchema,
  weeklyReportSummarySchema,
} from '@eduagent/schemas';
import { assertParentAccess } from './family-access';
import { sumTopicsExplored } from './progress-helpers';

function safeDelta(current: number, previous: number | undefined): number {
  return Math.max(0, current - (previous ?? 0));
}

export function generateWeeklyReportData(
  childName: string,
  weekStart: string,
  thisWeek: ProgressMetrics,
  lastWeek: ProgressMetrics | null,
): WeeklyReportData {
  const topicsMasteredDelta = safeDelta(
    thisWeek.topicsMastered,
    lastWeek?.topicsMastered,
  );
  const topicsExploredDelta = safeDelta(
    sumTopicsExplored(thisWeek),
    lastWeek ? sumTopicsExplored(lastWeek) : undefined,
  );
  const vocabularyDelta = safeDelta(
    thisWeek.vocabularyTotal,
    lastWeek?.vocabularyTotal,
  );

  // BUG-903: When the headline metric is zero AND last week's value is also
  // zero, "up from 0 last week" is meaningless and reads like a dead-end.
  // Replace the comparison with a friendly empty-state line so parents see
  // an honest "no activity yet" framing instead of a contradictory zero diff.
  const isQuietWeek =
    topicsMasteredDelta === 0 &&
    topicsExploredDelta === 0 &&
    vocabularyDelta === 0 &&
    (!lastWeek ||
      (lastWeek.vocabularyTotal === 0 && lastWeek.topicsMastered === 0));

  const headlineMode = isQuietWeek
    ? {
        label: 'Topics mastered',
        value: 0,
        comparison: lastWeek
          ? "No activity this week — that's OK. A nudge can help."
          : 'A first week is for warming up.',
      }
    : vocabularyDelta > topicsMasteredDelta
      ? {
          label: 'Words learned',
          value: vocabularyDelta,
          comparison: lastWeek
            ? vocabularyDelta === 0 && lastWeek.vocabularyTotal === 0
              ? "No new words this week — that's OK."
              : `up from ${lastWeek.vocabularyTotal} last week`
            : 'in a first week',
        }
      : topicsExploredDelta > topicsMasteredDelta
        ? {
            label: 'Topics explored',
            value: topicsExploredDelta,
            comparison: lastWeek
              ? topicsExploredDelta === 0
                ? "No new topics this week — that's OK."
                : `${topicsExploredDelta} new this week`
              : 'in a first week',
          }
        : {
            label: 'Topics mastered',
            value: topicsMasteredDelta,
            comparison: lastWeek
              ? topicsMasteredDelta === 0 && lastWeek.topicsMastered === 0
                ? "No new topics mastered — that's OK."
                : `up from ${lastWeek.topicsMastered} last week`
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
        lastWeek?.totalActiveMinutes,
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
          topicsExplored: sumTopicsExplored(lastWeek),
          vocabularyTotal: lastWeek.vocabularyTotal,
          streakBest: lastWeek.longestStreak,
        }
      : null,
    headlineStat: headlineMode,
  });
}

function mapWeeklyReportRow(
  row: typeof weeklyReports.$inferSelect,
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

function getWeeklyReportData(row: typeof weeklyReports.$inferSelect): {
  headlineStat: WeeklyReportData['headlineStat'];
  thisWeek: WeeklyReportData['thisWeek'] | undefined;
  practiceSummary: ReportPracticeSummary | undefined;
} {
  const reportData = row.reportData as Partial<WeeklyReportData>;
  return {
    headlineStat: reportData.headlineStat ?? {
      label: 'Progress',
      value: 0,
      comparison: '',
    },
    thisWeek: reportData.thisWeek,
    practiceSummary: reportData.practiceSummary,
  };
}

function mapWeeklyReportSummary(
  row: typeof weeklyReports.$inferSelect,
): WeeklyReportSummary {
  const reportData = getWeeklyReportData(row);
  return weeklyReportSummarySchema.parse({
    id: row.id,
    reportWeek: row.reportWeek,
    viewedAt: row.viewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    headlineStat: reportData.headlineStat,
    ...(reportData.thisWeek ? { thisWeek: reportData.thisWeek } : {}),
    ...(reportData.practiceSummary
      ? { practiceSummary: reportData.practiceSummary }
      : {}),
  });
}

export async function listWeeklyReportsForParentChild(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<WeeklyReportSummary[]> {
  await assertParentAccess(db, parentProfileId, childProfileId);
  const rows = await db.query.weeklyReports.findMany({
    where: and(
      eq(weeklyReports.profileId, parentProfileId),
      eq(weeklyReports.childProfileId, childProfileId),
    ),
    orderBy: desc(weeklyReports.reportWeek),
    limit: 12,
  });

  return rows.map(mapWeeklyReportSummary);
}

export async function listWeeklyReportsForProfile(
  db: Database,
  profileId: string,
): Promise<WeeklyReportSummary[]> {
  const rows = await db.query.weeklyReports.findMany({
    where: eq(weeklyReports.childProfileId, profileId),
    orderBy: desc(weeklyReports.reportWeek),
    limit: 12,
  });

  return rows.map(mapWeeklyReportSummary);
}

export async function getWeeklyReportForProfile(
  db: Database,
  profileId: string,
  reportId: string,
): Promise<WeeklyReportRecord | null> {
  const row = await db.query.weeklyReports.findFirst({
    where: and(
      eq(weeklyReports.id, reportId),
      eq(weeklyReports.childProfileId, profileId),
    ),
  });

  return row ? mapWeeklyReportRow(row) : null;
}

export async function getWeeklyReportForParentChild(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  reportId: string,
): Promise<WeeklyReportRecord | null> {
  await assertParentAccess(db, parentProfileId, childProfileId);
  const row = await db.query.weeklyReports.findFirst({
    where: and(
      eq(weeklyReports.id, reportId),
      eq(weeklyReports.profileId, parentProfileId),
      eq(weeklyReports.childProfileId, childProfileId),
    ),
  });

  return row ? mapWeeklyReportRow(row) : null;
}

export async function markWeeklyReportViewed(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  reportId: string,
): Promise<void> {
  await assertParentAccess(db, parentProfileId, childProfileId);
  await db
    .update(weeklyReports)
    .set({ viewedAt: new Date() })
    .where(
      and(
        eq(weeklyReports.id, reportId),
        eq(weeklyReports.profileId, parentProfileId),
        eq(weeklyReports.childProfileId, childProfileId),
      ),
    );
}
