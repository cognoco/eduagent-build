// ---------------------------------------------------------------------------
// Top-Up Expiry Reminder — Story 5.3
// Daily cron: sends reminders for top-up credits approaching expiry.
// Reminder schedule: month 6, 8, 10, and 12 after purchase (12-month expiry).
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { findExpiringTopUpCredits } from '../../services/billing';

/** Reminder milestones: months before expiry at which to remind. */
const REMINDER_MONTHS_BEFORE_EXPIRY = [6, 4, 2, 0] as const;

/**
 * For each milestone, compute the date range for credits expiring
 * at that milestone month from now. We check a 1-day window.
 *
 * [BUG-838 / F-SVC-004] Returns null if `now` is an invalid Date so the
 * milestone is skipped instead of throwing RangeError out of toISOString and
 * aborting the entire reminder batch. The previous version trusted the caller
 * — fine today (always `new Date()`) but would explode if a future caller
 * passed `new Date(undefined)` or a parsed-from-bad-input Date.
 */
function getExpiryWindowForMilestone(
  now: Date,
  monthsBeforeExpiry: number
): { rangeStart: Date; rangeEnd: Date } | null {
  if (!Number.isFinite(now.getTime())) return null;

  const target = new Date(now);
  target.setMonth(target.getMonth() + monthsBeforeExpiry);

  if (!Number.isFinite(target.getTime())) return null;

  const dateStr = target.toISOString().slice(0, 10);
  return {
    rangeStart: new Date(dateStr + 'T00:00:00.000Z'),
    rangeEnd: new Date(dateStr + 'T23:59:59.999Z'),
  };
}

export const topupExpiryReminder = inngest.createFunction(
  {
    id: 'topup-expiry-reminder',
    name: 'Send top-up credit expiry reminders',
  },
  { cron: '0 9 * * *' }, // Daily at 09:00 UTC
  async ({ step }) => {
    const now = new Date();
    // [BUG-838 / F-SVC-004] If the system clock yields an invalid Date,
    // fall back to epoch for the structured timestamp instead of throwing
    // RangeError out to Inngest (which would trigger pointless retries
    // against the same broken clock).
    const nowIso = Number.isFinite(now.getTime())
      ? now.toISOString()
      : new Date(0).toISOString();
    let totalReminders = 0;

    for (const months of REMINDER_MONTHS_BEFORE_EXPIRY) {
      const label =
        months === 0 ? 'expiring-today' : `expiring-in-${months}-months`;

      const credits = await step.run(`find-credits-${label}`, async () => {
        const db = getStepDatabase();
        const window = getExpiryWindowForMilestone(now, months);
        if (!window) return [];
        return findExpiringTopUpCredits(db, window.rangeStart, window.rangeEnd);
      });

      if (credits.length > 0) {
        // [SWEEP-J7] Use step.sendEvent (memoized atomically) instead of bare
        // inngest.send inside a step.run. If the step throws partway through
        // dispatching N events, retry replays from scratch and re-emits the
        // already-sent ones — duplicate-reminder source. Same class as
        // BUG-696/J-7 in session-stale-cleanup.
        // BUG-638 [J-2]: handler `topupExpiryReminderSend` consumes these
        // events and emits a structured log so the reminder stream is
        // observable. Real push/email delivery is deferred to Story 5.6+
        // — see topup-expiry-reminder-send.ts for the wire-up.
        await step.sendEvent(
          `queue-reminders-${label}`,
          credits.map((credit) => ({
            name: 'app/topup.expiry-reminder' as const,
            data: {
              topUpCreditId: credit.id,
              subscriptionId: credit.subscriptionId,
              remaining: credit.remaining,
              expiresAt: credit.expiresAt,
              monthsUntilExpiry: months,
              timestamp: nowIso,
            },
          }))
        );

        totalReminders += credits.length;
      }
    }

    return {
      status: 'completed',
      totalReminders,
      timestamp: nowIso,
    };
  }
);
