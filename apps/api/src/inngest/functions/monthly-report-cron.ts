// @inngest-admin: cross-profile
//
// This file is intentionally cross-profile. It contains two exports:
//   - `monthlyReportCron` (admin): cron entry that scans all parent/child
//     family links with active snapshots for the prior month, then fans out
//     per-pair generate events. Legitimately cross-profile.
//   - `monthlyReportGenerate` (per-pair fan-out): event handler driven by
//     `app/monthly-report.generate`; parentId and childId come from the event
//     payload and all DB reads are scoped to those two profiles only.
//
// Profile-scoping rules in CLAUDE.md ("Reads must use createScopedRepository")
// do NOT apply to `monthlyReportCron` — this is system-wide work running
// outside any single profile's request context.
//
// If you add raw drizzle queries to this file, ensure they cannot leak
// data between profiles in user-visible output (notifications,
// recommendations). When in doubt, scope by profileId at the leaf even
// when scanning broadly.

import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import {
  monthlyReports,
  profiles,
  progressSnapshots,
} from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  generateMonthlyReportData,
  generateReportHighlights,
} from '../../services/monthly-report';
import { getSnapshotsInRange } from '../../services/snapshot-aggregation';
import { sendPushNotification } from '../../services/notifications';
import { getRecentNotificationCount } from '../../services/settings';
import { captureException } from '../../services/sentry';
import { progressMetricsSchema } from '@eduagent/schemas';

// [BUG-848] Validate the JSONB `metrics` column at runtime instead of casting.
// Older snapshot rows may have a different shape from what current code
// expects, and `as ProgressMetrics` would silently produce a malformed object
// that crashes the report generator with a non-actionable error. safeParse
// keeps the cron resilient: bad rows are skipped per-pair and reported, the
// rest of the batch still completes.
function safeParseMetrics(raw: unknown) {
  if (raw == null) return null;
  const result = progressMetricsSchema.safeParse(raw);
  return result.success ? result.data : null;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthRangeStart(date: Date, monthOffset = 0): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1)
  );
}

function monthRangeEnd(date: Date, monthOffset = 0): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset + 1, 0)
  );
}

export const monthlyReportCron = inngest.createFunction(
  {
    id: 'progress-monthly-report',
    name: 'Queue monthly learning reports',
  },
  { cron: '0 10 1 * *' },
  async ({ step }) => {
    const pairs = await step.run('find-report-pairs', async () => {
      const db = getStepDatabase();
      const lastMonthStart = monthRangeStart(new Date(), -1);
      const lastMonthEnd = monthRangeEnd(new Date(), -1);
      const links = await db.query.familyLinks.findMany({
        columns: {
          parentProfileId: true,
          childProfileId: true,
        },
      });

      const childIds = links.map((l) => l.childProfileId);
      if (childIds.length === 0) return [];

      const rows = await db
        .selectDistinct({ childProfileId: progressSnapshots.profileId })
        .from(progressSnapshots)
        .where(
          and(
            inArray(progressSnapshots.profileId, childIds),
            gte(progressSnapshots.snapshotDate, isoDate(lastMonthStart)),
            lte(progressSnapshots.snapshotDate, isoDate(lastMonthEnd))
          )
        );
      const activeChildIds = new Set(rows.map((r) => r.childProfileId));

      return links
        .filter((l) => activeChildIds.has(l.childProfileId))
        .map((l) => ({
          parentId: l.parentProfileId,
          childId: l.childProfileId,
        }));
    });

    if (pairs.length === 0) {
      return { status: 'completed', queuedPairs: 0 };
    }

    // [BUG-850 / F-SVC-021] Per-batch try/catch + Sentry escalation. Without
    // per-batch isolation, a single failing sendEvent would either propagate
    // and skip the rest of the batches, or silently report `completed` while
    // half the parent/child pairs missed their monthly report.
    const BATCH_SIZE = 200;
    let queuedBatches = 0;
    let failedBatches = 0;
    let queuedPairs = 0;
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);
      try {
        await step.sendEvent(
          `fan-out-monthly-reports-${i}`,
          batch.map((pair) => ({
            name: 'app/monthly-report.generate' as const,
            data: pair,
          }))
        );
        queuedBatches += 1;
        queuedPairs += batch.length;
      } catch (err) {
        failedBatches += 1;
        captureException(err, {
          extra: {
            context: 'monthly-report-cron-fan-out',
            batchIndex: i,
            batchSize: batch.length,
            totalPairs: pairs.length,
          },
        });
      }
    }

    return {
      status: failedBatches === 0 ? 'completed' : 'partial',
      queuedPairs,
      totalPairs: pairs.length,
      queuedBatches,
      failedBatches,
    };
  }
);

export const monthlyReportGenerate = inngest.createFunction(
  {
    id: 'progress-monthly-report-generate',
    name: 'Generate one monthly learning report',
  },
  { event: 'app/monthly-report.generate' },
  async ({ event, step }) => {
    const { parentId, childId } = event.data;

    // [J-6] Step 1: Generate and persist report data.
    // The DB insert uses onConflictDoNothing, so retries are idempotent.
    // Push notification is in a SEPARATE step so that if push throws,
    // retry only re-runs the push (not the expensive LLM generation + insert).
    const reportResult = await step.run('generate-monthly-report', async () => {
      try {
        const db = getStepDatabase();
        const child = await db.query.profiles.findFirst({
          where: eq(profiles.id, childId),
          columns: { displayName: true },
        });
        if (!child) {
          return { status: 'skipped' as const, reason: 'child_missing' };
        }

        const lastMonthStart = monthRangeStart(new Date(), -1);
        const lastMonthEnd = monthRangeEnd(new Date(), -1);
        const previousMonthEnd = monthRangeEnd(new Date(), -2);
        const currentWindowStart = new Date(lastMonthEnd);
        currentWindowStart.setUTCDate(currentWindowStart.getUTCDate() - 2);
        const previousWindowStart = new Date(previousMonthEnd);
        previousWindowStart.setUTCDate(previousWindowStart.getUTCDate() - 2);

        const currentSnapshots = await getSnapshotsInRange(
          db,
          childId,
          isoDate(currentWindowStart),
          isoDate(lastMonthEnd)
        );
        const previousSnapshots = await getSnapshotsInRange(
          db,
          childId,
          isoDate(previousWindowStart),
          isoDate(previousMonthEnd)
        );

        const thisMonthMetrics = safeParseMetrics(
          currentSnapshots.at(-1)?.metrics
        );
        if (!thisMonthMetrics) {
          // Either no snapshot at all, or the snapshot row is from older
          // code and no longer matches the schema. Either way we cannot
          // generate a useful report — skip with a structured reason so on-
          // call has a queryable signal rather than discovering the drift
          // from a parent's missing report.
          if (currentSnapshots.at(-1)?.metrics != null) {
            captureException(
              new Error('monthly-report metrics shape mismatch'),
              {
                extra: {
                  parentId,
                  childId,
                  context: 'monthly-report-generate',
                  reason: 'progress_metrics_shape_mismatch',
                },
              }
            );
            return {
              status: 'skipped' as const,
              reason: 'metrics_shape_mismatch',
            };
          }
          return { status: 'skipped' as const, reason: 'no_snapshot' };
        }

        const previousMetrics = safeParseMetrics(
          previousSnapshots.at(-1)?.metrics
        );

        let reportData = generateMonthlyReportData(
          child.displayName ?? 'Your child',
          lastMonthStart.toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          }),
          thisMonthMetrics,
          previousMetrics
        );

        const llmContent = await generateReportHighlights(reportData);
        reportData = {
          ...reportData,
          highlights: llmContent.highlights,
          nextSteps: llmContent.nextSteps,
          headlineStat: llmContent.comparison
            ? {
                ...reportData.headlineStat,
                comparison: llmContent.comparison,
              }
            : reportData.headlineStat,
        };

        await db
          .insert(monthlyReports)
          .values({
            profileId: parentId,
            childProfileId: childId,
            reportMonth: isoDate(lastMonthStart),
            reportData,
          })
          .onConflictDoNothing();

        return {
          status: 'completed' as const,
          childDisplayName: child.displayName ?? 'Your child',
        };
      } catch (error) {
        captureException(error, {
          extra: { parentId, childId, context: 'monthly-report-generate' },
        });
        // [SWEEP-SILENT-RECOVERY / J-11] Returning { status: 'failed' } here
        // resolves the step as a success — Inngest only retries on thrown
        // errors. Without re-throw, transient LLM/DB errors are absorbed and
        // a parent/child pair quietly never gets their monthly report while
        // the dashboard counts the run as completed. Re-throw lets Inngest
        // retry and surface a real failure. See daily-snapshot.ts:78-80.
        throw error;
      }
    });

    if (reportResult.status !== 'completed') {
      return {
        status: reportResult.status,
        parentId,
        childId,
        // Preserve skip reason for observability (child_missing, no_snapshot)
        ...(reportResult.status === 'skipped' && 'reason' in reportResult
          ? { reason: reportResult.reason }
          : {}),
      };
    }

    // [J-6] Step 2: Send push notification in a separate step so that
    // a push failure only retries the push — not the LLM + DB insert above.
    //
    // [BUG-699-FOLLOWUP] 24h notification-log dedup — same shape as the
    // trial-expiry fix. Inngest's step.run memoizes within one run, but a
    // duplicate `app/monthly-report.generate` event (cron edge re-fire,
    // operator replay) creates a new run that would re-push the parent
    // without this guard. The cadence (monthly cron) makes the read-then-
    // write race window irrelevant in practice; if duplicates ever surface,
    // promote to a (profile_id, type, day) unique index on notificationLog.
    await step.run('send-push-notification', async () => {
      const db = getStepDatabase();
      const recentCount = await getRecentNotificationCount(
        db,
        parentId,
        'monthly_report',
        24
      );
      if (recentCount > 0) {
        return { sent: false, reason: 'dedup_24h' };
      }
      await sendPushNotification(db, {
        profileId: parentId,
        title: `${reportResult.childDisplayName}'s monthly report is ready`,
        body: 'Open the app to see what they learned this month.',
        type: 'monthly_report',
      });
      return { sent: true };
    });

    return { status: 'completed', parentId, childId };
  }
);
