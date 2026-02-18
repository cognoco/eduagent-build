// ---------------------------------------------------------------------------
// Stripe SDK Wrapper — Sprint 9 Phase 1
// Factory + webhook verification helpers
// ---------------------------------------------------------------------------

import Stripe from 'stripe';

const API_VERSION = '2025-04-30.basil' as Stripe.LatestApiVersion;

/**
 * Creates a configured Stripe client for use in Cloudflare Workers.
 * Uses the fetch-based HTTP client (no Node.js http module needed).
 */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/**
 * Verifies a Stripe webhook signature and returns the parsed event.
 * Wraps `stripe.webhooks.constructEventAsync` for the Workers runtime
 * (which uses the subtle crypto adapter).
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<Stripe.Event> {
  const stripe = createStripeClient('unused');
  return await stripe.webhooks.constructEventAsync(
    payload,
    signature,
    secret,
    undefined,
    Stripe.createSubtleCryptoProvider()
  );
}
