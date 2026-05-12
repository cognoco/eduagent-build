import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  consentStates,
  familyLinks,
  profiles,
  weeklyReports,
} from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  listEligibleSelfReportProfileIds,
  listEligibleSelfReportProfileIdsAtLocalHour9,
} from '../../services/solo-progress-reports';
import { getLatestSnapshotOnOrBefore } from '../../services/snapshot-aggregation';
import { generateWeeklyReportData } from '../../services/weekly-report';
import { captureException } from '../../services/sentry';
import { isoDate, subtractDays } from '../../services/progress-helpers';

const weeklySelfReportEventSchema = z.object({
  profileId: z.string().uuid(),
  reportWeekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const BATCH_SIZE = 200;

function startOfCurrentWeek(date: Date): Date {
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() + mondayOffset);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function monthRangeStart(date: Date, monthOffset = 0): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1),
  );
}

function monthRangeEnd(date: Date, monthOffset = 0): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset + 1, 0),
  );
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

async function sendBatchedEvents(
  step: {
    sendEvent: (
      id: string,
      payload:
        | Array<{ name: string; data: Record<string, string> }>
        | { name: string; data: Record<string, string> },
    ) => Promise<unknown>;
  },
  input: {
    context: string;
    labelPrefix: string;
    events: Array<{ name: string; data: Record<string, string> }>;
  },
): Promise<{
  queuedEvents: number;
  queuedBatches: number;
  failedBatches: number;
}> {
  let queuedEvents = 0;
  let queuedBatches = 0;
  let failedBatches = 0;

  for (let i = 0; i < input.events.length; i += BATCH_SIZE) {
    const batch = input.events.slice(i, i + BATCH_SIZE);
    try {
      await step.sendEvent(`${input.labelPrefix}-${i}`, batch);
      queuedEvents += batch.length;
      queuedBatches += 1;
    } catch (error) {
      failedBatches += 1;
      captureException(error, {
        extra: {
          context: input.context,
          batchIndex: i,
          batchSize: batch.length,
          totalEvents: input.events.length,
        },
      });
    }
  }

  return { queuedEvents, queuedBatches, failedBatches };
}

export const weeklySelfReportCron = inngest.createFunction(
  {
    id: 'progress-weekly-self-report',
    name: 'Queue weekly self progress reports',
  },
  { cron: '0 * * * 1' },
  async ({ step }) => {
    const nowUtc = new Date();
    const currentWeekStart = startOfCurrentWeek(nowUtc);
    const trailingWeekStart = subtractDays(currentWeekStart, 7);

    const profileIds = await step.run('find-weekly-self-profiles', async () => {
      const db = getStepDatabase();
      return listEligibleSelfReportProfileIdsAtLocalHour9(
        db,
        {
          start: trailingWeekStart,
          endExclusive: currentWeekStart,
        },
        nowUtc,
      );
    });

    if (profileIds.length === 0) {
      return { status: 'completed', queuedProfiles: 0 };
    }

    const result = await sendBatchedEvents(step, {
      context: 'weekly-self-report-cron-fan-out',
      labelPrefix: 'fan-out-weekly-self-reports',
      events: profileIds.map((profileId) => ({
        name: 'app/weekly-self-report.generate',
        data: { profileId },
      })),
    });

    return {
      status: result.failedBatches === 0 ? 'completed' : 'partial',
      queuedProfiles: result.queuedEvents,
      totalProfiles: profileIds.length,
      queuedBatches: result.queuedBatches,
      failedBatches: result.failedBatches,
    };
  },
);

export const weeklySelfReportGenerate = inngest.createFunction(
  {
    id: 'progress-weekly-self-report-generate',
    name: 'Generate one weekly self progress report',
  },
  { event: 'app/weekly-self-report.generate' },
  async ({ event, step }) => {
    const parsed = weeklySelfReportEventSchema.safeParse(event.data);
    if (!parsed.success) {
      return { status: 'skipped', reason: 'invalid_payload' };
    }

    const { profileId } = parsed.data;
    const reportWeekStart =
      parsed.data.reportWeekStart ?? isoDate(startOfCurrentWeek(new Date()));
    const reportWeekStartDate = new Date(`${reportWeekStart}T00:00:00.000Z`);
    const activityWindowStart = subtractDays(reportWeekStartDate, 7);
    const reportWindowEnd = subtractDays(reportWeekStartDate, 1);
    const previousWindowEnd = subtractDays(reportWeekStartDate, 8);

    try {
      const result = await step.run('generate-weekly-self-report', async () => {
        const db = getStepDatabase();

        const eligibleProfileIds = await listEligibleSelfReportProfileIds(db, {
          start: activityWindowStart,
          endExclusive: reportWeekStartDate,
        });
        if (!eligibleProfileIds.includes(profileId)) {
          return {
            status: 'skipped' as const,
            reason: 'ineligible_profile',
            profileId,
          };
        }

        const consentState = await db.query.consentStates.findFirst({
          where: and(
            eq(consentStates.profileId, profileId),
            eq(consentStates.consentType, 'GDPR'),
          ),
          orderBy: desc(consentStates.requestedAt),
        });
        if (consentState != null && consentState.status !== 'CONSENTED') {
          return {
            status: 'skipped' as const,
            reason: 'consent_not_granted',
            profileId,
          };
        }

        const linkedChild = await db.query.familyLinks.findFirst({
          where: eq(familyLinks.childProfileId, profileId),
          columns: { childProfileId: true },
        });
        if (linkedChild) {
          return {
            status: 'skipped' as const,
            reason: 'linked_child_profile',
            profileId,
          };
        }

        const profile = await db.query.profiles.findFirst({
          where: eq(profiles.id, profileId),
          columns: { displayName: true },
        });
        if (!profile) {
          return {
            status: 'skipped' as const,
            reason: 'profile_missing',
            profileId,
          };
        }
        if (!profile.displayName || profile.displayName.trim().length === 0) {
          captureException(
            new Error('weekly self report missing display name'),
            {
              extra: {
                profileId,
                context: 'weekly-self-report-generate',
                reason: 'self_display_name_missing',
              },
            },
          );
          return {
            status: 'skipped' as const,
            reason: 'self_display_name_missing',
            profileId,
          };
        }

        const latest = await getLatestSnapshotOnOrBefore(
          db,
          profileId,
          isoDate(reportWindowEnd),
        );
        if (!latest) {
          return {
            status: 'skipped' as const,
            reason: 'no_snapshot',
            profileId,
          };
        }

        const previous = await getLatestSnapshotOnOrBefore(
          db,
          profileId,
          isoDate(previousWindowEnd),
        );

        const MAX_SNAPSHOT_GAP_MS = 14 * 24 * 60 * 60 * 1000;
        const snapshotGapMs =
          previous != null
            ? new Date(`${latest.snapshotDate}T00:00:00Z`).getTime() -
              new Date(`${previous.snapshotDate}T00:00:00Z`).getTime()
            : 0;
        const cappedPrevious =
          snapshotGapMs <= MAX_SNAPSHOT_GAP_MS ? previous : null;

        const reportData = generateWeeklyReportData(
          profile.displayName,
          reportWeekStart,
          latest.metrics,
          cappedPrevious?.metrics ?? null,
        );

        await db
          .insert(weeklyReports)
          .values({
            profileId,
            childProfileId: profileId,
            reportWeek: reportWeekStart,
            reportData,
          })
          .onConflictDoNothing();

        return {
          status: 'completed' as const,
          profileId,
          reportWeek: reportWeekStart,
        };
      });

      return result;
    } catch (error) {
      captureException(error, {
        extra: {
          profileId,
          reportWeekStart,
          context: 'weekly-self-report-generate',
        },
      });
      throw error;
    }
  },
);

export const selfProgressReportsBackfill = inngest.createFunction(
  {
    id: 'progress-self-reports-backfill',
    name: 'Backfill self progress reports',
  },
  { event: 'admin/progress-self-reports-backfill.requested' },
  async ({ step }) => {
    const now = new Date();
    const currentWeekStart = startOfCurrentWeek(now);
    const lastMonthStart = monthRangeStart(now, -1);
    const lastMonthEnd = monthRangeEnd(now, -1);
    const lastMonthEndExclusive = addDays(lastMonthEnd, 1);

    const monthlyProfileIds = await step.run(
      'find-backfill-monthly-self-profiles',
      async () => {
        const db = getStepDatabase();
        return listEligibleSelfReportProfileIds(db, {
          start: lastMonthStart,
          endExclusive: lastMonthEndExclusive,
        });
      },
    );

    const weeklyTargets = await step.run(
      'find-backfill-weekly-self-profiles',
      async () => {
        const db = getStepDatabase();
        const targets: Array<{ profileId: string; reportWeekStart: string }> =
          [];

        for (let weekOffset = 0; weekOffset < 4; weekOffset += 1) {
          const reportWeekStartDate = subtractDays(
            currentWeekStart,
            weekOffset * 7,
          );
          const eligibleProfileIds = await listEligibleSelfReportProfileIds(
            db,
            {
              start: subtractDays(reportWeekStartDate, 7),
              endExclusive: reportWeekStartDate,
            },
          );

          targets.push(
            ...eligibleProfileIds.map((profileId) => ({
              profileId,
              reportWeekStart: isoDate(reportWeekStartDate),
            })),
          );
        }

        return targets;
      },
    );

    const monthlyBatchResult =
      monthlyProfileIds.length === 0
        ? { queuedEvents: 0, queuedBatches: 0, failedBatches: 0 }
        : await sendBatchedEvents(step, {
            context: 'self-progress-reports-backfill-monthly-fan-out',
            labelPrefix: 'fan-out-backfill-monthly-self-reports',
            events: monthlyProfileIds.map((profileId) => ({
              name: 'app/monthly-report.generate',
              data: {
                parentId: profileId,
                childId: profileId,
              },
            })),
          });

    const weeklyBatchResult =
      weeklyTargets.length === 0
        ? { queuedEvents: 0, queuedBatches: 0, failedBatches: 0 }
        : await sendBatchedEvents(step, {
            context: 'self-progress-reports-backfill-weekly-fan-out',
            labelPrefix: 'fan-out-backfill-weekly-self-reports',
            events: weeklyTargets.map((target) => ({
              name: 'app/weekly-self-report.generate',
              data: target,
            })),
          });

    const failedBatches =
      monthlyBatchResult.failedBatches + weeklyBatchResult.failedBatches;

    return {
      status: failedBatches === 0 ? 'completed' : 'partial',
      queuedMonthlyReports: monthlyBatchResult.queuedEvents,
      totalMonthlyReports: monthlyProfileIds.length,
      queuedWeeklyReports: weeklyBatchResult.queuedEvents,
      totalWeeklyReports: weeklyTargets.length,
      queuedBatches:
        monthlyBatchResult.queuedBatches + weeklyBatchResult.queuedBatches,
      failedBatches,
    };
  },
);
