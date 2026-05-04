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
import { getRecentNotificationCount } from '../../services/settings';
import { captureException } from '../../services/sentry';

export const reviewDueSend = inngest.createFunction(
  {
    id: 'review-due-send',
    name: 'Review Due Send',
    // [FIX-INNGEST-4] Inngest replay / operator re-fire must not push twice.
    // event.id is unique per sendEvent call; dedupes within 24h.
    idempotency: 'event.id',
  },
  { event: 'app/retention.review-due' },
  async ({ event, step }) => {
    const { profileId, overdueCount, topTopicIds } = event.data;

    const result = await step.run('send-review-reminder', async () => {
      const db = getStepDatabase();

      // [BUG-699-FOLLOWUP] 24h notification-log dedup. Same pattern as the
      // other cron-driven push paths: idempotency covers same-event.id
      // replays; this covers new events for the same recipient within 24h.
      // [BUG-976 / CCR-PR129-M-3] Fail closed on DB error: skip this cycle
      // rather than throwing uncaught (which would cause Inngest to retry
      // indefinitely and block the notification pipeline). captureException
      // makes the failure queryable in Sentry so we can measure transient
      // DB hiccup frequency. Mirrors the recall-nudge-send pattern.
      let recentCount: number;
      try {
        recentCount = await getRecentNotificationCount(
          db,
          profileId,
          'review_reminder',
          24
        );
      } catch (err) {
        captureException(err, {
          profileId,
          extra: { context: 'review-due-send:getRecentNotificationCount' },
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

    // CLAUDE.md "Silent recovery without escalation is banned": the
    // dedup_check_failed path swallows a DB error and returns skipped, so
    // Sentry is the only signal that the recovery fired. Emit a structured
    // app/notification.suppressed event so the volume is queryable in 24h
    // dashboards. step.sendEvent makes the dispatch durable and idempotent
    // under Inngest retries.
    if (result.status === 'skipped' && result.reason === 'dedup_check_failed') {
      await step.sendEvent('notify-notification-suppressed', {
        name: 'app/notification.suppressed',
        data: {
          profileId,
          notificationType: 'review_reminder',
          reason: result.reason,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return result;
  }
);
