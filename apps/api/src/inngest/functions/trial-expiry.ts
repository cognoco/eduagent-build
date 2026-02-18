// ---------------------------------------------------------------------------
// Trial Expiry Check — Sprint 9 Phase 2
// Daily cron: expire trials, send warnings (3-day, 1-day), soft-landing msgs.
// ---------------------------------------------------------------------------

import { lte, eq, and, gte } from 'drizzle-orm';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { subscriptions } from '@eduagent/database';
import { getTierConfig } from '../../services/subscription';
import {
  expireTrialSubscription,
  downgradeQuotaPool,
} from '../../services/billing';
import {
  getTrialWarningMessage,
  getSoftLandingMessage,
} from '../../services/trial';

export const trialExpiry = inngest.createFunction(
  { id: 'trial-expiry-check', name: 'Check and process trial expirations' },
  { cron: '0 0 * * *' }, // Daily at midnight
  async ({ step }) => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Step 1: Expire trials that have ended
    const expiredCount = await step.run('process-expired-trials', async () => {
      const db = getStepDatabase();

      // Find trial subscriptions whose trialEndsAt <= now
      const expiredTrials = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.status, 'trial'),
          lte(subscriptions.trialEndsAt, now)
        ),
      });

      let count = 0;
      const freeTier = getTierConfig('free');

      for (const trial of expiredTrials) {
        // Transition to expired
        await expireTrialSubscription(db, trial.id);

        // Reset quota to free tier limits
        await downgradeQuotaPool(db, trial.id, freeTier.monthlyQuota);

        count++;
      }

      return count;
    });

    // Step 2: Send warning notifications for trials ending in 3 days or 1 day
    const warningsSent = await step.run('send-trial-warnings', async () => {
      const db = getStepDatabase();
      let sent = 0;

      // Check 3-day and 1-day warnings
      for (const daysRemaining of [3, 1, 0]) {
        const warningMessage = getTrialWarningMessage(daysRemaining);
        if (!warningMessage) continue;

        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysRemaining);
        const targetDayStart = new Date(
          targetDate.toISOString().slice(0, 10) + 'T00:00:00.000Z'
        );
        const targetDayEnd = new Date(
          targetDate.toISOString().slice(0, 10) + 'T23:59:59.999Z'
        );

        const trialsToWarn = await db.query.subscriptions.findMany({
          where: and(
            eq(subscriptions.status, 'trial'),
            gte(subscriptions.trialEndsAt, targetDayStart),
            lte(subscriptions.trialEndsAt, targetDayEnd)
          ),
        });

        // TODO: Send push notifications via Expo Push SDK (ARCH-18)
        // For now, we count how many warnings would be sent
        sent += trialsToWarn.length;
      }

      return sent;
    });

    // Step 3: Send soft-landing messages for recently expired trials
    const softLandingSent = await step.run(
      'send-soft-landing-messages',
      async () => {
        const db = getStepDatabase();
        let sent = 0;

        // Check soft landing milestones: day 1, 7, 14 after trial end
        for (const daysSinceEnd of [1, 7, 14]) {
          const message = getSoftLandingMessage(daysSinceEnd);
          if (!message) continue;

          const targetDate = new Date(now);
          targetDate.setDate(targetDate.getDate() - daysSinceEnd);
          const targetDayStart = new Date(
            targetDate.toISOString().slice(0, 10) + 'T00:00:00.000Z'
          );
          const targetDayEnd = new Date(
            targetDate.toISOString().slice(0, 10) + 'T23:59:59.999Z'
          );

          const expiredTrials = await db.query.subscriptions.findMany({
            where: and(
              eq(subscriptions.status, 'expired'),
              gte(subscriptions.trialEndsAt, targetDayStart),
              lte(subscriptions.trialEndsAt, targetDayEnd)
            ),
          });

          // TODO: Send push notifications via Expo Push SDK (ARCH-18)
          sent += expiredTrials.length;
        }

        return sent;
      }
    );

    return {
      status: 'completed',
      date: today,
      expiredCount,
      warningsSent,
      softLandingSent,
    };
  }
);
