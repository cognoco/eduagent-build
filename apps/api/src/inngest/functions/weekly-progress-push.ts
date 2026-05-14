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

import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  accounts,
  consentStates,
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
  getLatestSnapshot,
  getLatestSnapshotOnOrBefore,
} from '../../services/snapshot-aggregation';
import { generateWeeklyReportData } from '../../services/weekly-report';
import { getPracticeActivitySummary } from '../../services/practice-activity-summary';
import { captureException } from '../../services/sentry';
import { buildLegacyEmailIdempotencyKey } from '../../services/dedupe-key';

import {
  isoDate,
  subtractDays,
  sumTopicsExplored,
} from '../../services/progress-helpers';

const weeklyProgressPushEventSchema = z.object({
  parentId: z.string().uuid(),
});

type PreparedWeeklyProgressDigest =
  | {
      status: 'prepared';
      parentId: string;
      reportWeek: string;
      childSummaries: string[];
      struggleLines: ChildStruggleLine[];
      shouldSendPush: boolean;
      shouldSendEmail: boolean;
      parentEmail: string | null;
    }
  | {
      status: 'skipped' | 'throttled';
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
      const links = await db.query.familyLinks.findMany({
        columns: { parentProfileId: true },
      });

      const linkedParentIds = Array.from(
        new Set(links.map((link) => link.parentProfileId)),
      );

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
        .where(inArray(profiles.id, eligibleProfileIds));

      const timezoneByProfileId = new Map(
        profileTimezones.map((r) => [r.profileId, r.timezone]),
      );

      // 3. Keep only parents whose local time is 09:00 right now. [FR239.1 UX-9]
      return eligibleProfileIds.filter((id) =>
        isLocalHour9(timezoneByProfileId.get(id) ?? null, nowUtc),
      );
    });

    if (parentIds.length === 0) {
      return { status: 'completed', queuedParents: 0 };
    }

    // [BUG-850 / F-SVC-021] Per-batch try/catch + Sentry escalation. Without
    // this, a single failing batch sendEvent (transient Inngest 5xx, network
    // blip) would either propagate and abort all subsequent batches OR —
    // worse — silently leave the parent function returning `completed` while
    // half the parents never got their weekly recap event. Each batch is now
    // independently survivable: failures are captured to Sentry with batch
    // metadata and counted in the final return so on-call and dashboards can
    // detect partial fan-out.
    const BATCH_SIZE = 200;
    let queuedBatches = 0;
    let failedBatches = 0;
    let queuedParents = 0;
    for (let i = 0; i < parentIds.length; i += BATCH_SIZE) {
      const batch = parentIds.slice(i, i + BATCH_SIZE);
      try {
        await step.sendEvent(
          `fan-out-weekly-progress-${i}`,
          batch.map((parentId) => ({
            name: 'app/weekly-progress-push.generate' as const,
            data: { parentId },
          })),
        );
        queuedBatches += 1;
        queuedParents += batch.length;
      } catch (err) {
        failedBatches += 1;
        captureException(err, {
          extra: {
            context: 'weekly-progress-push-cron-fan-out',
            batchIndex: i,
            batchSize: batch.length,
            totalParents: parentIds.length,
          },
        });
      }
    }

    return {
      status: failedBatches === 0 ? 'completed' : 'partial',
      queuedParents,
      totalParents: parentIds.length,
      queuedBatches,
      failedBatches,
    };
  },
);

export const weeklyProgressPushGenerate = inngest.createFunction(
  {
    id: 'progress-weekly-parent-push-generate',
    name: 'Send one weekly parent progress summary',
  },
  { event: 'app/weekly-progress-push.generate' },
  async ({ event, step }) => {
    // Validate event payload at the boundary — invalid UUIDs would otherwise
    // produce opaque DB errors deep inside the step. Clean skip on malformed data.
    const parsed = weeklyProgressPushEventSchema.safeParse(event.data);
    if (!parsed.success) {
      return { status: 'skipped', reason: 'invalid_payload' };
    }
    const { parentId } = parsed.data;

    try {
      const prepared: PreparedWeeklyProgressDigest = await step.run(
        'prepare-weekly-progress-digest',
        async () => {
          const db = getStepDatabase();

          const links = await db.query.familyLinks.findMany({
            where: eq(familyLinks.parentProfileId, parentId),
            columns: { childProfileId: true },
          });
          if (links.length === 0) {
            return {
              status: 'skipped' as const,
              reason: 'no_children',
              parentId,
            };
          }

          // [BUG-524] Compute the Monday start date for this week's report
          const now = new Date();
          const day = now.getUTCDay();
          const mondayOffset = day === 0 ? -6 : 1 - day;
          const weekStartDate = new Date(now);
          weekStartDate.setUTCDate(weekStartDate.getUTCDate() + mondayOffset);
          weekStartDate.setUTCHours(0, 0, 0, 0);
          const reportWeek = isoDate(weekStartDate);

          const childSummaries: string[] = [];
          const struggleLines: ChildStruggleLine[] = [];
          for (const link of links) {
            // Consent gate (parity with sendStruggleNotification and ParentDashboardSummary):
            // skip children whose most-recent GDPR consent state is anything other than
            // CONSENTED. Missing row = no restriction (pre-consent-flow accounts).
            const consentState = await db.query.consentStates.findFirst({
              where: and(
                eq(consentStates.profileId, link.childProfileId),
                eq(consentStates.consentType, 'GDPR'),
              ),
              orderBy: desc(consentStates.requestedAt),
            });
            if (consentState != null && consentState.status !== 'CONSENTED') {
              continue;
            }

            const latest = await getLatestSnapshot(db, link.childProfileId);
            if (!latest) continue;

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

            const child = await db.query.profiles.findFirst({
              where: eq(profiles.id, link.childProfileId),
              columns: { displayName: true },
            });

            const name = child?.displayName ?? 'Your learner';
            const topicDelta = cappedPrevious
              ? Math.max(
                  0,
                  latest.metrics.topicsMastered -
                    cappedPrevious.metrics.topicsMastered,
                )
              : null;
            const vocabDelta = cappedPrevious
              ? Math.max(
                  0,
                  latest.metrics.vocabularyTotal -
                    cappedPrevious.metrics.vocabularyTotal,
                )
              : null;
            const exploredDelta = cappedPrevious
              ? Math.max(
                  0,
                  sumTopicsExplored(latest.metrics) -
                    sumTopicsExplored(cappedPrevious.metrics),
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
              latest.metrics,
              cappedPrevious?.metrics ?? null,
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

            if (
              latest.metrics.totalSessions === 0 ||
              (topicDelta === 0 && vocabDelta === 0 && exploredDelta === 0)
            ) {
              childSummaries.push(
                `${name} took a quieter week and still kept ${latest.metrics.topicsMastered} topics.`,
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
          }

          // Consent gate: if ALL linked children were redacted, skip entirely —
          // do not send an empty digest (push or email).
          if (childSummaries.length === 0) {
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
              where: eq(profiles.id, parentId),
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
      if (prepared.shouldSendEmail && prepared.parentEmail) {
        const emailResult = await step.run(
          'send-weekly-progress-email',
          async () => {
            const emailPayload = formatWeeklyProgressEmail(
              prepared.parentEmail!,
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
