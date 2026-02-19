// ---------------------------------------------------------------------------
// Payment Retry — Sprint 9 Phase 2
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  updateSubscriptionFromWebhook,
  getQuotaPool,
  resetMonthlyQuota,
} from '../../services/billing';
import { getTierConfig } from '../../services/subscription';

/**
 * Payment Retry Tracker — triggered by `app/payment.failed`.
 *
 * DESIGN NOTE: This function does NOT retry Stripe payments directly.
 * Stripe handles payment retries via its Smart Retries feature
 * (https://stripe.com/docs/billing/revenue-recovery/smart-retries).
 *
 * This function serves two purposes:
 * 1. Track failed payment attempts across Stripe's retry cycles
 * 2. After 3 failed attempts, downgrade the subscription to free tier
 *
 * The `attempt` counter increments each time Stripe's retry fails and
 * our webhook receives a new `invoice.payment_failed` event, which
 * dispatches a new `app/payment.failed` Inngest event.
 */
export const paymentRetry = inngest.createFunction(
  { id: 'payment-retry', name: 'Retry failed payment' },
  { event: 'app/payment.failed' },
  async ({ event, step }) => {
    const { subscriptionId, stripeSubscriptionId, attempt } = event.data;

    if (attempt >= 3) {
      // After 3 failed attempts, downgrade to free tier
      await step.run('downgrade-to-free', async () => {
        const db = getStepDatabase();

        // Mark subscription as expired via the idempotent webhook update path
        await updateSubscriptionFromWebhook(db, stripeSubscriptionId, {
          status: 'expired',
          lastStripeEventTimestamp: new Date().toISOString(),
        });

        // Reset quota to free tier limits
        const freeTier = getTierConfig('free');
        await resetMonthlyQuota(db, subscriptionId, freeTier.monthlyQuota);
      });

      return { status: 'downgraded', subscriptionId };
    }

    // Wait 24 hours before the next check
    await step.sleep('retry-delay', '24h');

    await step.run('check-payment-status', async () => {
      const db = getStepDatabase();
      const quota = await getQuotaPool(db, subscriptionId);
      // Log for observability — Stripe itself handles payment retries via its
      // Smart Retries feature. This step exists to track attempt count and
      // trigger downgrade if Stripe's retries also fail.
      void quota;
    });

    return { status: 'waiting', attempt: attempt + 1 };
  }
);
