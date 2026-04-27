// ---------------------------------------------------------------------------
// Trial Subscription Failed — observable terminus for the
// app/billing.trial_subscription_failed event emitted by account
// provisioning when createSubscription throws. [BUG-837 / F-SVC-003]
//
// CLAUDE.md rule: "Silent recovery without escalation is banned" in
// billing/auth/webhook code. The lazy-provision path can't fail account
// creation when the trial subscription insert fails (the user must still
// land in the app), so the recovery is a delegated retry/alert via this
// handler. Until a real retry strategy is wired, the handler emits a
// structured log + return shape so the failure stream is queryable and
// every fan-out has a real listener.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { createLogger } from '../../services/logger';

const logger = createLogger();

export const billingTrialSubscriptionFailed = inngest.createFunction(
  {
    id: 'billing-trial-subscription-failed',
    name: 'Trial subscription creation failure',
  },
  { event: 'app/billing.trial_subscription_failed' },
  async ({ event }) => {
    const data = event.data as {
      accountId?: string;
      clerkUserId?: string;
      reason?: string;
      timestamp?: string;
    };

    logger.error('billing.trial_subscription_failed.received', {
      accountId: data.accountId ?? 'unknown',
      clerkUserId: data.clerkUserId ?? 'unknown',
      reason: data.reason ?? 'unknown',
      receivedAt: new Date().toISOString(),
      eventTimestamp: data.timestamp ?? null,
    });

    return {
      status: 'logged' as const,
      accountId: data.accountId ?? null,
      // The retry strategy is intentionally deferred — account creation
      // already succeeded, so the user can use the app. A future story
      // will add a retry-after-N handler (or a manual reconciliation
      // path); until then, the structured log above is the on-call
      // signal. Greppable marker so that future code review can find it.
      retryDeferred: 'pending_billing_retry_strategy',
    };
  }
);
