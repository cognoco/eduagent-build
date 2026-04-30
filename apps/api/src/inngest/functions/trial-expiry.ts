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
// error log via the canonical logger, and (b) is collected for batch
// dispatch via step.sendEvent so the `trialExpiryFailureObserve` handler is
// the queryable terminus and a future on-call rule can page on rate spikes.
// captureException is kept alongside both so Sentry sees the raw stack.
//
// [SWEEP-J7] The escalation event is dispatched OUTSIDE the per-trial
// step.run via step.sendEvent (memoized atomically). Bare inngest.send
// inside step.run loops was the duplicate-event source — same class as
// BUG-696/J-7 in session-stale-cleanup. The build-helper now just returns
// the event payload; the caller accumulates and the outer flow dispatches.
const TRIAL_EXPIRY_FAILURE_EVENT = 'app/billing.trial_expiry_failed' as const;

type TrialExpiryFailureEvent = {
  name: typeof TRIAL_EXPIRY_FAILURE_EVENT;
  data: {
    step: 'process-expired-trials' | 'process-extended-trial-expiry';
    trialId: string;
    reason: string;
    timestamp: string;
  };
};

function buildTrialExpiryFailureEvent(params: {
  step: 'process-expired-trials' | 'process-extended-trial-expiry';
  trialId: string;
  err: unknown;
}): TrialExpiryFailureEvent {
  const reason =
    params.err instanceof Error ? params.err.message : String(params.err);
  logger.error('billing.trial_expiry_failed', {
    step: params.step,
    trialId: params.trialId,
    reason,
  });
  return {
    name: TRIAL_EXPIRY_FAILURE_EVENT,
    data: {
      step: params.step,
      trialId: params.trialId,
      reason,
      timestamp: new Date().toISOString(),
    },
  };
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
import { getRecentNotificationCount } from '../../services/settings';
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

  // [BUG-699-FOLLOWUP] Best-effort dedup by notification log. Read-then-write
  // is NOT atomic: two concurrent step.run invocations (Inngest retry racing
  // a fresh daily cron run) could both see count===0 and both send. The daily
  // cron cadence + retries=2 keeps the race window narrow in practice; if
  // duplicate sends are ever observed, promote to a (profile_id, type, day)
  // unique constraint on notificationLog so the DB rejects the race loser.
  const recentCount = await getRecentNotificationCount(
    db,
    ownerProfile.id,
    'trial_expiry',
    24
  );
  if (recentCount > 0) {
    return { sent: false, reason: 'dedup_24h' };
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
    const expiredResult = await step.run('process-expired-trials', async () => {
      const db = getStepDatabase();
      const expiredTrials = await findExpiredTrials(db, now);

      let count = 0;
      const failures: TrialExpiryFailureEvent[] = [];
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
          // [BUG-843 / F-SVC-011] Build escalation event for batch dispatch
          // outside step.run — see [SWEEP-J7] note on the helper.
          failures.push(
            buildTrialExpiryFailureEvent({
              step: 'process-expired-trials',
              trialId: trial.id,
              err,
            })
          );
        }
      }

      return { count, failures };
    });

    // [SWEEP-J7] Memoized batch dispatch outside step.run.
    if (expiredResult.failures.length > 0) {
      await step.sendEvent(
        'escalate-process-expired-trials',
        expiredResult.failures
      );
    }
    const expiredCount = expiredResult.count;

    // Step 2: Transition extended trials that have ended (day 28+) → free tier
    const extendedResult = await step.run(
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
        const failures: TrialExpiryFailureEvent[] = [];
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
            // [BUG-843 / F-SVC-011] Per-trial escalation collected for batch
            // dispatch outside step.run — see [SWEEP-J7] note on the helper.
            failures.push(
              buildTrialExpiryFailureEvent({
                step: 'process-extended-trial-expiry',
                trialId: trial.id,
                err,
              })
            );
          }
        }

        return { count, failures };
      }
    );

    // [SWEEP-J7] Memoized batch dispatch outside step.run.
    if (extendedResult.failures.length > 0) {
      await step.sendEvent(
        'escalate-process-extended-trial-expiry',
        extendedResult.failures
      );
    }
    const extendedExpiredCount = extendedResult.count;

    // Step 3: Send warning notifications for trials ending in 3 days, 1 day, last day.
    //
    // [BUG-699-FOLLOWUP] Both `send-trial-warnings` (Step 3) and
    // `send-soft-landing-messages` (Step 4) write to the SAME notificationLog
    // bucket — `type: 'trial_expiry'` — and rely on the shared 24h dedup in
    // `sendTrialNotificationToAccountOwner`. This is intentional, not a copy-
    // paste oversight: a single subscription is `status: 'trial'` XOR
    // `status: 'expired'` at any moment, so a given account can never qualify
    // for both warnings AND soft-landing within the same 24h window. Splitting
    // into two notificationType enum values would force a Drizzle migration
    // for a race that cannot occur in production. If this premise ever
    // changes (e.g. trial pause/unpause flows, retroactive status edits),
    // promote to distinct enum values rather than broaden the dedup window.
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
