import { Hono } from 'hono';

// Stripe webhook — NOT behind Clerk auth, uses Stripe signature verification
export const stripeWebhookRoute = new Hono().post(
  '/stripe/webhook',
  async (c) => {
    // TODO: Verify Stripe signature from c.req.header('stripe-signature')
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
