import { and, eq, inArray } from 'drizzle-orm';
import {
  accounts,
  familyLinks,
  notificationPreferences,
  profiles,
} from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { sendPushNotification } from '../../services/notifications';
import {
  getLatestSnapshot,
  getLatestSnapshotOnOrBefore,
} from '../../services/snapshot-aggregation';
import { captureException } from '../../services/sentry';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function sumTopicsExplored(metrics: {
  subjects: Array<{ topicsExplored?: number }>;
}): number {
  return metrics.subjects.reduce(
    (sum, subject) => sum + (subject.topicsExplored ?? 0),
    0
  );
}

// [FR239.1 UX-9] Returns true when 09:00 local time matches the UTC hour of nowUtc.
// Parents with no timezone (or an invalid one) fall back to UTC, so they are
// processed in the 09:00 UTC run.
function isLocalHour9(timezone: string | null, nowUtc: Date): boolean {
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

      // 1. Find all parents who have weekly progress push enabled.
      const prefs = await db.query.notificationPreferences.findMany({
        where: and(
          eq(notificationPreferences.pushEnabled, true),
          eq(notificationPreferences.weeklyProgressPush, true)
        ),
        columns: { profileId: true },
      });

      if (prefs.length === 0) return [];

      const eligibleProfileIds = prefs.map((p) => p.profileId);

      // 2. Fetch each parent profile's account timezone in one query.
      //    profiles.accountId → accounts.timezone
      const profileTimezones = await db
        .select({ profileId: profiles.id, timezone: accounts.timezone })
        .from(profiles)
        .innerJoin(accounts, eq(profiles.accountId, accounts.id))
        .where(inArray(profiles.id, eligibleProfileIds));

      const timezoneByProfileId = new Map(
        profileTimezones.map((r) => [r.profileId, r.timezone])
      );

      // 3. Keep only parents whose local time is 09:00 right now. [FR239.1 UX-9]
      return eligibleProfileIds.filter((id) =>
        isLocalHour9(timezoneByProfileId.get(id) ?? null, nowUtc)
      );
    });

    if (parentIds.length === 0) {
      return { status: 'completed', queuedParents: 0 };
    }

    const BATCH_SIZE = 200;
    for (let i = 0; i < parentIds.length; i += BATCH_SIZE) {
      const batch = parentIds.slice(i, i + BATCH_SIZE);
      await step.sendEvent(
        `fan-out-weekly-progress-${i}`,
        batch.map((parentId) => ({
          name: 'app/weekly-progress-push.generate' as const,
          data: { parentId },
        }))
      );
    }

    return { status: 'completed', queuedParents: parentIds.length };
  }
);

export const weeklyProgressPushGenerate = inngest.createFunction(
  {
    id: 'progress-weekly-parent-push-generate',
    name: 'Send one weekly parent progress summary',
  },
  { event: 'app/weekly-progress-push.generate' },
  async ({ event, step }) => {
    const { parentId } = event.data as { parentId: string };

    return step.run('send-weekly-push', async () => {
      try {
        const db = getStepDatabase();

        const links = await db.query.familyLinks.findMany({
          where: eq(familyLinks.parentProfileId, parentId),
          columns: { childProfileId: true },
        });
        if (links.length === 0) {
          return { status: 'skipped', reason: 'no_children', parentId };
        }

        const childSummaries: string[] = [];
        for (const link of links) {
          const latest = await getLatestSnapshot(db, link.childProfileId);
          if (!latest) continue;

          const previous = await getLatestSnapshotOnOrBefore(
            db,
            link.childProfileId,
            isoDate(
              subtractDays(new Date(`${latest.snapshotDate}T00:00:00Z`), 7)
            )
          );

          const child = await db.query.profiles.findFirst({
            where: eq(profiles.id, link.childProfileId),
            columns: { displayName: true },
          });

          const name = child?.displayName ?? 'Your learner';
          const topicDelta = previous
            ? Math.max(
                0,
                latest.metrics.topicsMastered - previous.metrics.topicsMastered
              )
            : null;
          const vocabDelta = previous
            ? Math.max(
                0,
                latest.metrics.vocabularyTotal -
                  previous.metrics.vocabularyTotal
              )
            : null;
          const exploredDelta = previous
            ? Math.max(
                0,
                sumTopicsExplored(latest.metrics) -
                  sumTopicsExplored(previous.metrics)
              )
            : null;

          if (
            latest.metrics.totalSessions === 0 ||
            (topicDelta === 0 && vocabDelta === 0 && exploredDelta === 0)
          ) {
            childSummaries.push(
              `${name} took a quieter week and still kept ${latest.metrics.topicsMastered} topics.`
            );
            continue;
          }

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

        if (childSummaries.length === 0) {
          return { status: 'skipped', reason: 'no_activity', parentId };
        }

        const result = await sendPushNotification(db, {
          profileId: parentId,
          title: 'Weekly learning progress',
          body: childSummaries.join(' '),
          type: 'weekly_progress',
        });

        return {
          status: result.sent ? 'completed' : 'throttled',
          parentId,
        };
      } catch (error) {
        captureException(error, {
          extra: { parentId, context: 'weekly-progress-push-generate' },
        });
        return { status: 'failed', parentId };
      }
    });
  }
);
