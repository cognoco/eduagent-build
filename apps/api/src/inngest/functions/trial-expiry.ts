// ---------------------------------------------------------------------------
// Trial Expiry Check — Sprint 9 Phase 2 / Story 5.2
// Daily cron: expire trials → extended soft landing → free tier, send warnings.
//
// Reverse trial flow:
//   Day 1-14:  full Plus access (status: 'trial', tier: 'plus')
//   Day 15-28: extended trial / soft landing (status: 'expired', tier: 'free',
//              quota: 15/day ≈ 450/month)
//   Day 29+:   free tier (status: 'expired', tier: 'free', quota: 50/month)
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { getTierConfig } from '../../services/subscription';
import {
  findExpiredTrials,
  findSubscriptionsByTrialDateRange,
  transitionToExtendedTrial,
  downgradeQuotaPool,
  findExpiredTrialsByDaysSinceEnd,
} from '../../services/billing';
import {
  getTrialWarningMessage,
  getSoftLandingMessage,
  EXTENDED_TRIAL_MONTHLY_EQUIVALENT,
  TRIAL_EXTENDED_DAYS,
} from '../../services/trial';

export const trialExpiry = inngest.createFunction(
  { id: 'trial-expiry-check', name: 'Check and process trial expirations' },
  { cron: '0 0 * * *' }, // Daily at midnight
  async ({ step }) => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Step 1: Transition trials that just ended → extended trial (soft landing)
    // Instead of going directly to free, users get 15 questions/day for 14 more days.
    const expiredCount = await step.run('process-expired-trials', async () => {
      const db = getStepDatabase();
      const expiredTrials = await findExpiredTrials(db, now);

      let count = 0;
      for (const trial of expiredTrials) {
        await transitionToExtendedTrial(
          db,
          trial.id,
          EXTENDED_TRIAL_MONTHLY_EQUIVALENT
        );
        count++;
      }

      return count;
    });

    // Step 2: Transition extended trials that have ended (day 28+) → free tier
    const extendedExpiredCount = await step.run(
      'process-extended-trial-expiry',
      async () => {
        const db = getStepDatabase();
        // Find subscriptions whose trial ended exactly TRIAL_EXTENDED_DAYS ago
        // (i.e. they've been in extended trial for the full 14-day window)
        const extendedTrials = await findExpiredTrialsByDaysSinceEnd(
          db,
          now,
          TRIAL_EXTENDED_DAYS
        );

        let count = 0;
        const freeTier = getTierConfig('free');

        for (const trial of extendedTrials) {
          await downgradeQuotaPool(db, trial.id, freeTier.monthlyQuota);
          count++;
        }

        return count;
      }
    );

    // Step 3: Send warning notifications for trials ending in 3 days, 1 day, last day
    const warningsSent = await step.run('send-trial-warnings', async () => {
      const db = getStepDatabase();
      let sent = 0;

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

        const trialsToWarn = await findSubscriptionsByTrialDateRange(
          db,
          'trial',
          targetDayStart,
          targetDayEnd
        );

        // TODO: Send push notifications via Expo Push SDK (ARCH-18)
        // For now, we count how many warnings would be sent
        sent += trialsToWarn.length;
      }

      return sent;
    });

    // Step 4: Send soft-landing messages for recently expired trials
    const softLandingSent = await step.run(
      'send-soft-landing-messages',
      async () => {
        const db = getStepDatabase();
        let sent = 0;

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

          const expiredTrials = await findSubscriptionsByTrialDateRange(
            db,
            'expired',
            targetDayStart,
            targetDayEnd
          );

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
      extendedExpiredCount,
      warningsSent,
      softLandingSent,
    };
  }
);
