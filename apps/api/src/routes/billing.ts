import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  checkoutRequestSchema,
  topUpRequestSchema,
  byokWaitlistSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { byokWaitlist } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  getSubscriptionByAccountId,
  getQuotaPool,
  linkStripeCustomer,
} from '../services/billing';
import {
  getWarningLevel,
  calculateRemainingQuestions,
} from '../services/metering';
import { createStripeClient } from '../services/stripe';
import { apiError, notFound } from '../errors';

type BillingRouteEnv = {
  Bindings: {
    CLERK_JWKS_URL?: string;
    DATABASE_URL: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_PRICE_PLUS_MONTHLY?: string;
    STRIPE_PRICE_PLUS_YEARLY?: string;
    STRIPE_PRICE_FAMILY_MONTHLY?: string;
    STRIPE_PRICE_FAMILY_YEARLY?: string;
    STRIPE_PRICE_PRO_MONTHLY?: string;
    STRIPE_PRICE_PRO_YEARLY?: string;
    APP_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
  };
};

/**
 * Maps a tier + interval to the corresponding Stripe price ID from env bindings.
 */
function resolvePriceId(
  env: BillingRouteEnv['Bindings'],
  tier: 'plus' | 'family' | 'pro',
  interval: 'monthly' | 'yearly'
): string | undefined {
  const key =
    `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}` as keyof typeof env;
  return env[key] as string | undefined;
}

export const billingRoutes = new Hono<BillingRouteEnv>()
  // Get current subscription status
  .get('/subscription', async (c) => {
    const db = c.get('db');
    const account = c.get('account');

    const subscription = await getSubscriptionByAccountId(db, account.id);

    if (!subscription) {
      // No subscription yet — return free-tier defaults
      return c.json({
        subscription: {
          tier: 'free' as const,
          status: 'trial' as const,
          trialEndsAt: null,
          currentPeriodEnd: null,
          monthlyLimit: 50,
          usedThisMonth: 0,
          remainingQuestions: 50,
        },
      });
    }

    // Fetch quota pool for enriched response
    const quota = await getQuotaPool(db, subscription.id);
    const monthlyLimit = quota?.monthlyLimit ?? 50;
    const usedThisMonth = quota?.usedThisMonth ?? 0;
    const remaining = Math.max(0, monthlyLimit - usedThisMonth);

    return c.json({
      subscription: {
        tier: subscription.tier,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
        monthlyLimit,
        usedThisMonth,
        remainingQuestions: remaining,
      },
    });
  })

  // Create Stripe Checkout session
  .post(
    '/subscription/checkout',
    zValidator('json', checkoutRequestSchema),
    async (c) => {
      const { tier, interval } = c.req.valid('json');
      const db = c.get('db');
      const account = c.get('account');

      const stripeKey = c.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return apiError(
          c,
          500,
          ERROR_CODES.INTERNAL_ERROR,
          'Stripe is not configured'
        );
      }

      const priceId = resolvePriceId(c.env, tier, interval);
      if (!priceId) {
        return apiError(
          c,
          400,
          ERROR_CODES.VALIDATION_ERROR,
          `No price configured for ${tier}/${interval}`
        );
      }

      const stripe = createStripeClient(stripeKey);

      // Resolve or create Stripe customer
      const subscription = await getSubscriptionByAccountId(db, account.id);
      let customerId = subscription?.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: account.email,
          metadata: { accountId: account.id },
        });
        customerId = customer.id;
        await linkStripeCustomer(db, account.id, customerId);
      }

      const appUrl = c.env.APP_URL ?? 'https://app.eduagent.com';
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/billing/cancel`,
        metadata: { accountId: account.id, tier, interval },
      });

      if (!session.url) {
        return apiError(
          c,
          500,
          ERROR_CODES.INTERNAL_ERROR,
          'Stripe returned no checkout URL'
        );
      }

      return c.json({
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    }
  )

  // Cancel subscription (set cancel_at_period_end)
  .post('/subscription/cancel', async (c) => {
    const db = c.get('db');
    const account = c.get('account');

    const subscription = await getSubscriptionByAccountId(db, account.id);
    if (!subscription?.stripeSubscriptionId) {
      return notFound(c, 'No active subscription to cancel');
    }

    const stripeKey = c.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return apiError(
        c,
        500,
        ERROR_CODES.INTERNAL_ERROR,
        'Stripe is not configured'
      );
    }

    const stripe = createStripeClient(stripeKey);
    const updated = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    const currentPeriodEnd = new Date(
      updated.current_period_end * 1000
    ).toISOString();

    return c.json({
      message:
        'Subscription cancelled. Access continues until end of billing period.',
      currentPeriodEnd,
    });
  })

  // Purchase top-up credits via Stripe Payment Intent
  .post(
    '/subscription/top-up',
    zValidator('json', topUpRequestSchema),
    async (c) => {
      const { amount } = c.req.valid('json');
      const db = c.get('db');
      const account = c.get('account');

      const stripeKey = c.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return apiError(
          c,
          500,
          ERROR_CODES.INTERNAL_ERROR,
          'Stripe is not configured'
        );
      }

      const stripe = createStripeClient(stripeKey);

      // Resolve Stripe customer
      const subscription = await getSubscriptionByAccountId(db, account.id);
      let customerId = subscription?.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: account.email,
          metadata: { accountId: account.id },
        });
        customerId = customer.id;
        await linkStripeCustomer(db, account.id, customerId);
      }

      // Amount in cents — 500 credits = €4.99
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 499,
        currency: 'eur',
        customer: customerId,
        metadata: { accountId: account.id, credits: String(amount) },
      });

      return c.json({
        topUp: {
          amount,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        },
      });
    }
  )

  // Get current usage/quota status
  .get('/usage', async (c) => {
    const db = c.get('db');
    const account = c.get('account');

    const subscription = await getSubscriptionByAccountId(db, account.id);

    if (!subscription) {
      return c.json({
        usage: {
          monthlyLimit: 50,
          usedThisMonth: 0,
          remainingQuestions: 50,
          topUpCreditsRemaining: 0,
          warningLevel: 'none' as const,
          cycleResetAt: new Date().toISOString(),
        },
      });
    }

    const quota = await getQuotaPool(db, subscription.id);
    const monthlyLimit = quota?.monthlyLimit ?? 50;
    const usedThisMonth = quota?.usedThisMonth ?? 0;
    const topUpCreditsRemaining = 0; // TODO: aggregate from top_up_credits in Phase 4
    const remaining = calculateRemainingQuestions({
      monthlyLimit,
      usedThisMonth,
      topUpCreditsRemaining,
    });
    const warningLevel = getWarningLevel(usedThisMonth, monthlyLimit);

    return c.json({
      usage: {
        monthlyLimit,
        usedThisMonth,
        remainingQuestions: remaining,
        topUpCreditsRemaining,
        warningLevel,
        cycleResetAt: quota?.cycleResetAt ?? new Date().toISOString(),
      },
    });
  })

  // Create Stripe Customer Portal session
  .post('/subscription/portal', async (c) => {
    const db = c.get('db');
    const account = c.get('account');

    const subscription = await getSubscriptionByAccountId(db, account.id);
    if (!subscription?.stripeCustomerId) {
      return notFound(c, 'No billing account found');
    }

    const stripeKey = c.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return apiError(
        c,
        500,
        ERROR_CODES.INTERNAL_ERROR,
        'Stripe is not configured'
      );
    }

    const stripe = createStripeClient(stripeKey);
    const appUrl = c.env.APP_URL ?? 'https://app.eduagent.com';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appUrl}/billing`,
    });

    return c.json({ portalUrl: portalSession.url });
  })

  // Join BYOK waitlist
  .post('/byok-waitlist', zValidator('json', byokWaitlistSchema), async (c) => {
    const { email } = c.req.valid('json');
    const db = c.get('db');

    await db
      .insert(byokWaitlist)
      .values({ email })
      .onConflictDoNothing({ target: byokWaitlist.email });

    return c.json({ message: 'Added to BYOK waitlist', email }, 201);
  });
