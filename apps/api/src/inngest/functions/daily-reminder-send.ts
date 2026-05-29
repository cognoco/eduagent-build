// @inngest-admin: event-profile (profileId comes from the send event; handler only revalidates active profile state before pushing)
// ---------------------------------------------------------------------------
// Daily Reminder Send — Handles a single app/daily-reminder.send event,
// formats a streak-based message, and sends a push notification.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { profiles } from '@eduagent/database';
import { and, eq, isNull } from 'drizzle-orm';
import {
  formatDailyReminderBody,
  sendPushNotification,
} from '../../services/notifications';
import { getRecentNotificationCount } from '../../services/settings';
import { captureException } from '../../services/sentry';

export const dailyReminderSend = inngest.createFunction(
  {
    id: 'daily-reminder-send',
    name: 'Daily Reminder Send',
    // [FIX-INNGEST-4] Inngest replay / operator re-fire must not push twice.
    // event.id is unique per sendEvent call; dedupes within 24h.
    idempotency: 'event.id',
    // [BUG-253] Bound parallelism on the fan-out receiver. The cron upstream
    // can fan out hundreds-to-thousands of daily-reminder events in a single
    // burst; each handler hits Neon for the notification-log dedup read and
    // again for the push-notification send. limit=50 caps Neon connection
    // pressure and matches the transcript-purge / daily-snapshot-refresh
    // pattern.
    concurrency: { limit: 50 },
  },
  { event: 'app/daily-reminder.send' },
  async ({ event, step }) => {
    const { profileId, streakDays } = event.data;

    const result = await step.run('send-daily-reminder', async () => {
      const db = getStepDatabase();

      const activeProfile = await db.query.profiles.findFirst({
        where: and(eq(profiles.id, profileId), isNull(profiles.archivedAt)),
        columns: { id: true },
      });
      if (!activeProfile) {
        return {
          status: 'skipped' as const,
          reason: 'profile_archived',
          profileId,
        };
      }

      // [BUG-699-FOLLOWUP] 24h notification-log dedup. Inngest's idempotency
      // key (event.id) covers exact-duplicate events within 24h, but an
      // operator replay or a re-fire with a *new* event.id would bypass that
      // guard and push the same recipient again. The notification-log check
      // is belt-and-suspenders, consistent with all other cron-driven push
      // paths in this codebase.
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
          'daily_reminder',
          24,
        );
      } catch (err) {
        captureException(err, {
          profileId,
          extra: { context: 'daily-reminder-send:getRecentNotificationCount' },
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

    // CLAUDE.md "Silent recovery without escalation is banned": the
    // dedup_check_failed path swallows a DB error and returns skipped.
    // captureException above feeds Sentry exception counts; this
    // app/notification.suppressed event is consumed by
    // notification-suppressed-observe which emits a structured
    // [notification-suppressed] log line, making the volume queryable via
    // Cloudflare Workers Logpush in addition to Sentry.
    if (result.status === 'skipped' && result.reason === 'dedup_check_failed') {
      await step.sendEvent('notify-notification-suppressed', {
        name: 'app/notification.suppressed',
        data: {
          profileId,
          notificationType: 'daily_reminder',
          reason: result.reason,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return result;
  },
);
