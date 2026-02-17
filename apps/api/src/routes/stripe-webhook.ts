import { Hono } from 'hono';

// Stripe webhook — NOT behind Clerk auth, uses Stripe signature verification
export const stripeWebhookRoute = new Hono().post(
  '/stripe/webhook',
  async (c) => {
    const signature = c.req.header('stripe-signature');
    if (!signature) {
      return c.json(
        {
          code: 'MISSING_SIGNATURE',
          message: 'Missing Stripe-Signature header',
        },
        400
      );
    }

    // TODO: Verify signature using Stripe signing secret from typed config
    // const stripe = new Stripe(config.STRIPE_WEBHOOK_SECRET);
    // const event = stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);

    // TODO: Parse event, handle subscription lifecycle events:
    //   - customer.subscription.created
    //   - customer.subscription.updated
    //   - customer.subscription.deleted
    //   - invoice.payment_succeeded
    //   - invoice.payment_failed
    // TODO: Update local DB and Workers KV with subscription state
    // TODO: Idempotent handling — check lastStripeEventTimestamp to skip out-of-order events
    return c.json({ received: true });
  }
);
