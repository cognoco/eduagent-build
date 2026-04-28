// ---------------------------------------------------------------------------
// Top-Up Expiry Reminder Send — BUG-638 [J-2]
// ---------------------------------------------------------------------------
// Per-credit handler for `app/topup.expiry-reminder` events fanned out by
// `topupExpiryReminder` (cron). The cron used to send events into a queue
// with no listener, so reminders were silently dropped — a wired-but-
// untriggered path that creates false confidence (CLAUDE.md: "Wired-but-
// untriggered code is worse than dead code").
//
// This handler is the observable terminus: every cron fan-out lands here
// and emits a structured log so the reminder stream is monitorable. Real
// delivery (push / email) is intentionally deferred to Story 5.6+; this
// stub is the missing handler the bug demands, not the full feature.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { createLogger } from '../../services/logger';

const logger = createLogger();

export const topupExpiryReminderSend = inngest.createFunction(
  {
    id: 'topup-expiry-reminder-send',
    name: 'Top-Up Expiry Reminder Send',
  },
  { event: 'app/topup.expiry-reminder' },
  async ({ event }) => {
    const {
      topUpCreditId,
      subscriptionId,
      remaining,
      expiresAt,
      monthsUntilExpiry,
    } = event.data;

    // Structured log so the reminder stream is queryable in observability.
    // When real delivery (push / email) is added, replace this with the
    // notification dispatch and surface sent/skipped status.
    logger.info('topup_expiry_reminder.received', {
      topUpCreditId,
      subscriptionId,
      remaining,
      expiresAt,
      monthsUntilExpiry,
    });

    return {
      status: 'logged' as const,
      topUpCreditId,
      subscriptionId,
      monthsUntilExpiry,
      // Surfaces the deferred-delivery state so future code review and
      // Story 5.6 implementation can grep for this exact reason string.
      deliveryDeferred: 'pending_notification_handler_story_5_6',
    };
  }
);
