// ---------------------------------------------------------------------------
// Notification Suppressed Observer — consumes app/notification.suppressed
// events emitted by daily-reminder-send and review-due-send when the 24h
// notification-log dedup check fails (DB error).
//
// Without this consumer the event would be a fire-and-forget marker with no
// queryable record — the comments in the producers promise "queryable in 24h
// dashboards" but the underlying signal would only live in Sentry exception
// counts. This handler emits a structured info log per suppression so the
// volume is visible in Cloudflare Workers Logpush / `wrangler tail` and can
// be aggregated by the `[notification-suppressed]` prefix.
//
// Reference: CLAUDE.md > Fix Verification Rules — "Silent recovery without
// escalation is banned".
// ---------------------------------------------------------------------------

import { appNotificationSuppressedEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

export const notificationSuppressedObserve = inngest.createFunction(
  {
    id: 'notification-suppressed-observe',
    name: 'Notification suppressed observer',
  },
  { event: 'app/notification.suppressed' },
  async ({ event }) => {
    const parsed = appNotificationSuppressedEventSchema.safeParse(event.data);

    if (!parsed.success) {
      // CLAUDE.md "Silent recovery without escalation is banned": a malformed
      // payload here means an upstream producer drifted from the schema, or a
      // bad actor / replay injected garbage. Returning success would mark the
      // run completed and disappear the signal. Instead: capture to Sentry and
      // throw so Inngest retries → eventually dead-letters, where the volume
      // is queryable.
      const err = new Error(
        '[notification-suppressed] invalid event payload — schema drift or bad event'
      );
      logger.error('[notification-suppressed] invalid event payload', {
        issues: parsed.error.issues,
        rawData: event.data,
      });
      captureException(err, {
        extra: {
          context: 'notification-suppressed-observe:invalid_payload',
          issues: parsed.error.issues,
          rawData: event.data,
        },
      });
      throw err;
    }

    const data = parsed.data;

    logger.warn('[notification-suppressed]', {
      profileId: data.profileId,
      notificationType: data.notificationType,
      reason: data.reason,
      timestamp: data.timestamp,
    });

    return {
      observed: true,
      notificationType: data.notificationType,
      reason: data.reason,
    };
  }
);
