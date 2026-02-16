import { inngest } from '../client';

export const paymentRetry = inngest.createFunction(
  { id: 'payment-retry', name: 'Retry failed payment' },
  { event: 'app/payment.failed' },
  async ({ event, step }) => {
    const { subscriptionId, attempt } = event.data;

    if (attempt >= 3) {
      await step.run('downgrade-to-free', async () => {
        // TODO: Downgrade subscription to free tier
        console.log(
          `Downgrading subscription ${subscriptionId} after 3 failed attempts`
        );
      });
      return { status: 'downgraded', subscriptionId };
    }

    // Wait 24 hours before retry
    await step.sleep('retry-delay', '24h');

    await step.run('retry-payment', async () => {
      // TODO: Trigger Stripe payment retry
      console.log(
        `Retrying payment for ${subscriptionId}, attempt ${attempt + 1}`
      );
    });

    return { status: 'retried', attempt: attempt + 1 };
  }
);
