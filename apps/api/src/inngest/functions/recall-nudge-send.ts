import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { eq, inArray } from 'drizzle-orm';
import { curriculumTopics, familyLinks, profiles } from '@eduagent/database';
import { resolveProfileRole } from '../../services/profile';
import {
  formatRecallNudge,
  sendPushNotification,
} from '../../services/notifications';

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
