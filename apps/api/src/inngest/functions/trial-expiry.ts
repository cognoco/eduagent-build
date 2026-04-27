// ---------------------------------------------------------------------------
// Trial Expiry Check — Sprint 9 Phase 2 / Story 5.2
// Daily cron: expire trials → extended soft landing → free tier, send warnings.
//
// Reverse trial flow:
//   Day 1-14:  full Plus access (status: 'trial', tier: 'plus')
//   Day 15-28: extended trial / soft landing (status: 'expired', tier: 'free',
//              quota: 15/day ≈ 450/month)
//   Day 29+:   free tier (status: 'expired', tier: 'free', quota: 10/day + 100/month)
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { getTierConfig } from '../../services/subscription';
import { captureException } from '../../services/sentry';
import { createLogger } from '../../services/logger';

const logger = createLogger();

// [BUG-843 / F-SVC-011] Per-trial errors used to silently `console.error`
// inside the loop, so the cron reported a lower count and stuck trials
// accumulated invisibly. Each per-trial failure now (a) emits a structured
// error log via the canonical logger, and (b) dispatches this event so the
// `trialExpiryFailureObserve` handler is the queryable terminus and a
// future on-call rule can page on rate spikes. captureException is kept
// alongside both so Sentry sees the raw stack.
const TRIAL_EXPIRY_FAILURE_EVENT = 'app/billing.trial_expiry_failed' as const;

async function escalateTrialExpiryFailure(params: {
  step: 'process-expired-trials' | 'process-extended-trial-expiry';
  trialId: string;
  err: unknown;
}): Promise<void> {
  const reason =
    params.err instanceof Error ? params.err.message : String(params.err);
  logger.error('billing.trial_expiry_failed', {
    step: params.step,
    trialId: params.trialId,
    reason,
  });
  try {
    await inngest.send({
      name: TRIAL_EXPIRY_FAILURE_EVENT,
      data: {
        step: params.step,
        trialId: params.trialId,
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (sendError) {
    // Inngest dispatch must not crash the cron — the structured log + Sentry
    // capture already persist the failure. A separate observability rule on
    // *_dispatch_failed catches the dispatch failure itself.
    logger.error('billing.trial_expiry_failed_dispatch_failed', {
      step: params.step,
      trialId: params.trialId,
      sendError:
        sendError instanceof Error ? sendError.message : String(sendError),
    });
  }
}
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
import { sendPushNotification } from '../../services/notifications';
import { findOwnerProfile } from '../../services/profile';

async function sendTrialNotificationToAccountOwner(
  db: ReturnType<typeof getStepDatabase>,
  accountId: string,
  payload: {
    title: string;
    body: string;
    type: 'trial_expiry';
  }
): Promise<{ sent: boolean; reason?: string }> {
  const ownerProfile = await findOwnerProfile(db, accountId);
  if (!ownerProfile) {
    return { sent: false, reason: 'no_owner_profile' };
  }

  return sendPushNotification(db, {
    profileId: ownerProfile.id,
    title: payload.title,
    body: payload.body,
    type: payload.type,
  });
}

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
        try {
          await transitionToExtendedTrial(
            db,
            trial.id,
            EXTENDED_TRIAL_MONTHLY_EQUIVALENT
          );
          count++;
        } catch (err) {
          // [J-5] captureException keeps the raw stack queryable in Sentry.
          captureException(err, {
            extra: {
              context: 'trial-expiry.transition',
              subscriptionId: trial.id,
            },
          });
          // [BUG-843 / F-SVC-011] Also escalate via structured log + Inngest
          // event so the failure isn't invisible in non-Sentry observability
          // and a follow-up retry/alert handler has a real listener.
          await escalateTrialExpiryFailure({
            step: 'process-expired-trials',
            trialId: trial.id,
            err,
          });
        }
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
          try {
            await downgradeQuotaPool(
              db,
              trial.id,
              freeTier.monthlyQuota,
              freeTier.dailyLimit
            );
            count++;
          } catch (err) {
            // [J-5] captureException keeps the raw stack queryable in Sentry.
            captureException(err, {
              extra: {
                context: 'trial-expiry.downgrade',
                subscriptionId: trial.id,
              },
            });
            // [BUG-843 / F-SVC-011] Per-trial structured escalation —
            // see the helper for the rationale.
            await escalateTrialExpiryFailure({
              step: 'process-extended-trial-expiry',
              trialId: trial.id,
              err,
            });
          }
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

        for (const trial of trialsToWarn) {
          const result = await sendTrialNotificationToAccountOwner(
            db,
            trial.accountId,
            {
              title: 'Trial ending soon',
              body: warningMessage,
              type: 'trial_expiry',
            }
          );
          if (result.sent) sent++;
        }
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

          for (const trial of expiredTrials) {
            const result = await sendTrialNotificationToAccountOwner(
              db,
              trial.accountId,
              {
                title: 'Your trial has ended',
                body: message,
                type: 'trial_expiry',
              }
            );
            if (result.sent) sent++;
          }
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
