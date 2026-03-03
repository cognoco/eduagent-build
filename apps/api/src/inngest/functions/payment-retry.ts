// ---------------------------------------------------------------------------
// Payment Retry — Sprint 9 Phase 2
// ---------------------------------------------------------------------------
// DISABLED (Story 9.7): Mobile billing uses native IAP via RevenueCat.
// Apple and Google handle payment retry themselves through their respective
// billing systems. This function is kept intact for future web client (Stripe).
// ---------------------------------------------------------------------------

import { inngest } from '../client';

/**
 * Payment Retry Tracker — triggered by `app/payment.failed`.
 *
 * DISABLED: With RevenueCat / native IAP, payment retries are managed by
 * Apple App Store and Google Play. This function returns immediately with a
 * skip status. The original Stripe-based retry logic is preserved below
 * (commented) for reactivation when a web client with Stripe billing is added.
 */
export const paymentRetry = inngest.createFunction(
  { id: 'payment-retry', name: 'Retry failed payment' },
  { event: 'app/payment.failed' },
  async ({ event }) => {
    // Payment retry skipped — managed by app store (Apple/Google).
    // RevenueCat webhooks handle subscription lifecycle; no server-side
    // retry logic is needed for native IAP.
    return {
      status: 'skipped',
      reason: 'Payment retry skipped — managed by app store',
      subscriptionId: event.data.subscriptionId as string,
    };
  }
);

// ---------------------------------------------------------------------------
// Original Stripe retry logic — preserved for future web client
// ---------------------------------------------------------------------------
//
// import { getStepDatabase } from '../helpers';
// import {
//   updateSubscriptionFromWebhook,
//   getQuotaPool,
//   resetMonthlyQuota,
// } from '../../services/billing';
// import { getTierConfig } from '../../services/subscription';
//
// DESIGN NOTE: This function does NOT retry Stripe payments directly.
// Stripe handles payment retries via its Smart Retries feature
// (https://stripe.com/docs/billing/revenue-recovery/smart-retries).
//
// This function serves two purposes:
// 1. Track failed payment attempts across Stripe's retry cycles
// 2. After 3 failed attempts, downgrade the subscription to free tier
//
// The `attempt` counter increments each time Stripe's retry fails and
// our webhook receives a new `invoice.payment_failed` event, which
// dispatches a new `app/payment.failed` Inngest event.
//
// async ({ event, step }) => {
//   const { subscriptionId, stripeSubscriptionId, attempt } = event.data;
//
//   if (attempt >= 3) {
//     await step.run('downgrade-to-free', async () => {
//       const db = getStepDatabase();
//       await updateSubscriptionFromWebhook(db, stripeSubscriptionId, {
//         status: 'expired',
//         lastStripeEventTimestamp: new Date().toISOString(),
//       });
//       const freeTier = getTierConfig('free');
//       await resetMonthlyQuota(db, subscriptionId, freeTier.monthlyQuota);
//     });
//     return { status: 'downgraded', subscriptionId };
//   }
//
//   await step.sleep('retry-delay', '24h');
//
//   await step.run('check-payment-status', async () => {
//     const db = getStepDatabase();
//     const quota = await getQuotaPool(db, subscriptionId);
//     void quota;
//   });
//
//   return { status: 'waiting', attempt: attempt + 1 };
// }
// ---------------------------------------------------------------------------
