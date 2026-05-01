import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { eq, inArray } from 'drizzle-orm';
import { curriculumTopics, familyLinks, profiles } from '@eduagent/database';
import { resolveProfileRole } from '../../services/profile';
import {
  formatRecallNudge,
  sendPushNotification,
} from '../../services/notifications';
import { getRecentNotificationCount } from '../../services/settings';
import { captureException } from '../../services/sentry';

export const recallNudgeSend = inngest.createFunction(
  {
    id: 'recall-nudge-send',
    name: 'Recall Nudge Send',
    // [FIX-INNGEST-4] Inngest replay / operator re-fire must not push twice.
    // event.id is unique per sendEvent call; dedupes within 24h.
    idempotency: 'event.id',
  },
  { event: 'app/recall-nudge.send' },
  async ({ event, step }) => {
    const { profileId, fadingCount, topTopicIds } = event.data;

    const result = await step.run('send-nudge', async () => {
      const db = getStepDatabase();

      // [BUG-699-FOLLOWUP] 24h notification-log dedup. Same pattern as the
      // other cron-driven push paths: idempotency covers same-event.id
      // replays; this covers new events for the same recipient within 24h.
      // Fail closed on DB error: skip this nudge cycle rather than risk
      // exceeding the rate-limit ceiling (spam). The next scheduled fire
      // will re-evaluate. captureException makes the failure queryable in
      // Sentry so we can measure transient DB hiccup frequency.
      let recentCount: number;
      try {
        recentCount = await getRecentNotificationCount(
          db,
          profileId,
          'recall_nudge',
          24
        );
      } catch (err) {
        captureException(err, {
          profileId,
          extra: { context: 'recall-nudge-send:getRecentNotificationCount' },
        });
        return {
          status: 'skipped' as const,
          reason: 'dedup_check_failed',
          profileId,
        };
      }
      if (recentCount > 0) {
        return { status: 'skipped' as const, reason: 'dedup_24h', profileId };
      }

      // Look up topic titles
      const topics =
        topTopicIds.length > 0
          ? await db.query.curriculumTopics.findMany({
              where: inArray(curriculumTopics.id, topTopicIds),
            })
          : [];

      const topTopicTitle = topics[0]?.title ?? 'your fading topic';

      // Resolve role
      const role = await resolveProfileRole(db, profileId);

      // For guardians, look up child name
      let childName: string | undefined;
      if (role === 'guardian') {
        const childLink = await db.query.familyLinks.findFirst({
          where: eq(familyLinks.parentProfileId, profileId),
        });
        if (childLink) {
          const childProfile = await db.query.profiles.findFirst({
            where: eq(profiles.id, childLink.childProfileId),
          });
          childName = childProfile?.displayName ?? undefined;
        }
      }

      // Format notification message
      const { title, body } = formatRecallNudge(
        fadingCount,
        topTopicTitle,
        role,
        childName
      );

      // Send push notification
      const sendResult = await sendPushNotification(db, {
        profileId,
        title,
        body,
        type: 'recall_nudge',
      });

      if (sendResult.sent) {
        return {
          status: 'sent' as const,
          profileId,
          ticketId: sendResult.ticketId,
        };
      }

      return {
        status: 'skipped' as const,
        reason: sendResult.reason ?? 'daily_cap_reached',
        profileId,
      };
    });

    return result;
  }
);
