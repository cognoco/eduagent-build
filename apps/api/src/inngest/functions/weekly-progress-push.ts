// @inngest-admin: cross-profile
//
// This file is intentionally cross-profile. It contains two exports:
//   - `weeklyProgressPushCron` (admin): cron entry that scans all parent
//     profiles with weekly-push enabled whose local time is 09:00, then fans
//     out per-parent generate events. Legitimately cross-profile.
//   - `weeklyProgressPushGenerate` (per-parent fan-out): event handler driven
//     by `app/weekly-progress-push.generate`; parentId comes from the event
//     payload and all DB reads are scoped to that parent and their children.
//
// Profile-scoping rules in CLAUDE.md ("Reads must use createScopedRepository")
// do NOT apply to `weeklyProgressPushCron` — this is system-wide work running
// outside any single profile's request context.
//
// If you add raw drizzle queries to this file, ensure they cannot leak
// data between profiles in user-visible output (notifications,
// recommendations). When in doubt, scope by profileId at the leaf even
// when scanning broadly.

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  accounts,
  familyLinks,
  learningProfiles,
  notificationPreferences,
  profiles,
  weeklyReports,
} from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase, getStepResendApiKey } from '../helpers';
import {
  sendPushNotification,
  sendEmail,
  formatWeeklyProgressEmail,
  type ChildStruggleLine,
} from '../../services/notifications';
import {
  getRecentNotificationCount,
  logNotification,
} from '../../services/settings';
import {
  filterProgressMetricsToActiveSubjects,
  getLatestSnapshot,
  getLatestSnapshotOnOrBefore,
} from '../../services/snapshot-aggregation';
import { generateWeeklyReportData } from '../../services/weekly-report';
import { getPracticeActivitySummary } from '../../services/practice-activity-summary';
import { captureException } from '../../services/sentry';
import { buildLegacyEmailIdempotencyKey } from '../../services/dedupe-key';
import { isGdprProcessingAllowed } from '../../services/consent';
import {
  listEligibleSelfReportProfileIds,
  listEligibleSelfReportProfileIdsAtLocalHour9,
} from '../../services/solo-progress-reports';

import {
  isoDate,
  subtractDays,
  sumTopicsExplored,
} from '../../services/progress-helpers';

const weeklyProgressPushEventSchema = z.object({
  parentId: z.string().uuid(),
  includeSelfReport: z.boolean().optional(),
  reportWeekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  // [BUG-757] Optional retry counter. When the cron's batch sendEvent fails and
  // the cron re-enqueues parents 5 minutes later, the retry event carries
  // retryAttempt=1; subsequent re-runs (should never happen in practice given
  // the generate-side idempotency dedup) would increment. Receiver bounds it
  // via MAX_GENERATE_RETRY_ATTEMPTS to guarantee termination.
  retryAttempt: z.number().int().min(0).optional(),
});

// [BUG-757] Hard cap on per-event retries — matches the cron's
// MAX_GENERATE_RETRY_ATTEMPTS. If a generate event ever arrives with a
// retryAttempt above this cap, the handler short-circuits to `skipped` with
// reason `retry_cap_exhausted` and the cap is surfaced to Sentry by the cron
// when it would have re-enqueued. Idempotency dedup means even a stale retry
// chain cannot deliver duplicate pushes.
const MAX_GENERATE_RETRY_ATTEMPTS = 3;

type PreparedWeeklyProgressDigest =
  | {
      status: 'prepared';
      parentId: string;
      reportWeek: string;
      childProfileIds: string[];
      childSummaries: string[];
      struggleLines: ChildStruggleLine[];
      shouldSendPush: boolean;
      shouldSendEmail: boolean;
      parentEmail: string | null;
    }
  | {
      status: 'skipped' | 'throttled' | 'self_report_only';
      reason: string;
      parentId: string;
    };

// [FR239.1 UX-9] Returns true when 09:00 local time matches the UTC hour of nowUtc.
// Parents with no timezone (or an invalid one) fall back to UTC, so they are
// processed in the 09:00 UTC run.
//
// [BUG-640 / J-4] The cron schedule `0 * * * 1` is hourly-on-Monday by design.
// It is paired with this filter so each parent fires on exactly one of the 24
// hourly invocations — the one where their local time hits 09:00. Changing the
// cron to `0 9 * * 1` would constrain delivery to UTC parents only and break
// timezone-aware morning delivery for everyone else. See test:
// "fires for each parent exactly once across the 24 Monday-UTC hours".
export function isLocalHour9(timezone: string | null, nowUtc: Date): boolean {
  if (!timezone) return nowUtc.getUTCHours() === 9;
  try {
    const localTimeStr = nowUtc.toLocaleString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(localTimeStr, 10) === 9;
  } catch {
    return nowUtc.getUTCHours() === 9;
  }
}

function startOfCurrentWeek(date: Date): Date {
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() + mondayOffset);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

async function persistWeeklySelfReportForProfile(
  db: ReturnType<typeof getStepDatabase>,
  profileId: string,
  reportWeekStart: string,
): Promise<
  | { status: 'completed'; reportWeek: string }
  | { status: 'skipped'; reason: string }
> {
  const reportWeekStartDate = new Date(`${reportWeekStart}T00:00:00.000Z`);
  const activityWindowStart = subtractDays(reportWeekStartDate, 7);
  const reportWindowEnd = subtractDays(reportWeekStartDate, 1);
  const previousWindowEnd = subtractDays(reportWeekStartDate, 8);

  const eligibleProfileIds = await listEligibleSelfReportProfileIds(db, {
    start: activityWindowStart,
    endExclusive: reportWeekStartDate,
  });
  if (!eligibleProfileIds.includes(profileId)) {
    return { status: 'skipped', reason: 'ineligible_self_profile' };
  }

  const profile = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, profileId), isNull(profiles.archivedAt)),
    columns: { displayName: true },
  });
  if (!profile) {
    return { status: 'skipped', reason: 'self_profile_missing' };
  }
  if (!profile.displayName || profile.displayName.trim().length === 0) {
    captureException(new Error('weekly self report missing display name'), {
      extra: {
        profileId,
        context: 'weekly-progress-push-self-report',
        reason: 'self_display_name_missing',
      },
    });
    return { status: 'skipped', reason: 'self_display_name_missing' };
  }

  const latest = await getLatestSnapshotOnOrBefore(
    db,
    profileId,
    isoDate(reportWindowEnd),
  );
  if (!latest) {
    return { status: 'skipped', reason: 'self_no_snapshot' };
  }
  const latestMetrics = await filterProgressMetricsToActiveSubjects(
    db,
    profileId,
    latest.metrics,
  );

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
  const cappedPrevious = snapshotGapMs <= MAX_SNAPSHOT_GAP_MS ? previous : null;
  const cappedPreviousMetrics = cappedPrevious
    ? await filterProgressMetricsToActiveSubjects(
        db,
        profileId,
        cappedPrevious.metrics,
      )
    : null;

  const practiceSummary = await getPracticeActivitySummary(db, {
    profileId,
    period: {
      start: activityWindowStart,
      endExclusive: reportWeekStartDate,
    },
    previousPeriod: {
      start: subtractDays(reportWeekStartDate, 14),
      endExclusive: activityWindowStart,
    },
  });
  const reportData = generateWeeklyReportData(
    profile.displayName,
    reportWeekStart,
    latestMetrics,
    cappedPreviousMetrics,
    practiceSummary,
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

  return { status: 'completed', reportWeek: reportWeekStart };
}

// ---------------------------------------------------------------------------
// [EP15-I1 AR-9] Fan-out pattern.
//
// The previous single-step implementation ran every parent+child permutation
// serially inside one `step.run`, which meant a single slow profile or a
// single DB hiccup would hold up the entire weekly push batch. It also risked
// exceeding the step execution time limit at scale. Monthly report cron
// already adopted this fan-out in AR-9; the weekly push was overlooked.
//
// This file now:
//   1. `weeklyProgressPushCron` — cron entrypoint that enumerates eligible
//      parents and sends them as a batch of `app/weekly-progress-push.generate`
//      events (chunks of 200 per step.sendEvent, matching monthly-report-cron).
//   2. `weeklyProgressPushGenerate` — per-parent event handler that does the
//      snapshot math and sends exactly one push.
//
// Each child parent is now independently retryable, observable, and bounded.
// ---------------------------------------------------------------------------

export const weeklyProgressPushCron = inngest.createFunction(
  {
    id: 'progress-weekly-parent-push',
    name: 'Queue weekly parent progress summary fan-out',
  },
  { cron: '0 * * * 1' },
  async ({ step }) => {
    const parentIds = await step.run('find-weekly-parents', async () => {
      const db = getStepDatabase();
      const nowUtc = new Date();

      // 1. Find all parents who can receive a weekly progress digest.
      // Push still requires pushEnabled + weeklyProgressPush; email is its own
      // channel and must not be gated by push permission. Missing preference
      // rows use defaults, where weeklyProgressEmail is enabled.
      // [L7-F3] selectDistinct returns one row per parent instead of one
      // per link, removing duplicate parentProfileId rows. Combined with the
      // notificationPreferences filter below, the working set stays bounded
      // to parents who have at least one linked child.
      const linkRows = await db
        .selectDistinct({ parentProfileId: familyLinks.parentProfileId })
        .from(familyLinks);

      const linkedParentIds = linkRows.map((link) => link.parentProfileId);

      if (linkedParentIds.length === 0) return [];

      const prefRows = await db.query.notificationPreferences.findMany({
        where: inArray(notificationPreferences.profileId, linkedParentIds),
        columns: {
          profileId: true,
          pushEnabled: true,
          weeklyProgressPush: true,
          weeklyProgressEmail: true,
        },
      });

      const prefsByProfileId = new Map(
        prefRows.map((pref) => [pref.profileId, pref]),
      );
      const eligibleProfileIds = linkedParentIds.filter((profileId) => {
        const prefs = prefsByProfileId.get(profileId);
        if (!prefs) return true;
        return (
          (prefs.pushEnabled && prefs.weeklyProgressPush) ||
          prefs.weeklyProgressEmail
        );
      });

      if (eligibleProfileIds.length === 0) return [];

      // 2. Fetch each parent profile's account timezone in one query.
      //    profiles.accountId → accounts.timezone
      const profileTimezones = await db
        .select({ profileId: profiles.id, timezone: accounts.timezone })
        .from(profiles)
        .innerJoin(accounts, eq(profiles.accountId, accounts.id))
        .where(
          and(
            inArray(profiles.id, eligibleProfileIds),
            isNull(profiles.archivedAt),
          ),
        );

      const timezoneByProfileId = new Map(
        profileTimezones.map((r) => [r.profileId, r.timezone]),
      );

      // 3. Keep only parents whose local time is 09:00 right now. [FR239.1 UX-9]
      return profileTimezones
        .map((row) => row.profileId)
        .filter((id) =>
          isLocalHour9(timezoneByProfileId.get(id) ?? null, nowUtc),
        );
    });

    // [CR-2026-05-21-189] nowUtc/currentWeekStart computed INSIDE a dedicated
    // step.run so the value is memoized as part of the step's cached result.
    // Computing them at function entry caused the closure to recompute
    // new Date() to a later value on Inngest replay while the upstream step
    // result (find-weekly-self-report-profiles) reflected the original window.
    // Pattern mirrors session-stale-cleanup.ts and summary-reconciliation-cron.ts
    // (BUG-189 / CR-029 / CR-031). Date objects don't survive Inngest step
    // result serialization cleanly — timestamps are returned as ms numbers and
    // Dates are reconstructed from them after the step.
    const weekWindow = await step.run('resolve-week-window', async () => {
      const nowUtcMs = Date.now();
      const currentWeekStartMs = startOfCurrentWeek(
        new Date(nowUtcMs),
      ).getTime();
      return { nowUtcMs, currentWeekStartMs };
    });
    const nowUtc = new Date(weekWindow.nowUtcMs);
    const currentWeekStart = new Date(weekWindow.currentWeekStartMs);
    const selfReportProfileIds = await step.run(
      'find-weekly-self-report-profiles',
      async () => {
        const db = getStepDatabase();
        return listEligibleSelfReportProfileIdsAtLocalHour9(
          db,
          {
            start: subtractDays(currentWeekStart, 7),
            endExclusive: currentWeekStart,
          },
          nowUtc,
        );
      },
    );
    const selfReportProfileIdSet = new Set(selfReportProfileIds);
    const targetProfileIds = Array.from(
      new Set([...parentIds, ...selfReportProfileIds]),
    );
    const reportWeekStart = isoDate(currentWeekStart);

    if (targetProfileIds.length === 0) {
      return {
        status: 'completed',
        queuedParents: 0,
        totalParents: 0,
        queuedSelfReports: 0,
        totalSelfReports: 0,
        queuedBatches: 0,
        failedBatches: 0,
      };
    }

    // [BUG-850 / F-SVC-021] Per-batch try/catch + Sentry escalation. Without
    // this, a single failing batch sendEvent (transient Inngest 5xx, network
    // blip) would either propagate and abort all subsequent batches OR —
    // worse — silently leave the parent function returning `completed` while
    // half the parents never got their weekly recap event. Each batch is now
    // independently survivable.
    //
    // [BUG-850 / F-SVC-021] Per-batch try/catch + Sentry escalation. Without
    // this, a single failing batch sendEvent (transient Inngest 5xx, network
    // blip) would either propagate and abort all subsequent batches OR —
    // worse — silently leave the parent function returning `completed` while
    // half the parents never got their weekly recap event. Each batch is now
    // independently survivable.
    //
    // [BUG-757] When a batch sendEvent fails the parent IDs in that batch are
    // collected into `failedParentIds` and re-enqueued 5 minutes later via a
    // delayed `step.sendEvent` (`ts: Date.now() + 5*60*1000`). Each retry event
    // carries a `retryAttempt` field so the per-parent generate handler can
    // enforce its own bound; the same idempotency key on the generate function
    // (`parentId + reportWeekStart`) dedupes any accidental success+retry
    // overlap within the 24h Inngest window, so a retry never produces a
    // duplicate push. Sentry still receives the original batch failure with the
    // full failed-parent list so on-call can detect partial fan-out.
    const BATCH_SIZE = 200;
    const MAX_GENERATE_RETRY_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 5 * 60 * 1000;
    let queuedBatches = 0;
    let failedBatches = 0;
    let queuedParents = 0;
    let queuedSelfReports = 0;
    let requeuedParents = 0;
    const failedParentIds: string[] = [];
    for (let i = 0; i < targetProfileIds.length; i += BATCH_SIZE) {
      const batch = targetProfileIds.slice(i, i + BATCH_SIZE);
      try {
        await step.sendEvent(
          `fan-out-weekly-progress-${i}`,
          batch.map((parentId) => ({
            name: 'app/weekly-progress-push.generate' as const,
            data: {
              parentId,
              reportWeekStart,
              ...(selfReportProfileIdSet.has(parentId)
                ? { includeSelfReport: true }
                : {}),
            },
          })),
        );
        queuedBatches += 1;
        queuedParents += batch.filter((profileId) =>
          parentIds.includes(profileId),
        ).length;
        queuedSelfReports += batch.filter((profileId) =>
          selfReportProfileIdSet.has(profileId),
        ).length;
      } catch (err) {
        failedBatches += 1;
        captureException(err, {
          extra: {
            context: 'weekly-progress-push-cron-fan-out',
            batchIndex: i,
            batchSize: batch.length,
            totalParents: parentIds.length,
            totalSelfReports: selfReportProfileIds.length,
            failedParentIds: batch,
          },
        });
        failedParentIds.push(...batch);
      }
    }

    // [BUG-757] Durable retry: re-enqueue failed-batch parents 5 minutes later
    // with retryAttempt=1. Per-parent generate handler enforces the cap.
    if (failedParentIds.length > 0) {
      try {
        await step.sendEvent(
          `requeue-failed-batches`,
          failedParentIds.map((parentId) => ({
            name: 'app/weekly-progress-push.generate' as const,
            ts: Date.now() + RETRY_DELAY_MS,
            data: {
              parentId,
              reportWeekStart,
              retryAttempt: 1,
              ...(selfReportProfileIdSet.has(parentId)
                ? { includeSelfReport: true }
                : {}),
            },
          })),
        );
        requeuedParents = failedParentIds.length;
      } catch (requeueErr) {
        // Re-enqueue itself failed; surface terminal for ops paging.
        captureException(requeueErr, {
          extra: {
            context: 'weekly-progress-push-cron-requeue-failed',
            droppedParents: failedParentIds.length,
            failedParentIds,
          },
        });
      }
    }

    return {
      status: failedBatches === 0 ? 'completed' : 'partial',
      queuedParents,
      totalParents: parentIds.length,
      queuedSelfReports,
      totalSelfReports: selfReportProfileIds.length,
      queuedBatches,
      failedBatches,
      requeuedParents,
      maxGenerateRetryAttempts: MAX_GENERATE_RETRY_ATTEMPTS,
    };
  },
);

export const weeklyProgressPushGenerate = inngest.createFunction(
  {
    id: 'progress-weekly-parent-push-generate',
    name: 'Send one weekly parent progress summary',
    // [BUG-260] Bound parallelism on the fan-out receiver. The cron fans out
    // up to all eligible parents on Monday at their local 09:00; without a
    // concurrency cap the receivers stampede Neon and the Resend / push
    // providers simultaneously. limit=25 mirrors the cadence already used for
    // weekly-self-report fan-out and keeps DB + provider pressure bounded.
    concurrency: { limit: 25 },
    // [CR-2026-05-21-033] Dedup duplicate fan-out fires within the 24h Inngest
    // window so the LLM/snapshot math (which runs BEFORE the notificationLog
    // dedup inside prepare-weekly-progress-digest) is skipped on re-runs.
    idempotency: 'event.data.parentId + "-" + event.data.reportWeekStart',
  },
  { event: 'app/weekly-progress-push.generate' },
  async ({ event, step }) => {
    // Validate event payload at the boundary — invalid UUIDs would otherwise
    // produce opaque DB errors deep inside the step. Clean skip on malformed data.
    const parsed = weeklyProgressPushEventSchema.safeParse(event.data);
    if (!parsed.success) {
      return { status: 'skipped', reason: 'invalid_payload' };
    }
    const { parentId, includeSelfReport } = parsed.data;
    // [BUG-757] Hard cap on retry chain. The cron initiates retryAttempt=1; any
    // event arriving with retryAttempt > MAX_GENERATE_RETRY_ATTEMPTS is dropped
    // with a structured Sentry capture so a sustained Inngest issue never
    // produces an unbounded re-enqueue loop.
    const retryAttempt = parsed.data.retryAttempt ?? 0;
    if (retryAttempt > MAX_GENERATE_RETRY_ATTEMPTS) {
      captureException(
        new Error(
          'weekly-progress-push.generate: retry cap exhausted, event dropped',
        ),
        {
          extra: {
            context: 'weekly-progress-push-generate-retry-cap',
            parentId,
            retryAttempt,
            maxRetryAttempts: MAX_GENERATE_RETRY_ATTEMPTS,
          },
        },
      );
      return {
        status: 'skipped' as const,
        reason: 'retry_cap_exhausted',
        parentId,
        retryAttempt,
      };
    }
    const reportWeekStart =
      parsed.data.reportWeekStart ?? isoDate(startOfCurrentWeek(new Date()));

    try {
      const prepared: PreparedWeeklyProgressDigest = await step.run(
        'prepare-weekly-progress-digest',
        async () => {
          const db = getStepDatabase();
          const parentProfile = await db.query.profiles.findFirst({
            where: and(eq(profiles.id, parentId), isNull(profiles.archivedAt)),
            columns: { id: true },
          });
          if (!parentProfile) {
            return {
              status: 'skipped' as const,
              reason: 'parent_missing',
              parentId,
            };
          }

          const selfReportResult = includeSelfReport
            ? await persistWeeklySelfReportForProfile(
                db,
                parentId,
                reportWeekStart,
              )
            : null;

          const links = await db.query.familyLinks.findMany({
            where: eq(familyLinks.parentProfileId, parentId),
            columns: { childProfileId: true },
          });
          if (links.length === 0) {
            if (selfReportResult?.status === 'completed') {
              return {
                status: 'self_report_only' as const,
                reason: 'self_report_only',
                parentId,
              };
            }
            return {
              status: 'skipped' as const,
              reason: selfReportResult?.reason ?? 'no_children',
              parentId,
            };
          }

          // [BUG-524] Compute the Monday start date for this week's report
          const weekStartDate = new Date(`${reportWeekStart}T00:00:00.000Z`);
          const reportWeek = reportWeekStart;

          const childSummaries: string[] = [];
          const childProfileIds: string[] = [];
          const struggleLines: ChildStruggleLine[] = [];
          for (const link of links) {
            if (!(await isGdprProcessingAllowed(db, link.childProfileId))) {
              continue;
            }

            const child = await db.query.profiles.findFirst({
              where: and(
                eq(profiles.id, link.childProfileId),
                isNull(profiles.archivedAt),
              ),
              columns: { displayName: true },
            });
            if (!child) continue;

            const latest = await getLatestSnapshot(db, link.childProfileId);
            if (!latest) continue;
            const latestMetrics = await filterProgressMetricsToActiveSubjects(
              db,
              link.childProfileId,
              latest.metrics,
            );

            const previous = await getLatestSnapshotOnOrBefore(
              db,
              link.childProfileId,
              isoDate(
                subtractDays(new Date(`${latest.snapshotDate}T00:00:00Z`), 7),
              ),
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
            const cappedPrevious =
              snapshotGapMs <= MAX_SNAPSHOT_GAP_MS ? previous : null;
            const cappedPreviousMetrics = cappedPrevious
              ? await filterProgressMetricsToActiveSubjects(
                  db,
                  link.childProfileId,
                  cappedPrevious.metrics,
                )
              : null;

            const name = child?.displayName ?? 'Your learner';
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

            // [BUG-524] Persist the weekly report before building the push summary.
            // Uses onConflictDoNothing so re-runs for the same week are idempotent.
            const weekEndDate = new Date(weekStartDate);
            weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
            const previousWeekStart = subtractDays(weekStartDate, 7);
            const practiceSummary = await getPracticeActivitySummary(db, {
              profileId: link.childProfileId,
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
              reportWeek,
              latestMetrics,
              cappedPreviousMetrics,
              practiceSummary,
            );
            await db
              .insert(weeklyReports)
              .values({
                profileId: parentId,
                childProfileId: link.childProfileId,
                reportWeek,
                reportData,
              })
              .onConflictDoNothing();

            const summaryCountBeforeChild = childSummaries.length;
            if (
              latestMetrics.totalSessions === 0 ||
              (topicDelta === 0 && vocabDelta === 0 && exploredDelta === 0)
            ) {
              childSummaries.push(
                `${name} took a quieter week and still kept ${latestMetrics.topicsMastered} topics.`,
              );
            } else {
              const parts = [
                topicDelta && topicDelta > 0 ? `+${topicDelta} topics` : null,
                vocabDelta && vocabDelta > 0 ? `+${vocabDelta} words` : null,
                exploredDelta && exploredDelta > 0
                  ? `+${exploredDelta} explored`
                  : null,
              ].filter((value): value is string => !!value);

              if (parts.length > 0) {
                childSummaries.push(`${name}: ${parts.join(', ')}`);
              }
            }

            // Read current struggles for the watch-line (path A: topic names only).
            // Malformed JSONB is skipped gracefully; digest still sends.
            let hasStruggleTopics = false;
            try {
              const learningProfile = await db.query.learningProfiles.findFirst(
                {
                  where: eq(learningProfiles.profileId, link.childProfileId),
                  columns: { struggles: true },
                },
              );
              const rawStruggles = learningProfile?.struggles;
              const topics = Array.isArray(rawStruggles)
                ? (rawStruggles as Array<{ topic?: string }>)
                    .map((s) => s.topic)
                    .filter(
                      (t): t is string => typeof t === 'string' && t.length > 0,
                    )
                    .slice(0, 2)
                : [];
              hasStruggleTopics = topics.length > 0;
              struggleLines.push({ childName: name, topics });
            } catch (err) {
              captureException(err, {
                extra: {
                  childProfileId: link.childProfileId,
                  context: 'weekly-progress-push-struggles',
                },
              });
              struggleLines.push({ childName: name, topics: [] });
            }
            if (
              childSummaries.length > summaryCountBeforeChild ||
              hasStruggleTopics
            ) {
              childProfileIds.push(link.childProfileId);
            }
          }

          // Consent gate: if ALL linked children were redacted, skip entirely —
          // do not send an empty digest (push or email).
          if (childSummaries.length === 0) {
            if (selfReportResult?.status === 'completed') {
              return {
                status: 'self_report_only' as const,
                reason: 'self_report_only',
                parentId,
              };
            }
            return {
              status: 'skipped' as const,
              reason: 'no_activity',
              parentId,
            };
          }

          // [BUG-699-FOLLOWUP] 24h dedup gate, scoped to the push only — the
          // weeklyReports insert above is idempotent via onConflictDoNothing,
          // so a duplicate `app/weekly-progress-push.generate` event leaves the
          // report row intact but must NOT re-push the parent. Cron cadence
          // (weekly) makes the read-then-write race window irrelevant; promote
          // to a unique index on notificationLog if duplicates ever surface.
          const recentCount = await getRecentNotificationCount(
            db,
            parentId,
            'weekly_progress',
            24,
          );
          if (recentCount > 0) {
            return {
              status: 'throttled' as const,
              reason: 'dedup_24h',
              parentId,
            };
          }

          const prefs = await db.query.notificationPreferences.findFirst({
            where: eq(notificationPreferences.profileId, parentId),
            columns: {
              pushEnabled: true,
              weeklyProgressPush: true,
              weeklyProgressEmail: true,
            },
          });
          const shouldSendPush =
            prefs != null && prefs.pushEnabled && prefs.weeklyProgressPush;
          const shouldSendEmail = prefs?.weeklyProgressEmail ?? true;

          let parentEmail: string | null = null;
          if (shouldSendEmail) {
            const parentProfile = await db.query.profiles.findFirst({
              where: and(
                eq(profiles.id, parentId),
                isNull(profiles.archivedAt),
              ),
              columns: { accountId: true },
            });
            const parentAccount = parentProfile?.accountId
              ? await db.query.accounts.findFirst({
                  where: eq(accounts.id, parentProfile.accountId),
                  columns: { email: true },
                })
              : null;
            parentEmail = parentAccount?.email ?? null;
          }

          return {
            status: 'prepared' as const,
            parentId,
            reportWeek,
            childProfileIds,
            childSummaries,
            struggleLines,
            shouldSendPush,
            shouldSendEmail,
            parentEmail,
          };
        },
      );

      if (prepared.status !== 'prepared') {
        return prepared;
      }

      const pushResult = prepared.shouldSendPush
        ? await step.run('send-weekly-progress-push', async () => {
            const db = getStepDatabase();
            const activeParent = await db.query.profiles.findFirst({
              where: and(
                eq(profiles.id, parentId),
                isNull(profiles.archivedAt),
              ),
              columns: { id: true },
            });
            if (!activeParent) {
              return { sent: false, reason: 'profile_archived' as const };
            }
            for (const childProfileId of prepared.childProfileIds) {
              const activeChild = await db.query.profiles.findFirst({
                where: and(
                  eq(profiles.id, childProfileId),
                  isNull(profiles.archivedAt),
                ),
                columns: { id: true },
              });
              if (!activeChild) {
                return { sent: false, reason: 'profile_archived' as const };
              }
            }
            return sendPushNotification(db, {
              profileId: parentId,
              title: 'Weekly learning progress',
              body: prepared.childSummaries.join(' '),
              type: 'weekly_progress',
            });
          })
        : null;

      // Email channel: send when weekly_progress_email = true AND parent has
      // accounts.email. The Resend call is isolated in its own Inngest step;
      // if the later notification-log write fails, retries reuse this step's
      // completed result instead of calling Resend a second time.
      let emailSent = false;
      const parentEmail = prepared.parentEmail;
      if (prepared.shouldSendEmail && parentEmail) {
        const emailResult = await step.run(
          'send-weekly-progress-email',
          async () => {
            const db = getStepDatabase();
            const activeParent = await db.query.profiles.findFirst({
              where: and(
                eq(profiles.id, parentId),
                isNull(profiles.archivedAt),
              ),
              columns: { id: true },
            });
            if (!activeParent) {
              return { sent: false, reason: 'profile_archived' as const };
            }
            for (const childProfileId of prepared.childProfileIds) {
              const activeChild = await db.query.profiles.findFirst({
                where: and(
                  eq(profiles.id, childProfileId),
                  isNull(profiles.archivedAt),
                ),
                columns: { id: true },
              });
              if (!activeChild) {
                return { sent: false, reason: 'profile_archived' as const };
              }
            }
            const emailPayload = formatWeeklyProgressEmail(
              parentEmail,
              prepared.childSummaries,
              prepared.struggleLines,
            );
            return sendEmail(emailPayload, {
              resendApiKey: getStepResendApiKey(),
              idempotencyKey: buildLegacyEmailIdempotencyKey(
                'weekly',
                parentId,
                prepared.reportWeek,
              ),
            });
          },
        );
        emailSent = emailResult.sent;
        if (emailSent) {
          await step.run('log-weekly-progress-email', async () => {
            const db = getStepDatabase();
            await logNotification(
              db,
              parentId,
              'weekly_progress',
              `email-${prepared.reportWeek}`,
            );
          });
        }
      } else if (prepared.shouldSendEmail) {
        // Expected: OAuth-only accounts or Clerk not exposing email field.
        // emailSent flag in the return value already provides observability.
      }

      return {
        status: pushResult?.sent || emailSent ? 'completed' : 'throttled',
        parentId,
      };
    } catch (error) {
      captureException(error, {
        extra: { parentId, context: 'weekly-progress-push-generate' },
      });
      // [SWEEP-SILENT-RECOVERY / J-11] Returning { status: 'failed' } here
      // resolves the step as a success — Inngest only retries on thrown
      // errors. Without re-throw, transient DB/push errors are absorbed,
      // the user never gets their weekly recap, and the dashboard counts
      // it as completed. Re-throw lets Inngest retry and surface a real
      // failure on terminal exhaustion. See daily-snapshot.ts:78-80.
      throw error;
    }
  },
);
