// ---------------------------------------------------------------------------
// Trial Expiry Failure Observe — observable terminus for the
// app/billing.trial_expiry_failed event emitted by trial-expiry.ts when a
// per-trial transition or downgrade throws. [BUG-843 / F-SVC-011]
//
// Pre-fix: per-trial errors inside the for-loop were swallowed with a bare
// console.error so the cron silently reported a smaller count and stuck
// trials accumulated invisibly — the exact "silent recovery without
// escalation" pattern banned by CLAUDE.md.
//
// This handler is the queryable terminus. A real retry strategy (re-queue
// the failed trialId after backoff, page on rate spikes) is intentionally
// deferred — the structured log + return-shape contract is enough to make
// the failure stream observable today.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { createLogger } from '../../services/logger';

const logger = createLogger();

export const trialExpiryFailureObserve = inngest.createFunction(
  {
    id: 'trial-expiry-failure-observe',
    name: 'Trial expiry failure observability',
  },
  { event: 'app/billing.trial_expiry_failed' },
  async ({ event }) => {
    const data = event.data as {
      step?: string;
      trialId?: string;
      reason?: string;
      timestamp?: string;
    };

    logger.error('billing.trial_expiry_failed.received', {
      step: data.step ?? 'unknown',
      trialId: data.trialId ?? 'unknown',
      reason: data.reason ?? 'unknown',
      eventTimestamp: data.timestamp ?? null,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      step: data.step ?? null,
      trialId: data.trialId ?? null,
      retryDeferred: 'pending_trial_expiry_retry_strategy',
    };
  }
);
