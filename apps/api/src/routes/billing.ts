import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  checkoutRequestSchema,
  topUpRequestSchema,
  byokWaitlistSchema,
  familyAddProfileSchema,
  // familyRemoveProfileSchema, // disabled until invite/claim flow exists (CR-21)
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
  // removeProfileFromSubscription, // disabled until invite/claim flow exists (CR-21)
  // ProfileRemovalNotImplementedError, // disabled until invite/claim flow exists (CR-21)
  getFamilyPoolStatus,
} from '../services/billing';
import {
  getWarningLevel,
  calculateRemainingQuestions,
} from '../services/metering';
import { getTierConfig } from '../services/subscription';
import { createStripeClient } from '../services/stripe';
import { readSubscriptionStatus } from '../services/kv';
import { apiError, notFound } from '../errors';
import { BRAND_COLOR_PRIMARY } from '../services/brand';
import { createLogger } from '../services/logger';

const logger = createLogger();

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
    const freeTier = getTierConfig('free');

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
          monthlyLimit: freeTier.monthlyQuota,
          usedThisMonth: 0,
          remainingQuestions: freeTier.monthlyQuota,
          dailyLimit: freeTier.dailyLimit,
          usedToday: 0,
          dailyRemainingQuestions: freeTier.dailyLimit,
        },
      });
    }

    // Fetch quota pool for enriched response
    const quota = await getQuotaPool(db, subscription.id);
    const monthlyLimit = quota?.monthlyLimit ?? freeTier.monthlyQuota;
    const usedThisMonth = quota?.usedThisMonth ?? 0;
    const remaining = Math.max(0, monthlyLimit - usedThisMonth);
    const dailyLimit = quota?.dailyLimit ?? null;
    const usedToday = quota?.usedToday ?? 0;
    const dailyRemainingQuestions =
      dailyLimit !== null ? Math.max(0, dailyLimit - usedToday) : null;

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
        dailyLimit,
        usedToday,
        dailyRemainingQuestions,
      },
    });
  })

  // Create Stripe Checkout session
  // Dormant for mobile — kept for future web client. Mobile uses RevenueCat IAP.
  .post(
    '/subscription/checkout',
    zValidator('json', checkoutRequestSchema),
    async (c) => {
      const { tier, interval } = c.req.valid('json');
      const db = c.get('db');
      const account = c.get('account');

      // BUG-77: Return 404 (not 500) when Stripe is unconfigured — these
      // endpoints are dormant for mobile. 404 communicates "feature not
      // available" rather than misleading "server error".
      const stripeKey = c.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return notFound(c, 'Stripe web billing is not currently enabled');
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

      const appUrl = c.env.APP_URL ?? 'https://www.mentomate.com';
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
  // Dormant for mobile — kept for future web client. Mobile cancellation
  // handled by platform subscription management (App Store / Google Play).
  .post('/subscription/cancel', async (c) => {
    const db = c.get('db');
    const account = c.get('account');

    const subscription = await getSubscriptionByAccountId(db, account.id);
    if (!subscription?.stripeSubscriptionId) {
      return notFound(c, 'No active subscription to cancel');
    }

    // BUG-77: 404 when Stripe unconfigured (dormant for mobile)
    const stripeKey = c.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return notFound(c, 'Stripe web billing is not currently enabled');
    }

    const stripe = createStripeClient(stripeKey);
    const updated = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    // BUG-51 (re-apply 1C.8): Read subscription-level current_period_end first,
    // with item-level as fallback. The subscription-level field is reliably
    // present on cancel responses even in Stripe SDK v20.
    const raw = updated as unknown as { current_period_end?: number };
    const subscriptionLevelEnd =
      typeof raw.current_period_end === 'number'
        ? raw.current_period_end
        : undefined;
    const itemLevelEnd = updated.items.data[0]?.current_period_end;
    const periodEndTs = subscriptionLevelEnd ?? itemLevelEnd;
    if (!periodEndTs) {
      // [logging sweep] structured logger so PII fields land as JSON context
      logger.error(
        '[billing] Subscription returned no current_period_end — falling back to current timestamp',
        {
          stripeSubscriptionId: subscription.stripeSubscriptionId,
        }
      );
    }
    const currentPeriodEnd = periodEndTs
      ? new Date(periodEndTs * 1000).toISOString()
      : new Date().toISOString();

    // Mark local DB row so cancelAtPeriodEnd is reflected immediately
    await markSubscriptionCancelled(db, subscription.id);

    return c.json({
      message:
        'Subscription cancelled. Access continues until end of billing period.',
      currentPeriodEnd,
    });
  })

  // Purchase top-up credits via Stripe Payment Intent
  // Dormant for mobile — kept for future web client. Mobile top-ups use
  // RevenueCat consumable IAP (see subscription.tsx handleTopUp).
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

      // BUG-77: 404 when Stripe unconfigured (dormant for mobile)
      const stripeKey = c.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return notFound(c, 'Stripe web billing is not currently enabled');
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
    const freeTier = getTierConfig('free');

    const subscription = await getSubscriptionByAccountId(db, account.id);

    if (!subscription) {
      return c.json({
        usage: {
          monthlyLimit: freeTier.monthlyQuota,
          usedThisMonth: 0,
          remainingQuestions: freeTier.monthlyQuota,
          topUpCreditsRemaining: 0,
          warningLevel: 'none' as const,
          cycleResetAt: new Date().toISOString(),
          dailyLimit: freeTier.dailyLimit,
          usedToday: 0,
          dailyRemainingQuestions: freeTier.dailyLimit,
        },
      });
    }

    const quota = await getQuotaPool(db, subscription.id);
    const monthlyLimit = quota?.monthlyLimit ?? freeTier.monthlyQuota;
    const usedThisMonth = quota?.usedThisMonth ?? 0;
    const dailyLimit = quota?.dailyLimit ?? null;
    const usedToday = quota?.usedToday ?? 0;
    const topUpCreditsRemaining = await getTopUpCreditsRemaining(
      db,
      subscription.id
    );
    const remaining = calculateRemainingQuestions({
      monthlyLimit,
      usedThisMonth,
      topUpCreditsRemaining,
      dailyLimit,
      usedToday,
    });
    const warningLevel = getWarningLevel(usedThisMonth, monthlyLimit);
    const dailyRemainingQuestions =
      dailyLimit !== null ? Math.max(0, dailyLimit - usedToday) : null;

    return c.json({
      usage: {
        monthlyLimit,
        usedThisMonth,
        remainingQuestions: remaining,
        topUpCreditsRemaining,
        warningLevel,
        cycleResetAt: quota?.cycleResetAt ?? new Date().toISOString(),
        dailyLimit,
        usedToday,
        dailyRemainingQuestions,
      },
    });
  })

  // Create Stripe Customer Portal session
  // Dormant for mobile — kept for future web client. Mobile billing managed
  // through platform subscription management (App Store / Google Play).
  .post('/subscription/portal', async (c) => {
    const db = c.get('db');
    const account = c.get('account');

    const subscription = await getSubscriptionByAccountId(db, account.id);
    if (!subscription?.stripeCustomerId) {
      return notFound(c, 'No billing account found');
    }

    // BUG-77: 404 when Stripe unconfigured (dormant for mobile)
    const stripeKey = c.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return notFound(c, 'Stripe web billing is not currently enabled');
    }

    const stripe = createStripeClient(stripeKey);
    const appUrl = c.env.APP_URL ?? 'https://www.mentomate.com';

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
    const freeTier = getTierConfig('free');

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
            dailyLimit: cached.dailyLimit,
            usedToday: cached.usedToday,
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
          monthlyLimit: freeTier.monthlyQuota,
          usedThisMonth: 0,
          dailyLimit: freeTier.dailyLimit,
          usedToday: 0,
        },
      });
    }

    const quota = await getQuotaPool(db, subscription.id);

    return c.json({
      status: {
        tier: subscription.tier,
        status: subscription.status,
        monthlyLimit: quota?.monthlyLimit ?? freeTier.monthlyQuota,
        usedThisMonth: quota?.usedThisMonth ?? 0,
        dailyLimit: quota?.dailyLimit ?? null,
        usedToday: quota?.usedToday ?? 0,
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

  // ---------------------------------------------------------------------------
  // Family profile removal — disabled until invite/claim flow exists (CR-21)
  // ---------------------------------------------------------------------------
  // .post(
  //   '/subscription/family/remove',
  //   zValidator('json', familyRemoveProfileSchema),
  //   async (c) => {
  //     const { profileId, newAccountId } = c.req.valid('json');
  //     const db = c.get('db');
  //     const account = c.get('account');
  //
  //     const subscription = await getSubscriptionByAccountId(db, account.id);
  //     if (!subscription) {
  //       return notFound(c, 'No subscription found');
  //     }
  //
  //     let result: { removedProfileId: string } | null;
  //     try {
  //       result = await removeProfileFromSubscription(
  //         db,
  //         subscription.id,
  //         profileId,
  //         newAccountId
  //       );
  //     } catch (err) {
  //       if (err instanceof ProfileRemovalNotImplementedError) {
  //         return apiError(
  //           c,
  //           422,
  //           ERROR_CODES.NOT_IMPLEMENTED,
  //           'Profile removal is not yet implemented. An invite/claim flow is required.'
  //         );
  //       }
  //       throw err;
  //     }
  //
  //     if (!result) {
  //       return apiError(
  //         c,
  //         403,
  //         ERROR_CODES.FORBIDDEN,
  //         'Cannot remove profile. Profile not found, not in this family, or is the subscription owner.'
  //       );
  //     }
  //
  //     return c.json({
  //       message:
  //         'Profile removed from family subscription and downgraded to Free tier',
  //       removedProfileId: result.removedProfileId,
  //     });
  //   }
  // )

  // Join BYOK waitlist
  .post('/byok-waitlist', zValidator('json', byokWaitlistSchema), async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    // Use the authenticated account's email — never trust caller-supplied email
    const email = account.email;

    await addToByokWaitlist(db, email);

    return c.json({ message: 'Added to BYOK waitlist', email }, 201);
  })

  // ---------------------------------------------------------------------------
  // Stripe Checkout landing pages [UX-DE-M10]
  // Stripe redirects to these after checkout. They are public (no auth needed
  // here — Stripe appends session_id which is opaque) and render a minimal
  // HTML page so the user always has at least one actionable path.
  // ---------------------------------------------------------------------------

  /**
   * GET /billing/success
   *
   * Post-checkout success landing page. Stripe redirects here after a
   * successful payment with ?session_id=... appended automatically.
   */
  .get('/billing/success', (c) => {
    return c.html(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Subscription confirmed — MentoMate</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f9fa; color: #1a1a2e;
      min-height: 100vh; display: flex; align-items: center;
      justify-content: center; padding: 24px;
    }
    .card {
      background: #fff; border-radius: 16px; padding: 40px 32px;
      max-width: 440px; width: 100%;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center;
    }
    .logo { font-size: 28px; font-weight: 700; color: ${BRAND_COLOR_PRIMARY}; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
    p { font-size: 16px; color: #555; line-height: 1.5; margin-bottom: 16px; }
    .btn {
      display: block; width: 100%; padding: 14px 24px; border-radius: 12px;
      font-size: 16px; font-weight: 600; text-decoration: none;
      text-align: center; cursor: pointer; border: none; margin-bottom: 12px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: ${BRAND_COLOR_PRIMARY}; color: #fff; }
    .btn-secondary { background: #f0f0f0; color: #333; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">MentoMate</div>
    <h1>Subscription confirmed!</h1>
    <p>Your plan is now active. Open the MentoMate app to start learning.</p>
    <a href="mentomate://home" class="btn btn-primary">Open MentoMate</a>
    <a href="https://www.mentomate.com" class="btn btn-secondary">Back to homepage</a>
  </div>
</body>
</html>`
    );
  })

  /**
   * GET /billing/cancel
   *
   * Post-checkout cancellation landing page. Stripe redirects here when the
   * user closes or cancels the checkout flow.
   */
  .get('/billing/cancel', (c) => {
    return c.html(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Checkout cancelled — MentoMate</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f9fa; color: #1a1a2e;
      min-height: 100vh; display: flex; align-items: center;
      justify-content: center; padding: 24px;
    }
    .card {
      background: #fff; border-radius: 16px; padding: 40px 32px;
      max-width: 440px; width: 100%;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center;
    }
    .logo { font-size: 28px; font-weight: 700; color: ${BRAND_COLOR_PRIMARY}; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
    p { font-size: 16px; color: #555; line-height: 1.5; margin-bottom: 16px; }
    .btn {
      display: block; width: 100%; padding: 14px 24px; border-radius: 12px;
      font-size: 16px; font-weight: 600; text-decoration: none;
      text-align: center; cursor: pointer; border: none; margin-bottom: 12px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: ${BRAND_COLOR_PRIMARY}; color: #fff; }
    .btn-secondary { background: #f0f0f0; color: #333; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">MentoMate</div>
    <h1>Checkout cancelled</h1>
    <p>No charge was made. You can upgrade any time from the MentoMate app.</p>
    <a href="mentomate://home" class="btn btn-primary">Back to MentoMate</a>
    <a href="https://www.mentomate.com" class="btn btn-secondary">Back to homepage</a>
  </div>
</body>
</html>`
    );
  });
