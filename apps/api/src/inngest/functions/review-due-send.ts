// ---------------------------------------------------------------------------
// Review Due Send — Handles a single app/retention.review-due event,
// resolves subject names from the topic chain, and sends a push notification.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { eq, inArray } from 'drizzle-orm';
import { curriculumTopics, curricula, subjects } from '@eduagent/database';
import {
  formatReviewReminderBody,
  sendPushNotification,
} from '../../services/notifications';

export const reviewDueSend = inngest.createFunction(
  { id: 'review-due-send', name: 'Review Due Send' },
  { event: 'app/retention.review-due' },
  async ({ event, step }) => {
    const { profileId, overdueCount, topTopicIds } = event.data;

    const result = await step.run('send-review-reminder', async () => {
      const db = getStepDatabase();

      // Resolve topic → curriculum → subject names for the push body
      let subjectNames: string[] = [];
      if (topTopicIds.length > 0) {
        const topicRows = await db
          .select({
            subjectName: subjects.name,
          })
          .from(curriculumTopics)
          .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
          .innerJoin(subjects, eq(subjects.id, curricula.subjectId))
          .where(inArray(curriculumTopics.id, topTopicIds));

        // Deduplicate subject names (multiple topics may share a subject)
        subjectNames = [...new Set(topicRows.map((r) => r.subjectName))];
      }

      if (subjectNames.length === 0) {
        subjectNames = ['your subjects'];
      }

      const body = formatReviewReminderBody(overdueCount, subjectNames);

      const sendResult = await sendPushNotification(db, {
        profileId,
        title: 'Topics fading',
        body,
        type: 'review_reminder',
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
