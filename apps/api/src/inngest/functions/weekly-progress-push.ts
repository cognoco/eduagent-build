import { and, eq } from 'drizzle-orm';
import {
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

export const weeklyProgressPush = inngest.createFunction(
  {
    id: 'progress-weekly-parent-push',
    name: 'Send weekly parent progress summary',
  },
  { cron: '0 9 * * 1' },
  async ({ step }) => {
    return step.run('send-weekly-pushes', async () => {
      const db = getStepDatabase();
      const parents = await db.query.notificationPreferences.findMany({
        where: and(
          eq(notificationPreferences.pushEnabled, true),
          eq(notificationPreferences.weeklyProgressPush, true)
        ),
        columns: { profileId: true },
      });

      let sent = 0;

      for (const parent of parents) {
        try {
          const links = await db.query.familyLinks.findMany({
            where: eq(familyLinks.parentProfileId, parent.profileId),
            columns: { childProfileId: true },
          });
          if (links.length === 0) continue;

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
                  latest.metrics.topicsMastered -
                    previous.metrics.topicsMastered
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

          if (childSummaries.length === 0) continue;

          const result = await sendPushNotification(db, {
            profileId: parent.profileId,
            title: 'Weekly learning progress',
            body: childSummaries.slice(0, 2).join(' '),
            type: 'weekly_progress',
          });

          if (result.sent) {
            sent += 1;
          }
        } catch (error) {
          captureException(error, { profileId: parent.profileId });
        }
      }

      return { status: 'completed', sent };
    });
  }
);
