// Shared helpers for date formatting and progress snapshot math.
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
    0
  );
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
  childProfileId: string
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
    eq(subjects.status, 'active')
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
        gte(learningSessions.exchangeCount, 1)
      )
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
