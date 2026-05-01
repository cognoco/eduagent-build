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
import { getRecentNotificationCount } from '../../services/settings';

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

      // [BUG-699-FOLLOWUP] 24h notification-log dedup. Inngest's idempotency
      // key (event.id) covers exact-duplicate events within 24h, but an
      // operator replay or a re-fire with a *new* event.id would bypass that
      // guard and push the same recipient again. The notification-log check
      // is belt-and-suspenders, consistent with all other cron-driven push
      // paths in this codebase.
      const recentCount = await getRecentNotificationCount(
        db,
        profileId,
        'daily_reminder',
        24
      );
      if (recentCount > 0) {
        return { status: 'skipped' as const, reason: 'dedup_24h', profileId };
      }

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
