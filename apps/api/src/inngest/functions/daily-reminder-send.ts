// @inngest-admin: event-profile (profileId comes from the send event; handler only revalidates active profile state before pushing)
// ---------------------------------------------------------------------------
// Daily Reminder Send — Handles a single app/daily-reminder.send event,
// formats a streak-based message, and sends a push notification.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { INNGEST_PLAN_CONCURRENCY_CAP } from '../plan-limits';
import { getStepDatabase, isIdentityV2EnabledInStep } from '../helpers';
import { profiles } from '@eduagent/database';
import { and, eq, isNull } from 'drizzle-orm';
import { isPersonLive } from '../../services/identity-v2/helpers';
import {
  formatDailyReminderBody,
  sendPushNotification,
} from '../../services/notifications';
import { checkAndLogRateLimitInternal } from '../../services/settings';
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
    // again for the push-notification send. Intended 50 to cap Neon connection
    // pressure; capped to the Inngest plan limit (a lower cap only tightens Neon
    // pressure further). Raise after a plan upgrade — see INNGEST_PLAN_CONCURRENCY_CAP.
    concurrency: { limit: INNGEST_PLAN_CONCURRENCY_CAP },
  },
  { event: 'app/daily-reminder.send' },
  async ({ event, step }) => {
    const { profileId, streakDays } = event.data;

    const result = await step.run('send-daily-reminder', async () => {
      const db = getStepDatabase();

      // [CUT-B2] Liveness check dispatches to person.archived_at (v2) or
      // profiles.archived_at (legacy).
      const live = isIdentityV2EnabledInStep()
        ? await isPersonLive(db, profileId)
        : !!(await db.query.profiles.findFirst({
            where: and(eq(profiles.id, profileId), isNull(profiles.archivedAt)),
            columns: { id: true },
          }));
      if (!live) {
        return {
          status: 'skipped' as const,
          reason: 'profile_archived',
          profileId,
        };
      }

      // [BUG-699-FOLLOWUP / BUG-838] Atomic dedup. Inngest's idempotency
      // key (event.id) covers exact-duplicate events within 24h, but an
      // operator replay or a re-fire with a *new* event.id would bypass it
      // and push the same recipient again — and the prior implementation
      // (getRecentNotificationCount → conditional send) was a read-then-write
      // pair: two concurrent step.run invocations (operator replay racing a
      // cron fire, or two parallel observers landing in the same millisecond)
      // could both observe count===0 and both fire the push. concurrency
      // limit=50 narrowed the window but did not close it.
      //
      // checkAndLogRateLimitInternal wraps the count check and the log insert
      // in a single transaction with a pg_advisory_xact_lock keyed on
      // ('rate-limit:<profileId>:daily_reminder'); concurrent callers
      // serialize on the lock and the second caller observes the first's row.
      // Mirrors the BUG-117 fix in trial-expiry.ts and the notify-struggle
      // / recall-nudge-send pattern.
      //
      // [BUG-976 / CCR-PR129-M-3] Fail closed on DB error: skip this cycle
      // rather than throwing uncaught (which would cause Inngest to retry
      // indefinitely and block the notification pipeline). captureException
      // makes the failure queryable in Sentry so we can measure transient
      // DB hiccup frequency.
      let limited: boolean;
      try {
        limited = await checkAndLogRateLimitInternal(
          db,
          profileId,
          'daily_reminder',
          { hours: 24, maxCount: 1 },
        );
      } catch (err) {
        captureException(err, {
          profileId,
          extra: {
            context: 'daily-reminder-send:checkAndLogRateLimitInternal',
          },
        });
        return {
          status: 'skipped' as const,
          reason: 'dedup_check_failed',
          profileId,
        };
      }
      if (limited) {
        return { status: 'skipped' as const, reason: 'dedup_24h', profileId };
      }

      const body = formatDailyReminderBody(streakDays);

      // [BUG-838] checkAndLogRateLimitInternal already inserted the
      // notificationLog row in the same transaction that gated us — pass
      // skipRateLimitLog so sendPushNotification does not double-log this
      // push toward the daily cap. If the push itself fails we accept the
      // unsent-but-logged state (mirrors trial-expiry.ts:120 rationale):
      // a duplicate user-visible push is worse than an unsent one.
      const sendResult = await sendPushNotification(
        db,
        {
          profileId,
          title: 'Keep your streak!',
          body,
          type: 'daily_reminder',
        },
        { skipRateLimitLog: true },
      );

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

    // AGENTS.md "Silent recovery without escalation is banned": the
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
