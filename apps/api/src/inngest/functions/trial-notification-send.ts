// ---------------------------------------------------------------------------
// Trial Notification Send — per-trial fan-out receiver for the trial-expiry
// cron's warning (Step 3) and soft-landing (Step 4) notifications.
//
// [TRIAL-FANOUT] The cron previously wrapped the entire warning / soft-landing
// loop — `findSubscriptionsByTrialDateRange` + per-trial
// `sendTrialNotificationToAccountOwner` (which re-runs the atomic rate-limit
// gate) — inside ONE `step.run`. On an Inngest retry the WHOLE loop re-executed
// the range queries and re-checked the rate-limit for every trial, so wasted
// work scaled with trial count even though idempotency held.
//
// The cron now scans each date range and fans out one
// `app/billing.trial_notification.send` event per trial. This handler does the
// per-trial send inside its own `step.run`, so a retry replays only the failed
// per-trial step — not the whole loop. The atomic rate-limit gate
// (checkAndLogRateLimitInternal, maxCount=1 / 24h) is preserved here, so the
// "one push per 24h" dedup that closed BUG-117 still holds across replays and
// concurrent fan-out fires.
// ---------------------------------------------------------------------------

import { inngest, INNGEST_PLAN_CONCURRENCY_CAP } from '../client';
import { getStepDatabase } from '../helpers';
import {
  sendTrialNotificationToAccountOwner,
  type TrialNotificationStep,
} from './trial-expiry';

export const trialNotificationSend = inngest.createFunction(
  {
    id: 'trial-notification-send',
    name: 'Send one trial expiry notification',
    // [TRIAL-FANOUT] Bound parallelism so a large fan-out (many trials ending
    // the same day) does not stampede Neon + the push provider. Intended 25;
    // capped to the Inngest plan limit (raise after a plan upgrade — see
    // INNGEST_PLAN_CONCURRENCY_CAP).
    concurrency: { limit: INNGEST_PLAN_CONCURRENCY_CAP },
  },
  { event: 'app/billing.trial_notification.send' },
  async ({ event, step }) => {
    const data = event.data as {
      accountId: string;
      timestamp: string;
      title: string;
      body: string;
      step: TrialNotificationStep;
    };

    return step.run('send-trial-notification', async () => {
      const db = getStepDatabase();
      // [BUG-117] Atomic rate-limit gate preserved inside the per-trial step —
      // the dedup transaction (advisory lock + count + log) is what makes a
      // replay safe. The notification semantics (title / body / type) are
      // byte-identical to the previous in-loop send.
      const result = await sendTrialNotificationToAccountOwner(
        db,
        data.accountId,
        {
          title: data.title,
          body: data.body,
          type: 'trial_expiry',
        },
      );
      return {
        status: result.sent ? ('sent' as const) : ('skipped' as const),
        accountId: data.accountId,
        step: data.step,
        reason: result.reason,
      };
    });
  },
);
