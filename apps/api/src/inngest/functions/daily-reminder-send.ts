// ---------------------------------------------------------------------------
// Daily Reminder Send — Handles a single app/daily-reminder.send event,
// formats a streak-based message, and sends a push notification.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  formatDailyReminderBody,
  sendPushNotification,
} from '../../services/notifications';

export const dailyReminderSend = inngest.createFunction(
  {
    id: 'daily-reminder-send',
    name: 'Daily Reminder Send',
    // [FIX-INNGEST-4] Inngest replay / operator re-fire must not push twice.
    // event.id is unique per sendEvent call; dedupes within 24h.
    idempotency: 'event.id',
  },
  { event: 'app/daily-reminder.send' },
  async ({ event, step }) => {
    const { profileId, streakDays } = event.data;

    const result = await step.run('send-daily-reminder', async () => {
      const db = getStepDatabase();

      const body = formatDailyReminderBody(streakDays);

      const sendResult = await sendPushNotification(db, {
        profileId,
        title: 'Keep your streak!',
        body,
        type: 'daily_reminder',
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
