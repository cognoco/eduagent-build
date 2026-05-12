import { and, eq, gte, lt } from 'drizzle-orm';
import {
  celebrationEvents,
  practiceActivityEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import {
  reportPracticeSummarySchema,
  type ReportPracticeActivityType,
  type ReportPracticeComparison,
  type ReportPracticeScores,
  type ReportPracticeSubjectBreakdown,
  type ReportPracticeSummary,
  type ReportPracticeTotals,
  type ReportPracticeTotalsDelta,
  type ReportPracticeTypeBreakdown,
} from '@eduagent/schemas';

export interface PracticeActivityPeriod {
  start: Date;
  endExclusive: Date;
}

export interface GetPracticeActivitySummaryInput {
  profileId: string;
  period: PracticeActivityPeriod;
  previousPeriod?: PracticeActivityPeriod | null;
}

type PracticeEventRow = {
  subjectId: string | null;
  subjectName: string | null;
  activityType: ReportPracticeActivityType;
  activitySubtype: string | null;
  pointsEarned: number;
  score: number | null;
  total: number | null;
};

function emptyTotals(): ReportPracticeTotals {
  return {
    activitiesCompleted: 0,
    reviewsCompleted: 0,
    pointsEarned: 0,
    celebrations: 0,
    distinctActivityTypes: 0,
  };
}

function emptyScores(): ReportPracticeScores {
  return {
    scoredActivities: 0,
    score: 0,
    total: 0,
    accuracy: null,
  };
}

function addScore(scores: ReportPracticeScores, row: PracticeEventRow): void {
  if (row.score == null || row.total == null || row.total <= 0) return;
  scores.scoredActivities += 1;
  scores.score += row.score;
  scores.total += row.total;
}

function finalizeScores(scores: ReportPracticeScores): ReportPracticeScores {
  return {
    ...scores,
    accuracy: scores.total > 0 ? scores.score / scores.total : null,
  };
}

function typeKey(
  row: Pick<PracticeEventRow, 'activityType' | 'activitySubtype'>,
) {
  return `${row.activityType}:${row.activitySubtype ?? ''}`;
}

function toDelta(
  current: ReportPracticeTotals,
  previous: ReportPracticeTotals,
): ReportPracticeTotalsDelta {
  return {
    activitiesCompleted:
      current.activitiesCompleted - previous.activitiesCompleted,
    reviewsCompleted: current.reviewsCompleted - previous.reviewsCompleted,
    pointsEarned: current.pointsEarned - previous.pointsEarned,
    celebrations: current.celebrations - previous.celebrations,
    distinctActivityTypes:
      current.distinctActivityTypes - previous.distinctActivityTypes,
  };
}

async function loadPracticeRows(
  db: Database,
  profileId: string,
  period: PracticeActivityPeriod,
): Promise<PracticeEventRow[]> {
  const rows = await db
    .select({
      subjectId: practiceActivityEvents.subjectId,
      subjectName: subjects.name,
      activityType: practiceActivityEvents.activityType,
      activitySubtype: practiceActivityEvents.activitySubtype,
      pointsEarned: practiceActivityEvents.pointsEarned,
      score: practiceActivityEvents.score,
      total: practiceActivityEvents.total,
    })
    .from(practiceActivityEvents)
    .leftJoin(subjects, eq(subjects.id, practiceActivityEvents.subjectId))
    .where(
      and(
        eq(practiceActivityEvents.profileId, profileId),
        gte(practiceActivityEvents.completedAt, period.start),
        lt(practiceActivityEvents.completedAt, period.endExclusive),
      ),
    );

  return rows;
}

async function loadCelebrationCount(
  db: Database,
  profileId: string,
  period: PracticeActivityPeriod,
): Promise<number> {
  const rows = await db
    .select({ id: celebrationEvents.id })
    .from(celebrationEvents)
    .where(
      and(
        eq(celebrationEvents.profileId, profileId),
        gte(celebrationEvents.celebratedAt, period.start),
        lt(celebrationEvents.celebratedAt, period.endExclusive),
      ),
    );
  return rows.length;
}

function buildSummaryFromRows(
  rows: PracticeEventRow[],
  celebrationCount: number,
  comparison?: ReportPracticeComparison,
): ReportPracticeSummary {
  const totals = emptyTotals();
  const scores = emptyScores();
  const distinctTypes = new Set<ReportPracticeActivityType>();
  const byType = new Map<string, ReportPracticeTypeBreakdown>();
  const bySubject = new Map<string, ReportPracticeSubjectBreakdown>();
  const bySubjectType = new Map<
    string,
    Map<string, ReportPracticeTypeBreakdown>
  >();

  for (const row of rows) {
    totals.activitiesCompleted += 1;
    totals.pointsEarned += row.pointsEarned;
    if (row.activityType === 'review') totals.reviewsCompleted += 1;
    distinctTypes.add(row.activityType);
    addScore(scores, row);

    const key = typeKey(row);
    const typeEntry =
      byType.get(key) ??
      ({
        activityType: row.activityType,
        activitySubtype: row.activitySubtype,
        count: 0,
        pointsEarned: 0,
        scoredActivities: 0,
        score: 0,
        total: 0,
      } satisfies ReportPracticeTypeBreakdown);
    typeEntry.count += 1;
    typeEntry.pointsEarned += row.pointsEarned;
    if (row.score != null && row.total != null && row.total > 0) {
      typeEntry.scoredActivities += 1;
      typeEntry.score += row.score;
      typeEntry.total += row.total;
    }
    byType.set(key, typeEntry);

    if (row.subjectId) {
      const subjectEntry =
        bySubject.get(row.subjectId) ??
        ({
          subjectId: row.subjectId,
          subjectName: row.subjectName,
          count: 0,
          pointsEarned: 0,
          byType: [],
        } satisfies ReportPracticeSubjectBreakdown);
      subjectEntry.count += 1;
      subjectEntry.pointsEarned += row.pointsEarned;
      bySubject.set(row.subjectId, subjectEntry);

      const subjectTypeMap =
        bySubjectType.get(row.subjectId) ??
        new Map<string, ReportPracticeTypeBreakdown>();
      const subjectTypeEntry =
        subjectTypeMap.get(key) ??
        ({
          activityType: row.activityType,
          activitySubtype: row.activitySubtype,
          count: 0,
          pointsEarned: 0,
          scoredActivities: 0,
          score: 0,
          total: 0,
        } satisfies ReportPracticeTypeBreakdown);
      subjectTypeEntry.count += 1;
      subjectTypeEntry.pointsEarned += row.pointsEarned;
      if (row.score != null && row.total != null && row.total > 0) {
        subjectTypeEntry.scoredActivities += 1;
        subjectTypeEntry.score += row.score;
        subjectTypeEntry.total += row.total;
      }
      subjectTypeMap.set(key, subjectTypeEntry);
      bySubjectType.set(row.subjectId, subjectTypeMap);
    }
  }

  totals.celebrations = celebrationCount;
  totals.distinctActivityTypes = distinctTypes.size;

  for (const subjectEntry of bySubject.values()) {
    subjectEntry.byType = Array.from(
      bySubjectType.get(subjectEntry.subjectId)?.values() ?? [],
    ).sort((a, b) => a.activityType.localeCompare(b.activityType));
  }

  const quizzesCompleted = rows.filter(
    (row) => row.activityType === 'quiz',
  ).length;

  return reportPracticeSummarySchema.parse({
    quizzesCompleted,
    reviewsCompleted: totals.reviewsCompleted,
    totals,
    scores: finalizeScores(scores),
    byType: Array.from(byType.values()).sort((a, b) =>
      a.activityType.localeCompare(b.activityType),
    ),
    bySubject: Array.from(bySubject.values()).sort((a, b) =>
      (a.subjectName ?? '').localeCompare(b.subjectName ?? ''),
    ),
    ...(comparison ? { comparison } : {}),
  });
}

async function buildPeriodSummary(
  db: Database,
  profileId: string,
  period: PracticeActivityPeriod,
): Promise<ReportPracticeSummary> {
  const [rows, celebrationCount] = await Promise.all([
    loadPracticeRows(db, profileId, period),
    loadCelebrationCount(db, profileId, period),
  ]);
  return buildSummaryFromRows(rows, celebrationCount);
}

export async function getPracticeActivitySummary(
  db: Database,
  input: GetPracticeActivitySummaryInput,
): Promise<ReportPracticeSummary> {
  const current = await buildPeriodSummary(db, input.profileId, input.period);
  if (!input.previousPeriod) return current;

  const previous = await buildPeriodSummary(
    db,
    input.profileId,
    input.previousPeriod,
  );
  return {
    ...current,
    comparison: {
      previous: previous.totals,
      delta: toDelta(current.totals, previous.totals),
    },
  };
}
