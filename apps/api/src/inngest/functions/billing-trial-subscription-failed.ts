// @inngest-admin: no-db (logging+Sentry observer; no DB access)
// ---------------------------------------------------------------------------
// Trial Subscription Failed — observable terminus for the
// app/billing.trial_subscription_failed event emitted by account
// provisioning when createSubscription throws. [BUG-837 / F-SVC-003]
//
// AGENTS.md rule: "Silent recovery without escalation is banned" in
// billing/auth/webhook code. The lazy-provision path can't fail account
// creation when the trial subscription insert fails (the user must still
// land in the app), so the recovery is a delegated retry/alert via this
// handler. The handler:
//   1. Validates the event payload with a Zod schema (BUG-754 / BUG-761) so
//      malformed events fan out a structured contract-error to Sentry
//      instead of silently coercing to `unknown`.
//   2. Emits a structured error log + Sentry capture so on-call dashboards
//      can quantify failure rate and page on sustained drift.
//   3. Relies on Inngest's own `retries: 2` for transient-class failures
//      (the structured log is queryable per-attempt so we can distinguish
//      a one-off from a sustained outage).
//
// No notification fan-out is dispatched from here — there is no existing
// "billing-failure → user" notification event registered, and inventing a
// new orphan event would re-introduce the BUG-760 wired-but-untriggered
// pattern. If/when a user-facing billing-failure notification path lands,
// wire it here via `safeSend()`.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { summarizeRawPayload } from '@eduagent/schemas';
import { captureException } from '../../services/sentry';

const logger = createLogger();

// [BUG-754 / BUG-761] Zod schema for the event payload. Defined locally
// because the contract is private to the account.ts emitter ⇄ this handler
// pair — adding it to @eduagent/schemas would pull a private internal event
// shape into the shared contract surface for no consumer benefit.
const trialSubscriptionFailedDataSchema = z.object({
  accountId: z.string().min(1),
  reason: z.string().min(1).optional(),
  timestamp: z.string().optional(),
});

export type TrialSubscriptionFailedData = z.infer<
  typeof trialSubscriptionFailedDataSchema
>;

export const billingTrialSubscriptionFailed = inngest.createFunction(
  {
    id: 'billing-trial-subscription-failed',
    name: 'Trial subscription creation failure',
    // [BUG-754] Inngest retries cover transient cases (e.g. a Sentry dispatch
    // hiccup); the structured log below is emitted per-attempt so on-call can
    // distinguish a one-off from a sustained outage.
    retries: 2,
  },
  { event: 'app/billing.trial_subscription_failed' },
  async ({ event }) => {
    const parsed = trialSubscriptionFailedDataSchema.safeParse(event.data);

    if (!parsed.success) {
      // Contract drift — the emitter sent a payload shape we do not recognise.
      // Capture to Sentry so we page on sustained drift, log structured, and
      // return a `status: 'invalid_payload'` terminus so the Inngest run shows
      // up as a successful (terminal) execution rather than a retry-loop.
      const err = new Error(
        `billing.trial_subscription_failed: invalid payload — ${parsed.error.message}`,
      );
      captureException(err, {
        extra: {
          surface: 'billing-trial-subscription-failed.invalid_payload',
          rawData: summarizeRawPayload(event.data),
        },
      });
      logger.error('billing.trial_subscription_failed.invalid_payload', {
        reason: parsed.error.message,
        receivedAt: new Date().toISOString(),
      });
      return {
        status: 'invalid_payload' as const,
        accountId: null,
      };
    }

    const data = parsed.data;

    logger.error('billing.trial_subscription_failed.received', {
      accountId: data.accountId,
      reason: data.reason ?? 'unknown',
      receivedAt: new Date().toISOString(),
      eventTimestamp: data.timestamp ?? null,
    });

    // [BUG-754] Sentry capture so a sustained spike in trial-subscription
    // failures pages on-call (the logger.error above is queryable in
    // Logpush; Sentry is what wakes a human at 2am).
    captureException(
      new Error(
        `billing.trial_subscription_failed: ${data.reason ?? 'unknown'}`,
      ),
      {
        extra: {
          surface: 'billing-trial-subscription-failed',
          accountId: data.accountId,
          eventTimestamp: data.timestamp,
        },
      },
    );

    return {
      status: 'logged' as const,
      accountId: data.accountId,
    };
  },
);
