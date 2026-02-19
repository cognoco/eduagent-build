import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  checkoutRequestSchema,
  topUpRequestSchema,
  byokWaitlistSchema,
  familyAddProfileSchema,
  familyRemoveProfileSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  getSubscriptionByAccountId,
  getQuotaPool,
  linkStripeCustomer,
  addToByokWaitlist,
  ensureFreeSubscription,
  markSubscriptionCancelled,
  getTopUpCreditsRemaining,
  getTopUpPriceCents,
  listFamilyMembers,
  addProfileToSubscription,
  removeProfileFromSubscription,
  getFamilyPoolStatus,
} from '../services/billing';
import {
  getWarningLevel,
  calculateRemainingQuestions,
} from '../services/metering';
import { createStripeClient } from '../services/stripe';
import { readSubscriptionStatus } from '../services/kv';
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
    SUBSCRIPTION_KV?: KVNamespace;
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
          cancelAtPeriodEnd: false,
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

    // cancelAtPeriodEnd: subscription has a cancellation date but status is still active
    const cancelAtPeriodEnd =
      subscription.cancelledAt !== null && subscription.status === 'active';

    return c.json({
      subscription: {
        tier: subscription.tier,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd,
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

      // Ensure a subscription row exists so the webhook has something to link
      await ensureFreeSubscription(db, account.id);

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
        subscription_data: {
          metadata: { accountId: account.id, tier },
        },
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
      (updated as any).current_period_end * 1000
    ).toISOString();

    // Mark local DB row so cancelAtPeriodEnd is reflected immediately
    await markSubscriptionCancelled(db, subscription.id);

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

      // Check tier eligibility — Free tier cannot purchase top-ups
      const subscription = await getSubscriptionByAccountId(db, account.id);
      const tier = subscription?.tier ?? 'free';
      const priceCents = getTopUpPriceCents(tier);

      if (priceCents === null) {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Top-up credits are not available on the Free tier. Upgrade to Plus or higher.'
        );
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

      // Resolve Stripe customer
      let customerId = subscription?.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: account.email,
          metadata: { accountId: account.id },
        });
        customerId = customer.id;
        await linkStripeCustomer(db, account.id, customerId);
      }

      // Tier-based pricing: Plus €10/500, Family/Pro €5/500
      const paymentIntent = await stripe.paymentIntents.create({
        amount: priceCents,
        currency: 'eur',
        customer: customerId,
        metadata: {
          accountId: account.id,
          credits: String(amount),
          tier,
        },
      });

      return c.json({
        topUp: {
          amount,
          priceCents,
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
    const topUpCreditsRemaining = await getTopUpCreditsRemaining(
      db,
      subscription.id
    );
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

  // Fast KV-backed subscription status (for header display)
  .get('/subscription/status', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const kv = c.env.SUBSCRIPTION_KV;

    // Try KV first (fast path)
    if (kv) {
      const cached = await readSubscriptionStatus(kv, account.id);
      if (cached) {
        return c.json({
          status: {
            tier: cached.tier,
            status: cached.status,
            monthlyLimit: cached.monthlyLimit,
            usedThisMonth: cached.usedThisMonth,
          },
        });
      }
    }

    // Fallback to DB
    const subscription = await getSubscriptionByAccountId(db, account.id);
    if (!subscription) {
      return c.json({
        status: {
          tier: 'free' as const,
          status: 'trial' as const,
          monthlyLimit: 50,
          usedThisMonth: 0,
        },
      });
    }

    const quota = await getQuotaPool(db, subscription.id);

    return c.json({
      status: {
        tier: subscription.tier,
        status: subscription.status,
        monthlyLimit: quota?.monthlyLimit ?? 50,
        usedThisMonth: quota?.usedThisMonth ?? 0,
      },
    });
  })

  // Get family members and pool status
  .get('/subscription/family', async (c) => {
    const db = c.get('db');
    const account = c.get('account');

    const subscription = await getSubscriptionByAccountId(db, account.id);
    if (!subscription) {
      return notFound(c, 'No subscription found');
    }

    const poolStatus = await getFamilyPoolStatus(db, subscription.id);
    if (!poolStatus) {
      return notFound(c, 'No quota pool found');
    }

    const members = await listFamilyMembers(db, subscription.id);

    return c.json({
      family: {
        ...poolStatus,
        members,
      },
    });
  })

  // Add a profile to the family subscription
  .post(
    '/subscription/family/add',
    zValidator('json', familyAddProfileSchema),
    async (c) => {
      const { profileId } = c.req.valid('json');
      const db = c.get('db');
      const account = c.get('account');

      const subscription = await getSubscriptionByAccountId(db, account.id);
      if (!subscription) {
        return notFound(c, 'No subscription found');
      }

      const result = await addProfileToSubscription(
        db,
        subscription.id,
        profileId
      );

      if (!result) {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Cannot add profile. Subscription tier does not support additional profiles or profile limit reached.'
        );
      }

      return c.json({
        message: 'Profile added to family subscription',
        profileCount: result.profileCount,
      });
    }
  )

  // Remove a profile from the family subscription
  .post(
    '/subscription/family/remove',
    zValidator('json', familyRemoveProfileSchema),
    async (c) => {
      const { profileId, newAccountId } = c.req.valid('json');
      const db = c.get('db');
      const account = c.get('account');

      const subscription = await getSubscriptionByAccountId(db, account.id);
      if (!subscription) {
        return notFound(c, 'No subscription found');
      }

      const result = await removeProfileFromSubscription(
        db,
        subscription.id,
        profileId,
        newAccountId
      );

      if (!result) {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Cannot remove profile. Profile not found, not in this family, or is the subscription owner.'
        );
      }

      return c.json({
        message:
          'Profile removed from family subscription and downgraded to Free tier',
        removedProfileId: result.removedProfileId,
      });
    }
  )

  // Join BYOK waitlist
  .post('/byok-waitlist', zValidator('json', byokWaitlistSchema), async (c) => {
    const { email } = c.req.valid('json');
    const db = c.get('db');

    await addToByokWaitlist(db, email);

    return c.json({ message: 'Added to BYOK waitlist', email }, 201);
  });
