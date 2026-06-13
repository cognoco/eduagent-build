// ---------------------------------------------------------------------------
// Weekly digest line builder — per-child content for the weekly parent
// digest (push body + email summary/watch-lines), shared by the
// weekly-progress-push Inngest function's prepare and send steps.
//
// Lives in services/ (business logic), not in the Inngest function file;
// the function file orchestrates steps and calls this builder.
// ---------------------------------------------------------------------------

import { and, eq, isNull } from 'drizzle-orm';
import {
  person,
  profiles,
  weeklyReports,
  type Database,
} from '@eduagent/database';
import { isGdprProcessingAllowed } from './consent';
import { isIdentityV2EnabledInStep } from '../inngest/helpers';
import { isGdprProcessingAllowedV2 } from './identity-v2/consent-status-v2';
import {
  filterProgressMetricsToActiveSubjects,
  getLatestSnapshot,
  getLatestSnapshotOnOrBefore,
} from './snapshot-aggregation';
import { generateWeeklyReportData } from './weekly-report';
import { getPracticeActivitySummary } from './practice-activity-summary';
import { listStruggleTopicNames } from './learner-profile';
import { captureException } from './sentry';
import type { ChildStruggleLine } from './notifications';
import { isoDate, subtractDays, sumTopicsExplored } from './progress-helpers';

export interface ChildWeeklyDigestLine {
  /** 0..1 push/email summary line for this child (null = no line). */
  summaryLine: string | null;
  struggleLine: ChildStruggleLine;
  hasStruggleTopics: boolean;
  /**
   * snapshotDate of the snapshot this line was computed from. The prepare
   * step memoizes it (a date, not PII) so send-step rebuilds pin to the
   * same snapshot.
   */
  snapshotDate: string;
}

/**
 * Computes one child's weekly digest content (summary line + struggle
 * watch-line) from the DB, optionally persisting the weekly report row.
 *
 * Called once from the prepare step (persistReport: true — decides
 * eligibility and writes weeklyReports) and again from each send step
 * (persistReport: false — rehydrates the content). The recompute keeps the
 * child's name, summary text, and struggle topics out of memoized Inngest
 * step state. Send-step rebuilds pass `snapshotOnOrBefore` (the
 * snapshotDate the prepare step memoized): if a newer snapshot landed
 * before a delayed retry, the rebuild re-pins to the prepare-time snapshot
 * so the content stays tied to `reportWeek` and its idempotency key.
 *
 * Returns null when the child is consent-blocked, archived/missing, or has
 * no snapshot.
 */
export async function buildChildWeeklyDigestLine(
  db: Database,
  parentId: string,
  childProfileId: string,
  reportWeekStart: string,
  opts: { persistReport: boolean; snapshotOnOrBefore?: string },
): Promise<ChildWeeklyDigestLine | null> {
  // [CUT-B2] GDPR gate + child liveness dispatch by the cutover flag (this
  // helper runs only inside the weekly-progress-push Inngest steps, where the
  // per-invocation binding is set).
  const v2 = isIdentityV2EnabledInStep();
  const gdprOk = v2
    ? await isGdprProcessingAllowedV2(db, childProfileId)
    : await isGdprProcessingAllowed(db, childProfileId);
  if (!gdprOk) {
    return null;
  }

  const child = v2
    ? await db.query.person.findFirst({
        where: and(eq(person.id, childProfileId), isNull(person.archivedAt)),
        columns: { displayName: true },
      })
    : await db.query.profiles.findFirst({
        where: and(
          eq(profiles.id, childProfileId),
          isNull(profiles.archivedAt),
        ),
        columns: { displayName: true },
      });
  if (!child) return null;

  let latest = await getLatestSnapshot(db, childProfileId);
  if (
    opts.snapshotOnOrBefore &&
    latest &&
    latest.snapshotDate !== opts.snapshotOnOrBefore
  ) {
    // Delayed retry after a newer snapshot was written: re-pin to the
    // snapshot the prepare step used so the digest content cannot drift
    // past the report week.
    latest = await getLatestSnapshotOnOrBefore(
      db,
      childProfileId,
      opts.snapshotOnOrBefore,
    );
  }
  if (!latest) return null;
  const latestMetrics = await filterProgressMetricsToActiveSubjects(
    db,
    childProfileId,
    latest.metrics,
  );

  const previous = await getLatestSnapshotOnOrBefore(
    db,
    childProfileId,
    isoDate(subtractDays(new Date(`${latest.snapshotDate}T00:00:00Z`), 7)),
  );

  // [CR-2] Clamp: treat previous snapshot as null when the gap exceeds 14 days.
  // A wider gap means the "delta" spans multiple weeks rather than the current
  // 7-day window, producing inflated session and minute counts for inactive learners.
  const MAX_SNAPSHOT_GAP_MS = 14 * 24 * 60 * 60 * 1000;
  const snapshotGapMs =
    previous != null
      ? new Date(`${latest.snapshotDate}T00:00:00Z`).getTime() -
        new Date(`${previous.snapshotDate}T00:00:00Z`).getTime()
      : 0;
  const cappedPrevious = snapshotGapMs <= MAX_SNAPSHOT_GAP_MS ? previous : null;
  const cappedPreviousMetrics = cappedPrevious
    ? await filterProgressMetricsToActiveSubjects(
        db,
        childProfileId,
        cappedPrevious.metrics,
      )
    : null;

  const name = child.displayName ?? 'Your learner';
  const topicDelta = cappedPrevious
    ? Math.max(
        0,
        latestMetrics.topicsMastered -
          (cappedPreviousMetrics?.topicsMastered ?? 0),
      )
    : null;
  const vocabDelta = cappedPrevious
    ? Math.max(
        0,
        latestMetrics.vocabularyTotal -
          (cappedPreviousMetrics?.vocabularyTotal ?? 0),
      )
    : null;
  const exploredDelta = cappedPrevious
    ? Math.max(
        0,
        sumTopicsExplored(latestMetrics) -
          sumTopicsExplored(cappedPreviousMetrics ?? latestMetrics),
      )
    : null;

  if (opts.persistReport) {
    // [BUG-524] Persist the weekly report before building the push summary.
    // Uses onConflictDoNothing so re-runs for the same week are idempotent.
    const weekStartDate = new Date(`${reportWeekStart}T00:00:00.000Z`);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
    const previousWeekStart = subtractDays(weekStartDate, 7);
    const practiceSummary = await getPracticeActivitySummary(db, {
      profileId: childProfileId,
      period: {
        start: weekStartDate,
        endExclusive: weekEndDate,
      },
      previousPeriod: {
        start: previousWeekStart,
        endExclusive: weekStartDate,
      },
    });
    const reportData = generateWeeklyReportData(
      name,
      reportWeekStart,
      latestMetrics,
      cappedPreviousMetrics,
      practiceSummary,
    );
    await db
      .insert(weeklyReports)
      .values({
        profileId: parentId,
        childProfileId,
        reportWeek: reportWeekStart,
        reportData,
      })
      .onConflictDoNothing();
  }

  let summaryLine: string | null = null;
  if (
    latestMetrics.totalSessions === 0 ||
    (topicDelta === 0 && vocabDelta === 0 && exploredDelta === 0)
  ) {
    summaryLine = `${name} took a quieter week and still kept ${latestMetrics.topicsMastered} topics.`;
  } else {
    const parts = [
      topicDelta && topicDelta > 0 ? `+${topicDelta} topics` : null,
      vocabDelta && vocabDelta > 0 ? `+${vocabDelta} words` : null,
      exploredDelta && exploredDelta > 0 ? `+${exploredDelta} explored` : null,
    ].filter((value): value is string => !!value);
    if (parts.length > 0) {
      summaryLine = `${name}: ${parts.join(', ')}`;
    }
  }

  // Read current struggles for the watch-line (path A: topic names only).
  // A failing read is captured and degrades to an empty line; the digest
  // still sends.
  let topics: string[] = [];
  try {
    topics = await listStruggleTopicNames(db, childProfileId, 2);
  } catch (err) {
    captureException(err, {
      extra: {
        childProfileId,
        context: 'weekly-progress-push-struggles',
      },
    });
  }

  return {
    summaryLine,
    struggleLine: { childName: name, topics },
    hasStruggleTopics: topics.length > 0,
    snapshotDate: latest.snapshotDate,
  };
}
