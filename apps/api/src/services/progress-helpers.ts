// Shared helpers for date formatting, progress snapshot math, and coaching nudges.
// Used by dashboard, weekly-progress-push, and weekly-report services.

import { eq, and, gte, inArray, desc } from 'drizzle-orm';
import {
  subjects,
  learningSessions,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type { ProgressMetrics } from '@eduagent/schemas';

/** Format a Date as an ISO date string (YYYY-MM-DD). */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Return a new Date shifted backwards by `days` UTC days. */
export function subtractDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

/** Sum `topicsExplored` across all subjects in a progress snapshot. */
export function sumTopicsExplored(metrics: ProgressMetrics): number {
  return metrics.subjects.reduce(
    (sum, subject) => sum + (subject.topicsExplored ?? 0),
    0,
  );
}

export interface WeeklyProgressDeltas {
  topicsMastered: number | null;
  vocabularyTotal: number | null;
  topicsExplored: number | null;
}

export function computeWeeklyDeltas(
  previous: ProgressMetrics | null,
  current: ProgressMetrics,
): WeeklyProgressDeltas {
  if (!previous) {
    return {
      topicsMastered: null,
      vocabularyTotal: null,
      topicsExplored: null,
    };
  }

  return {
    topicsMastered: Math.max(
      0,
      current.topicsMastered - previous.topicsMastered,
    ),
    vocabularyTotal: Math.max(
      0,
      current.vocabularyTotal - previous.vocabularyTotal,
    ),
    topicsExplored: Math.max(
      0,
      sumTopicsExplored(current) - sumTopicsExplored(previous),
    ),
  };
}

/**
 * [BUG-913] Returns active subjects for `childProfileId`, ordered by recency
 * so coaching nudges always reference the subject the child has actually
 * practised, not whatever comes first alphabetically.
 *
 * Sort order: lastSessionAt DESC NULLS LAST, name ASC.
 *
 * Uses the scoped repository so every subject read is profile-gated. Only
 * subjects with `status = 'active'` are returned. Subjects that have never
 * been touched (null lastSessionAt) fall to the back.
 *
 * `topicsCompleted` is intentionally NOT returned: deriving it requires
 * per-subject assessment + topic-card joins (see services/progress.ts), and
 * the only consumer of this helper just maps to `s.name` for the coaching
 * nudge subject pick. The in-memory variant `sortSubjectsByActivityPriority`
 * in dashboard.ts uses topicsCompleted as a secondary tier when called with
 * the already-loaded `progress.subjects`; keeping that tier out of this
 * fetch path prevents a silent behavior split (one path comparing real
 * counts, the other comparing constant 0s).
 */
export async function getActiveSubjectsByRecency(
  db: Database,
  childProfileId: string,
): Promise<
  Array<{
    subjectId: string;
    name: string;
    lastSessionAt: string | null;
  }>
> {
  const repo = createScopedRepository(db, childProfileId);

  // Load all active subjects for this profile (scoped, no profileId escape possible).
  const activeSubjects = await repo.subjects.findMany(
    eq(subjects.status, 'active'),
  );
  if (activeSubjects.length === 0) return [];

  const subjectIds = activeSubjects.map((s) => s.id);

  // Fetch the last real session (exchangeCount >= 1) per subject in one query.
  // Using a raw select + GROUP BY is safer than loading all sessions into JS.
  const lastSessionRows = await db
    .select({
      subjectId: learningSessions.subjectId,
      lastSessionAt: learningSessions.lastActivityAt,
    })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.profileId, childProfileId),
        inArray(learningSessions.subjectId, subjectIds),
        gte(learningSessions.exchangeCount, 1),
      ),
    )
    .orderBy(desc(learningSessions.lastActivityAt));

  // Build a map: subjectId → most-recent lastActivityAt ISO string.
  const lastSessionBySubject = new Map<string, string>();
  for (const row of lastSessionRows) {
    if (!lastSessionBySubject.has(row.subjectId)) {
      lastSessionBySubject.set(row.subjectId, row.lastSessionAt.toISOString());
    }
  }

  const result = activeSubjects.map((s) => ({
    subjectId: s.id,
    name: s.name,
    lastSessionAt: lastSessionBySubject.get(s.id) ?? null,
  }));

  // Sort: lastSessionAt non-null (most recent first), then name (alphabetical).
  return result.sort((a, b) => {
    const aMs = a.lastSessionAt ? Date.parse(a.lastSessionAt) : 0;
    const bMs = b.lastSessionAt ? Date.parse(b.lastSessionAt) : 0;
    if (aMs !== bMs) return bMs - aMs;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Trend helpers — extracted from dashboard.ts (PR-2 surface-ownership-boundaries)
// ---------------------------------------------------------------------------

/** Minimum completed sessions before trend signals carry meaning. [F-PV-03] */
export const MIN_TREND_SESSIONS = 3;

/**
 * Calculates retention trend as a snapshot heuristic.
 * Compares strong count vs weak+fading count across all subjects.
 * Returns 'stable' when totalSessions < MIN_TREND_SESSIONS — the signal is
 * noise at low N.
 */
export function calculateRetentionTrend(
  subjectRetentionData: Array<{
    status: 'strong' | 'fading' | 'weak' | 'forgotten';
  }>,
  totalSessions?: number,
): 'improving' | 'declining' | 'stable' {
  if (
    subjectRetentionData.length === 0 ||
    (totalSessions ?? 0) < MIN_TREND_SESSIONS
  )
    return 'stable';
  const strongCount = subjectRetentionData.filter(
    (s) => s.status === 'strong',
  ).length;
  const weakCount = subjectRetentionData.filter(
    (s) =>
      s.status === 'weak' || s.status === 'fading' || s.status === 'forgotten',
  ).length;
  if (strongCount > weakCount) return 'improving';
  if (strongCount < weakCount) return 'declining';
  return 'stable';
}

/**
 * Calculates the trend between current and previous values.
 */
export function calculateTrend(
  current: number,
  previous: number,
): 'up' | 'down' | 'stable' {
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'stable';
}

/**
 * Calculates the guided-vs-immediate ratio.
 *
 * Returns 0-1 ratio where 1 means all problems were guided.
 * Returns 0 if totalCount is 0.
 */
export function calculateGuidedRatio(guided: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(1, Math.max(0, guided / total));
}

export function buildProgressGuidance(
  childName: string,
  subjectNames: string[],
  sessionsThisWeek: number,
  previousSessions: number,
  currentStreak?: number,
): string | null {
  const primarySubject = subjectNames[0];

  if (sessionsThisWeek === 0 && primarySubject) {
    // [BUG-523] A non-zero streak proves recent activity — "Quiet week" would
    // contradict the visible streak badge. Show an encouraging nudge instead.
    if ((currentStreak ?? 0) > 0) {
      return `${childName} has a ${
        currentStreak ?? 0
      }-day streak — keep it going with ${primarySubject}!`;
    }
    return `Quiet week — maybe suggest a quick session on ${primarySubject}?`;
  }

  if (sessionsThisWeek < previousSessions && primarySubject) {
    return `${childName} is still building knowledge. ${primarySubject} might be a good next nudge.`;
  }

  return null;
}
