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
 */
function getExpiryWindowForMilestone(
  now: Date,
  monthsBeforeExpiry: number
): { rangeStart: Date; rangeEnd: Date } {
  const target = new Date(now);
  target.setMonth(target.getMonth() + monthsBeforeExpiry);

  const rangeStart = new Date(
    target.toISOString().slice(0, 10) + 'T00:00:00.000Z'
  );
  const rangeEnd = new Date(
    target.toISOString().slice(0, 10) + 'T23:59:59.999Z'
  );

  return { rangeStart, rangeEnd };
}

export const topupExpiryReminder = inngest.createFunction(
  {
    id: 'topup-expiry-reminder',
    name: 'Send top-up credit expiry reminders',
  },
  { cron: '0 9 * * *' }, // Daily at 09:00 UTC
  async ({ step }) => {
    const now = new Date();
    let totalReminders = 0;

    for (const months of REMINDER_MONTHS_BEFORE_EXPIRY) {
      const label =
        months === 0 ? 'expiring-today' : `expiring-in-${months}-months`;

      const credits = await step.run(`find-credits-${label}`, async () => {
        const db = getStepDatabase();
        const { rangeStart, rangeEnd } = getExpiryWindowForMilestone(
          now,
          months
        );
        return findExpiringTopUpCredits(db, rangeStart, rangeEnd);
      });

      if (credits.length > 0) {
        await step.run(`queue-reminders-${label}`, async () => {
          // Queue individual reminder events for each expiring credit pack.
          // A downstream notification function (Story 5.6+) will handle
          // the actual email/push delivery.
          const events = credits.map((credit) => ({
            name: 'app/topup.expiry-reminder' as const,
            data: {
              topUpCreditId: credit.id,
              subscriptionId: credit.subscriptionId,
              remaining: credit.remaining,
              expiresAt: credit.expiresAt,
              monthsUntilExpiry: months,
              timestamp: now.toISOString(),
            },
          }));

          await inngest.send(events);
          return { sent: events.length };
        });

        totalReminders += credits.length;
      }
    }

    return {
      status: 'completed',
      totalReminders,
      timestamp: now.toISOString(),
    };
  }
);
