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

// [TRIAL-FANOUT] Per-trial notification fan-out. Steps 3 (warnings) and 4
// (soft-landing) used to scan a date range AND send every push inside ONE
// step.run, so an Inngest retry re-ran the range queries + re-checked the
// rate-limit gate for every trial — wasted work scaling with trial count. The
// cron now scans the range, then dispatches one of these events per trial; the
// trial-notification-send handler does the actual send inside its own step.run,
// so a retry replays only the failed per-trial step. The atomic rate-limit gate
// (checkAndLogRateLimitInternal) is preserved in the handler, so the "one push
// per 24h" dedup (BUG-117) still holds across replays.
const TRIAL_NOTIFICATION_SEND_EVENT =
  'app/billing.trial_notification.send' as const;

export type TrialNotificationStep = 'send-trial-warnings' | 'send-soft-landing';

type TrialNotificationSendEvent = {
  name: typeof TRIAL_NOTIFICATION_SEND_EVENT;
  data: {
    accountId: string;
    // Dispatch-time snapshot. Payload convention: events always carry a
    // timestamp (profileId is legitimately absent — this billing-level event
    // is keyed by accountId). Mirrors topup-expiry-reminder's `timestamp`.
    timestamp: string;
    title: string;
    body: string;
    step: TrialNotificationStep;
  };
};

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
// [CUT-B3 / WI-693] v2 trial-store reads/writes (identity v2 always-on).
// The notification + rate-limit + push helpers operate on the satellite/notification tables (store-agnostic).
import {
  findExpiredTrialsV2,
  findSubscriptionsByTrialDateRangeV2,
  transitionToExtendedTrialV2,
  downgradeExtendedTrialQuotaIfStillExpiredV2,
  findExpiredTrialsByDaysSinceEndV2,
} from '../../services/billing/billing-v2';
import { findOwnerPersonId } from '../../services/identity-v2/helpers';
import {
  getTrialWarningMessage,
  getSoftLandingMessage,
  EXTENDED_TRIAL_MONTHLY_EQUIVALENT,
  TRIAL_EXTENDED_DAYS,
} from '../../services/trial';
import { sendPushNotification } from '../../services/notifications';
import { checkAndLogRateLimitInternal } from '../../services/settings';

export async function sendTrialNotificationToAccountOwner(
  db: ReturnType<typeof getStepDatabase>,
  accountId: string,
  payload: {
    title: string;
    body: string;
    type: 'trial_expiry';
  },
): Promise<{ sent: boolean; reason?: string }> {
  // [CUT-B3 / WI-693 §2.5] v2 seam: the push recipient (owner) resolves via
  // membership.roles @> '{admin}' (findOwnerPersonId) instead of
  // profiles.is_owner (findOwnerProfile). account.id = organization.id, and
  // person.id = profiles.id, so the resulting profileId is unchanged.
  const ownerProfileId = await findOwnerPersonId(db, accountId);
  if (!ownerProfileId) {
    return { sent: false, reason: 'no_owner_profile' };
  }

  // [BUG-117] Atomic dedup. The previous implementation was a read-then-write
  // pair on notificationLog (getRecentNotificationCount → conditional send +
  // log). Two concurrent step.run invocations (e.g. an Inngest retry racing
  // a fresh daily cron run, or two parallel observers landing in the same
  // millisecond) could both observe count===0 and both fire the push.
  //
  // checkAndLogRateLimitInternal wraps the count check and the log insert
  // in a single transaction with a pg_advisory_xact_lock keyed on
  // ('rate-limit:<profileId>:<type>'). Concurrent callers serialize on the
  // lock, so the second caller observes the first caller's log row and the
  // race window is closed at the DB level. maxCount=1 within a 24h window
  // preserves the original "one push per 24h" semantics.
  const limited = await checkAndLogRateLimitInternal(
    db,
    ownerProfileId,
    'trial_expiry',
    { hours: 24, maxCount: 1 },
  );
  if (limited) {
    return { sent: false, reason: 'dedup_24h' };
  }

  // NOTE: checkAndLogRateLimitInternal has ALREADY inserted the
  // notificationLog row inside the same transaction that gated us. If the
  // push itself fails, we accept the unsent-but-logged state — a duplicate
  // push (user-visible) is worse than an unsent one (recoverable).
  return sendPushNotification(
    db,
    {
      profileId: ownerProfileId,
      title: payload.title,
      body: payload.body,
      type: payload.type,
    },
    // [WI-369] Transactional billing notice (trial expiry) — must always
    // deliver regardless of the recipient's push preference.
    { bypassPreferenceCheck: true },
  );
}

export const trialExpiry = inngest.createFunction(
  { id: 'trial-expiry-check', name: 'Check and process trial expirations' },
  { cron: '0 0 * * *' }, // Daily at midnight
  async ({ event, step }) => {
    // [BUG-762] Derive `now` from `event.ts` (Inngest event timestamp) instead
    // of `Date.now()` captured at function entry. `event.ts` is stable across
    // function replays (it's the cron-fire timestamp persisted by Inngest), so
    // every replay produces the same `today` boundary. Previously the
    // step.run('compute-today') memoization protected `today` from re-derivation
    // on retry, but the FIRST execution still latched `Date.now()` at function
    // entry — meaning a function that started near the day boundary could
    // record `today` as the day BEFORE the cron actually fired. Tying to
    // event.ts removes that entry-time drift entirely. Pattern mirrors the
    // [BUG-189] family of fixes (transcript-purge-cron.ts) but uses the event
    // timestamp as the authoritative source instead of step.run memoization.
    const eventTs = new Date(event.ts ?? Date.now());
    const nowIso = eventTs.toISOString();
    const today = nowIso.slice(0, 10);

    // Step 1: Transition trials that just ended → extended trial (soft landing)
    // Instead of going directly to free, users get 15 questions/day for 14 more days.
    const expiredResult = await step.run('process-expired-trials', async () => {
      const now = new Date(nowIso);
      const db = getStepDatabase();
      // [CUT-B3 / WI-693 §2.5] v2 seam: read/write trials in the new
      // `subscription` store. Legacy (flag-off) is byte-identical.
      const expiredTrials = await findExpiredTrialsV2(db, now);

      let count = 0;
      const failures: TrialExpiryFailureEvent[] = [];
      for (const trial of expiredTrials) {
        try {
          const applied = await transitionToExtendedTrialV2(
            db,
            trial.id,
            EXTENDED_TRIAL_MONTHLY_EQUIVALENT,
          );
          if (applied) {
            count++;
          } else {
            logger.warn('billing.trial_expiry_stale_selection_skipped', {
              step: 'process-expired-trials',
              trialId: trial.id,
              metric: 'billing_trial_expiry_stale_selection_skipped',
            });
          }
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
            }),
          );
        }
      }

      return { count, failures };
    });

    // [SWEEP-J7] Memoized batch dispatch outside step.run.
    if (expiredResult.failures.length > 0) {
      await step.sendEvent(
        'escalate-process-expired-trials',
        expiredResult.failures,
      );
    }
    const expiredCount = expiredResult.count;

    // Step 2: Transition extended trials that have ended (day 28+) → free tier
    const extendedResult = await step.run(
      'process-extended-trial-expiry',
      async () => {
        const now = new Date(nowIso);
        const db = getStepDatabase();
        // Find subscriptions whose trial ended exactly TRIAL_EXTENDED_DAYS ago
        // (i.e. they've been in extended trial for the full 14-day window)
        const extendedTrials = await findExpiredTrialsByDaysSinceEndV2(
          db,
          now,
          TRIAL_EXTENDED_DAYS,
        );

        let count = 0;
        const failures: TrialExpiryFailureEvent[] = [];
        const freeTier = getTierConfig('free');

        for (const trial of extendedTrials) {
          try {
            const applied = await downgradeExtendedTrialQuotaIfStillExpiredV2(
              db,
              trial.id,
              freeTier.monthlyQuota,
              freeTier.dailyLimit,
            );
            if (applied) {
              count++;
            } else {
              logger.warn('billing.trial_expiry_stale_selection_skipped', {
                step: 'process-extended-trial-expiry',
                trialId: trial.id,
                metric: 'billing_trial_expiry_stale_selection_skipped',
              });
            }
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
              }),
            );
          }
        }

        return { count, failures };
      },
    );

    // [SWEEP-J7] Memoized batch dispatch outside step.run.
    if (extendedResult.failures.length > 0) {
      await step.sendEvent(
        'escalate-process-extended-trial-expiry',
        extendedResult.failures,
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
    // [TRIAL-FANOUT] The scan (range queries + payload construction) stays in a
    // single memoized step.run; the per-trial SEND is fanned out so a retry of
    // the send does not replay the scan or the other trials' rate-limit gates.
    const warningEvents = await step.run('send-trial-warnings', async () => {
      const now = new Date(nowIso);
      const db = getStepDatabase();
      const events: TrialNotificationSendEvent[] = [];

      for (const daysRemaining of [3, 1, 0]) {
        const warningMessage = getTrialWarningMessage(daysRemaining);
        if (!warningMessage) continue;

        // [CR-2026-05-21-030] Use UTC date math so the warning window aligns
        // to UTC day boundaries regardless of process.env.TZ. setDate/getDate
        // operate in the runtime's local TZ and would drift if the worker is
        // ever deployed in a non-UTC environment. Matches the pattern in
        // weekly-progress-push.ts:113-119.
        const targetDate = new Date(now);
        targetDate.setUTCDate(targetDate.getUTCDate() + daysRemaining);
        const targetDayStart = new Date(
          targetDate.toISOString().slice(0, 10) + 'T00:00:00.000Z',
        );
        const targetDayEnd = new Date(
          targetDate.toISOString().slice(0, 10) + 'T23:59:59.999Z',
        );

        const trialsToWarn = await findSubscriptionsByTrialDateRangeV2(
          db,
          'trial',
          targetDayStart,
          targetDayEnd,
        );

        for (const trial of trialsToWarn) {
          events.push({
            name: TRIAL_NOTIFICATION_SEND_EVENT,
            data: {
              accountId: trial.accountId,
              timestamp: nowIso,
              title: 'Trial ending soon',
              body: warningMessage,
              step: 'send-trial-warnings',
            },
          });
        }
      }

      return events;
    });

    // [TRIAL-FANOUT] One event per trial. Each is independently retryable in
    // trial-notification-send, which owns the atomic rate-limit gate.
    if (warningEvents.length > 0) {
      await step.sendEvent('fan-out-trial-warnings', warningEvents);
    }

    // Step 4: Send soft-landing messages for recently expired trials
    const softLandingEvents = await step.run(
      'send-soft-landing-messages',
      async () => {
        const now = new Date(nowIso);
        const db = getStepDatabase();
        const events: TrialNotificationSendEvent[] = [];

        for (const daysSinceEnd of [1, 7, 14]) {
          const message = getSoftLandingMessage(daysSinceEnd);
          if (!message) continue;

          // [CR-2026-05-21-030] UTC date math — see note in send-trial-warnings step above.
          const targetDate = new Date(now);
          targetDate.setUTCDate(targetDate.getUTCDate() - daysSinceEnd);
          const targetDayStart = new Date(
            targetDate.toISOString().slice(0, 10) + 'T00:00:00.000Z',
          );
          const targetDayEnd = new Date(
            targetDate.toISOString().slice(0, 10) + 'T23:59:59.999Z',
          );

          const expiredTrials = await findSubscriptionsByTrialDateRangeV2(
            db,
            'expired',
            targetDayStart,
            targetDayEnd,
          );

          for (const trial of expiredTrials) {
            events.push({
              name: TRIAL_NOTIFICATION_SEND_EVENT,
              data: {
                accountId: trial.accountId,
                timestamp: nowIso,
                title: 'Your trial has ended',
                body: message,
                step: 'send-soft-landing',
              },
            });
          }
        }

        return events;
      },
    );

    // [TRIAL-FANOUT] One event per recently-expired trial.
    if (softLandingEvents.length > 0) {
      await step.sendEvent('fan-out-soft-landing', softLandingEvents);
    }

    return {
      status: 'completed',
      date: today,
      expiredCount,
      extendedExpiredCount,
      warningsQueued: warningEvents.length,
      softLandingQueued: softLandingEvents.length,
    };
  },
);
