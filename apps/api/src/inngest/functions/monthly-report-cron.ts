import { eq } from 'drizzle-orm';
import { monthlyReports, profiles } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  generateMonthlyReportData,
  generateReportHighlights,
} from '../../services/monthly-report';
import { getSnapshotsInRange } from '../../services/snapshot-aggregation';
import { sendPushNotification } from '../../services/notifications';
import { captureException } from '../../services/sentry';
import type { ProgressMetrics } from '@eduagent/schemas';

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

      const eligible: Array<{ parentId: string; childId: string }> = [];
      for (const link of links) {
        const snapshots = await getSnapshotsInRange(
          db,
          link.childProfileId,
          isoDate(lastMonthStart),
          isoDate(lastMonthEnd)
        );
        if (snapshots.length > 0) {
          eligible.push({
            parentId: link.parentProfileId,
            childId: link.childProfileId,
          });
        }
      }

      return eligible;
    });

    if (pairs.length === 0) {
      return { status: 'completed', queuedPairs: 0 };
    }

    const BATCH_SIZE = 200;
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);
      await step.sendEvent(
        `fan-out-monthly-reports-${i}`,
        batch.map((pair) => ({
          name: 'app/monthly-report.generate' as const,
          data: pair,
        }))
      );
    }

    return { status: 'completed', queuedPairs: pairs.length };
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

    return step.run('generate-monthly-report', async () => {
      try {
        const db = getStepDatabase();
        const child = await db.query.profiles.findFirst({
          where: eq(profiles.id, childId),
          columns: { displayName: true },
        });
        if (!child) {
          return { status: 'skipped', reason: 'child_missing' };
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

        const thisMonthMetrics = currentSnapshots.at(-1)?.metrics as
          | ProgressMetrics
          | undefined;
        if (!thisMonthMetrics) {
          return { status: 'skipped', reason: 'no_snapshot' };
        }

        const previousMetrics =
          (previousSnapshots.at(-1)?.metrics as ProgressMetrics | undefined) ??
          null;

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

        await sendPushNotification(db, {
          profileId: parentId,
          title: `${child.displayName}'s monthly report is ready`,
          body: 'Open the app to see what they learned this month.',
          type: 'monthly_report',
        });

        return { status: 'completed', parentId, childId };
      } catch (error) {
        captureException(error, {
          extra: { parentId, childId, context: 'monthly-report-generate' },
        });
        return { status: 'failed', parentId, childId };
      }
    });
  }
);
