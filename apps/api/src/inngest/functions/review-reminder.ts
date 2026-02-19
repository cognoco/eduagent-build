import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  sendPushNotification,
  formatReviewReminderBody,
  MAX_DAILY_PUSH,
} from '../../services/notifications';
import {
  getNotificationPrefs,
  getDailyNotificationCount,
} from '../../services/settings';

// ---------------------------------------------------------------------------
// Event-triggered review reminder — sends a single push for a specific profile
// Triggered by: app/retention.review-due
// ---------------------------------------------------------------------------

export const reviewReminder = inngest.createFunction(
  { id: 'review-reminder', name: 'Send review reminder when topics are due' },
  { event: 'app/retention.review-due' },
  async ({ event, step }) => {
    const { profileId, topicIds, subjectNames } = event.data;

    const sent = await step.run('send-review-notification', async () => {
      const db = getStepDatabase();

      // Check preferences
      const prefs = await getNotificationPrefs(db, profileId);
      if (!prefs.pushEnabled || !prefs.reviewReminders) {
        return { sent: false, reason: 'notifications_disabled' };
      }

      // Check daily cap
      const dailyCount = await getDailyNotificationCount(db, profileId);
      if (dailyCount >= MAX_DAILY_PUSH) {
        return { sent: false, reason: 'daily_cap_exceeded' };
      }

      // Format coaching-voice message
      const subjects = Array.isArray(subjectNames) ? subjectNames : [];
      const topicCount = Array.isArray(topicIds) ? topicIds.length : 0;
      const body = formatReviewReminderBody(
        topicCount,
        subjects.length > 0 ? subjects : ['your']
      );

      const result = await sendPushNotification(db, {
        profileId,
        title: 'Time to review',
        body,
        type: 'review_reminder',
      });

      return result;
    });

    return {
      status: sent.sent ? 'sent' : 'skipped',
      profileId,
      topicCount: Array.isArray(topicIds) ? topicIds.length : 0,
      reason: sent.sent ? undefined : sent.reason,
    };
  }
);
