import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  checkoutRequestSchema,
  topUpRequestSchema,
  byokWaitlistSchema,
  familyAddProfileSchema,
  familyRemoveProfileSchema,
  ERROR_CODES,
  subscriptionResponseSchema,
  checkoutResponseSchema,
  cancelResponseSchema,
  topUpResponseSchema,
  usageResponseSchema,
  portalResponseSchema,
  subscriptionStatusResponseSchema,
  familyResponseSchema,
  familyAddResponseSchema,
  familyRemoveResponseSchema,
  byokWaitlistResponseSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import type { ClerkIdentity } from '../middleware/account';
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
  getUsageBreakdownForProfile,
  getUsageEventsAvailableSince,
  buildUsageDateLabels,
  addProfileToSubscription,
  removeProfileFromSubscription,
  ProfileRemovalNotImplementedError,
  getFamilyPoolStatus,
  getEffectiveAccessForSubscription,
  getOrProvisionProfileQuotaUsage,
  getStartOfTodayInTimeZone,
} from '../services/billing';
// [CUT-B3 / WI-693] v2 billing reads/writes, selected per-call by the cutover
// flag. Legacy (flag-off) calls are byte-identical. [WI-722] The usage-breakdown
// read is now dispatched too — its v2 twin reads guardianship via the CUT-B2
// reader (not family_links) + usage_events.
import {
  getSubscriptionByAccountIdV2,
  getQuotaPoolV2,
  linkStripeCustomerV2,
  ensureFreeSubscriptionV2,
  markSubscriptionCancelledV2,
  getEffectiveAccessForSubscriptionV2,
  getOrProvisionProfileQuotaUsageV2,
  listFamilyMembersV2,
  addProfileToSubscriptionV2,
  removeProfileFromSubscriptionV2,
  getFamilyPoolStatusV2,
  getUsageBreakdownForProfileV2,
  ProfileRemovalNotImplementedErrorV2,
} from '../services/billing/billing-v2';
import { isIdentityV2Enabled } from '../config';
import {
  resolveWarningLevel,
  calculateRemainingQuestions,
} from '../services/metering';
import {
  getTierConfig,
  tierRequiresProfileContext,
} from '../services/subscription';
import { createStripeClient } from '../services/stripe';
import { resolvePriceId } from '../services/billing-pricing';
import { readSubscriptionStatus } from '../services/kv';
import { apiError, notFound } from '../errors';
import { assertOwnerProfile } from '../services/family-access';
import { BRAND_COLOR_PRIMARY } from '../services/brand';
import { createLogger } from '../services/logger';
import { captureException } from '../services/sentry';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireAccount } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';

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
    // [CUT-B3 / WI-693] Identity-foundation cutover flag. 'false'/unset in every
    // deployed env until the WI-586 flip.
    IDENTITY_V2_ENABLED?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account | undefined;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
    // [CUT-B1] Set on the v2 pre-graph path (no account yet) by accountMiddleware.
    clerkIdentity: ClerkIdentity | undefined;
  };
};

export const billingRoutes = new Hono<BillingRouteEnv>()
  // Get current subscription status
  .get('/subscription', async (c) => {
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));

    // [BUG-644] Only the account owner can read subscription tier/status/limits.
    // Without this gate, a non-owner child profile on the parent's account
    // could read parent's tier, status, trialEndsAt, currentPeriodEnd,
    // cancelAtPeriodEnd, monthlyLimit, dailyLimit — account-level billing
    // information that must not be exposed to children.
    assertOwnerProfile(
      c,
      'Only the account owner can view subscription details.',
    );

    const freeTier = getTierConfig('free');
    const v2 = isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED);

    const subscription = v2
      ? await getSubscriptionByAccountIdV2(db, account.id)
      : await getSubscriptionByAccountId(db, account.id);

    if (!subscription) {
      // No subscription yet -- return free-tier defaults
      return c.json(
        subscriptionResponseSchema.parse({
          subscription: {
            tier: 'free',
            effectiveAccessTier: 'free',
            billingAccess: 'current',
            status: 'trial',
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
        }),
      );
    }

    const access = v2
      ? await getEffectiveAccessForSubscriptionV2(db, subscription.id)
      : await getEffectiveAccessForSubscription(db, subscription.id);
    const effectiveAccessTier =
      access?.effectiveAccessTier ?? subscription.tier;
    const quotaModel = getTierConfig(effectiveAccessTier).quotaModel;
    const activeProfileId = c.get('profileId');
    const profileQuota =
      quotaModel === 'per-profile' && activeProfileId
        ? v2
          ? await getOrProvisionProfileQuotaUsageV2(
              db,
              subscription.id,
              activeProfileId,
              { tier: effectiveAccessTier },
            )
          : await getOrProvisionProfileQuotaUsage(
              db,
              subscription.id,
              activeProfileId,
              { tier: effectiveAccessTier },
            )
        : null;
    const quota = profileQuota
      ? null
      : v2
        ? await getQuotaPoolV2(db, subscription.id)
        : await getQuotaPool(db, subscription.id);
    const monthlyLimit =
      profileQuota?.monthlyLimit ??
      quota?.monthlyLimit ??
      freeTier.monthlyQuota;
    const usedThisMonth =
      profileQuota?.usedThisMonth ?? quota?.usedThisMonth ?? 0;
    const remaining = Math.max(0, monthlyLimit - usedThisMonth);
    const dailyLimit = profileQuota?.dailyLimit ?? quota?.dailyLimit ?? null;
    const usedToday = profileQuota?.usedToday ?? quota?.usedToday ?? 0;
    const dailyRemainingQuestions =
      dailyLimit !== null ? Math.max(0, dailyLimit - usedToday) : null;

    // cancelAtPeriodEnd: subscription has a cancellation date but status is still active
    const cancelAtPeriodEnd =
      subscription.cancelledAt !== null && subscription.status === 'active';

    return c.json(
      subscriptionResponseSchema.parse({
        subscription: {
          tier: subscription.tier,
          effectiveAccessTier,
          billingAccess: access?.billingAccess ?? 'current',
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
      }),
    );
  })

  // Create Stripe Checkout session
  // Dormant for mobile -- kept for future web client. Mobile uses RevenueCat IAP.
  .post(
    '/subscription/checkout',
    zValidator('json', checkoutRequestSchema),
    async (c) => {
      // [WI-137 / DS-048] Owner-profile authorization. Billing operations are
      // account-level; a parent-proxy session must not initiate them on a
      // child profile context.
      assertNotProxyMode(c);
      const { tier, interval } = c.req.valid('json');
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));

      // BUG-77: Return 404 (not 500) when Stripe is unconfigured -- these
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
          `No price configured for ${tier}/${interval}`,
        );
      }

      const stripe = createStripeClient(stripeKey);
      const v2 = isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED);

      // Ensure a subscription row exists so the webhook has something to link
      if (v2) {
        await ensureFreeSubscriptionV2(db, account.id);
      } else {
        await ensureFreeSubscription(db, account.id);
      }

      // Resolve or create Stripe customer
      const subscription = v2
        ? await getSubscriptionByAccountIdV2(db, account.id)
        : await getSubscriptionByAccountId(db, account.id);
      let customerId = subscription?.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: account.email,
          metadata: { accountId: account.id },
        });
        customerId = customer.id;
        if (v2) {
          await linkStripeCustomerV2(db, account.id, customerId);
        } else {
          await linkStripeCustomer(db, account.id, customerId);
        }
      }

      // [BUG-101 / A1-LOW] Fail loudly instead of silently redirecting to
      // production. Previously a missing APP_URL on staging would route the
      // user to mentomate.com/billing/success after paying -- confusing at
      // best and a session-leak vector at worst (the prod web app would
      // receive a checkout session ID that originated on staging).
      const appUrl = c.env.APP_URL;
      if (!appUrl) {
        return apiError(
          c,
          500,
          ERROR_CODES.INTERNAL_ERROR,
          'APP_URL is not configured for this environment',
        );
      }
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
          'Stripe returned no checkout URL',
        );
      }

      return c.json(
        checkoutResponseSchema.parse({
          checkoutUrl: session.url,
          sessionId: session.id,
        }),
      );
    },
  )

  // Cancel subscription (set cancel_at_period_end)
  // Dormant for mobile -- kept for future web client. Mobile cancellation
  // handled by platform subscription management (App Store / Google Play).
  .post('/subscription/cancel', async (c) => {
    // [WI-137 / DS-048] Owner-profile authorization (defense-in-depth alongside
    // the downstream owner check).
    assertNotProxyMode(c);
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));

    // [CR-2026-05-19-H1] Only the account owner can cancel a subscription.
    assertOwnerProfile(c, 'Only the account owner can cancel a subscription.');

    const v2 = isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED);
    const subscription = v2
      ? await getSubscriptionByAccountIdV2(db, account.id)
      : await getSubscriptionByAccountId(db, account.id);
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
      { cancel_at_period_end: true },
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
        '[billing] Subscription returned no current_period_end -- falling back to current timestamp',
        {
          stripeSubscriptionId: subscription.stripeSubscriptionId,
        },
      );
    }
    const currentPeriodEnd = periodEndTs
      ? new Date(periodEndTs * 1000).toISOString()
      : new Date().toISOString();

    // Mark local DB row so cancelAtPeriodEnd is reflected immediately.
    // [CUT-B3 / WI-693] Must write the SAME store the v2 read came from — a v2
    // read + legacy write would stamp subscriptions.cancelled_at while v2 reads
    // keep showing the row uncancelled until a webhook repairs it (split-brain
    // at the flip). subscription.id is shared across stores by the reseed.
    if (v2) {
      await markSubscriptionCancelledV2(db, subscription.id);
    } else {
      await markSubscriptionCancelled(db, subscription.id);
    }

    return c.json(
      cancelResponseSchema.parse({
        message:
          'Subscription cancelled. Access continues until end of billing period.',
        currentPeriodEnd,
      }),
    );
  })

  // Purchase top-up credits via Stripe Payment Intent
  // Dormant for mobile -- kept for future web client. Mobile top-ups use
  // RevenueCat consumable IAP (see subscription.tsx handleTopUp).
  .post(
    '/subscription/top-up',
    zValidator('json', topUpRequestSchema),
    async (c) => {
      // [WI-137 / DS-048] Owner-profile authorization.
      assertNotProxyMode(c);
      const { amount } = c.req.valid('json');
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));

      // [CR-2026-05-19-H1] Only the account owner can purchase top-up credits.
      assertOwnerProfile(
        c,
        'Only the account owner can purchase top-up credits.',
      );

      // Check tier eligibility -- Free tier cannot purchase top-ups
      const v2 = isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED);
      const subscription = v2
        ? await getSubscriptionByAccountIdV2(db, account.id)
        : await getSubscriptionByAccountId(db, account.id);
      const tier = subscription?.tier ?? 'free';
      const priceCents = getTopUpPriceCents(tier);

      if (priceCents === null) {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Top-up credits are not available on the Free tier. Upgrade to Plus or higher.',
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
        if (v2) {
          await linkStripeCustomerV2(db, account.id, customerId);
        } else {
          await linkStripeCustomer(db, account.id, customerId);
        }
      }

      // Tier-based pricing: Plus EUR10/500, Family/Pro EUR5/500
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

      return c.json(
        topUpResponseSchema.parse({
          topUp: {
            amount,
            priceCents,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
          },
        }),
      );
    },
  )

  // Get current usage/quota status
  .get('/usage', async (c) => {
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));
    const freeTier = getTierConfig('free');
    const v2 = isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED);

    const subscription = v2
      ? await getSubscriptionByAccountIdV2(db, account.id)
      : await getSubscriptionByAccountId(db, account.id);

    if (!subscription) {
      return c.json(
        usageResponseSchema.parse({
          usage: {
            monthlyLimit: freeTier.monthlyQuota,
            usedThisMonth: 0,
            remainingQuestions: freeTier.monthlyQuota,
            topUpCreditsRemaining: 0,
            warningLevel: 'none',
            cycleResetAt: new Date().toISOString(),
            dailyLimit: freeTier.dailyLimit,
            usedToday: 0,
            dailyRemainingQuestions: freeTier.dailyLimit,
          },
        }),
      );
    }

    const activeProfileId = c.get('profileId');
    const activeProfileMeta = c.get('profileMeta');
    const access = v2
      ? await getEffectiveAccessForSubscriptionV2(db, subscription.id)
      : await getEffectiveAccessForSubscription(db, subscription.id);
    const effectiveAccessTier =
      access?.effectiveAccessTier ?? subscription.tier;
    // Profile-scoped quota views require active profile context before
    // aggregate quota reads; otherwise shared-pool usage can expose
    // family-wide activity to non-owner viewers.
    const tierConfig = getTierConfig(effectiveAccessTier);
    const { quotaModel, supportsProfileBreakdown } = tierConfig;
    if (tierRequiresProfileContext(effectiveAccessTier) && !activeProfileId) {
      return apiError(
        c,
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Active profile required to view usage.',
      );
    }
    const profileQuota =
      quotaModel === 'per-profile' && activeProfileId
        ? v2
          ? await getOrProvisionProfileQuotaUsageV2(
              db,
              subscription.id,
              activeProfileId,
              { tier: effectiveAccessTier },
            )
          : await getOrProvisionProfileQuotaUsage(
              db,
              subscription.id,
              activeProfileId,
              { tier: effectiveAccessTier },
            )
        : null;
    const [quota, topUpCreditsRemaining] =
      quotaModel === 'per-profile' && profileQuota
        ? [
            null,
            profileQuota.role === 'owner'
              ? await getTopUpCreditsRemaining(
                  db,
                  subscription.id,
                  new Date(),
                  activeProfileId,
                )
              : 0,
          ]
        : await Promise.all([
            v2
              ? getQuotaPoolV2(db, subscription.id)
              : getQuotaPool(db, subscription.id),
            getTopUpCreditsRemaining(db, subscription.id),
          ]);
    const monthlyLimit =
      profileQuota?.monthlyLimit ??
      quota?.monthlyLimit ??
      freeTier.monthlyQuota;
    const usedThisMonth =
      profileQuota?.usedThisMonth ?? quota?.usedThisMonth ?? 0;
    const dailyLimit = profileQuota?.dailyLimit ?? quota?.dailyLimit ?? null;
    const usedToday = profileQuota?.usedToday ?? quota?.usedToday ?? 0;
    const remaining = calculateRemainingQuestions({
      monthlyLimit,
      usedThisMonth,
      topUpCreditsRemaining,
      dailyLimit,
      usedToday,
    });
    // [BUG-640] Emit 'top-up-available' when monthly exhausted but credits remain
    const warningLevel = resolveWarningLevel(
      usedThisMonth,
      monthlyLimit,
      topUpCreditsRemaining,
    );
    const cycleResetAt =
      profileQuota?.cycleResetAt ??
      quota?.cycleResetAt ??
      new Date().toISOString();
    const resetDate = new Date(cycleResetAt);
    const cycleStartAt =
      subscription.currentPeriodStart ??
      new Date(
        Date.UTC(resetDate.getUTCFullYear(), resetDate.getUTCMonth() - 1, 1),
      ).toISOString();
    // Day start in account timezone (defaults to UTC). Used to scope today's
    // per-profile usage so non-owner viewers don't see family-wide aggregates.
    const dayStartAt = (() => {
      try {
        return getStartOfTodayInTimeZone(
          new Date(),
          account.timezone ?? 'UTC',
        ).toISOString();
      } catch (err) {
        // Structured warn + Sentry (not silent recovery) so the timezone-fallback rate is queryable.
        logger.warn(
          '[billing] invalid timezone in dayStartAt — fell back to UTC',
          {
            event: 'billing.dayStartAt.timezone_fallback',
            requestedTimezone: account.timezone ?? null,
            error: err instanceof Error ? err.message : String(err),
          },
        );
        captureException(err, {
          extra: {
            context: 'billing.usage.dayStartAt',
            accountId: account.id,
            requestedTimezone: account.timezone ?? null,
          },
        });
        const now = new Date();
        return new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        ).toISOString();
      }
    })();
    // [WI-722] Dispatched to the v2 twin under the cutover flag — the same
    // per-route `v2 ? fnV2 : fn` ternary CUT-B3 uses for every other billing-v2
    // seam. The v2 twin reads guardianship via the CUT-B2 reader (not
    // family_links) + usage_events; the legacy path stays the live one in every
    // deployed env (flag-off) until the WI-586 flip and is byte-identical.
    const usageBreakdown =
      activeProfileId && supportsProfileBreakdown
        ? v2
          ? await getUsageBreakdownForProfileV2(db, {
              subscriptionId: subscription.id,
              activeProfileId,
              monthlyLimit,
              cycleStartAt,
              dayStartAt,
            })
          : await getUsageBreakdownForProfile(db, {
              subscriptionId: subscription.id,
              activeProfileId,
              monthlyLimit,
              cycleStartAt,
              dayStartAt,
            })
        : null;
    const visibleUsedThisMonth =
      usageBreakdown && !usageBreakdown.isOwnerBreakdownViewer
        ? (usageBreakdown.selfUsedThisMonth ?? 0)
        : usedThisMonth;
    const visibleRemaining = remaining;
    const visibleWarningLevel = usageBreakdown?.isOwnerBreakdownViewer
      ? warningLevel
      : // [BUG-640] top-up credits are pool-level, apply to all viewers
        resolveWarningLevel(
          visibleUsedThisMonth,
          monthlyLimit,
          topUpCreditsRemaining,
        );
    // Non-owner viewers must see only their own daily usage; the
    // subscription-level `usedToday` is a family aggregate that would let a
    // child infer siblings' activity. Owners and non-family accounts see raw.
    const visibleUsedToday =
      usageBreakdown && !usageBreakdown.isOwnerBreakdownViewer
        ? (usageBreakdown.selfUsedToday ?? 0)
        : usedToday;
    const visibleDailyRemainingQuestions =
      dailyLimit !== null ? Math.max(0, dailyLimit - visibleUsedToday) : null;
    const labels = buildUsageDateLabels({
      resetsAt: cycleResetAt,
      renewsAt: subscription.currentPeriodEnd,
      timezone: account.timezone,
      locale: activeProfileMeta?.conversationLanguage,
    });

    return c.json(
      usageResponseSchema.parse({
        usage: {
          monthlyLimit,
          usedThisMonth: visibleUsedThisMonth,
          remainingQuestions: visibleRemaining,
          topUpCreditsRemaining,
          warningLevel: visibleWarningLevel,
          cycleResetAt,
          dailyLimit,
          usedToday: visibleUsedToday,
          dailyRemainingQuestions: visibleDailyRemainingQuestions,
          ...(usageBreakdown
            ? {
                byProfile: usageBreakdown.byProfile,
                familyAggregate: usageBreakdown.familyAggregate,
                perProfileAvailableSince: getUsageEventsAvailableSince(),
                ...labels,
              }
            : labels),
        },
      }),
    );
  })

  // Create Stripe Customer Portal session
  // Dormant for mobile -- kept for future web client. Mobile billing managed
  // through platform subscription management (App Store / Google Play).
  .post('/subscription/portal', async (c) => {
    // [WI-137 / DS-048] Owner-profile authorization (defense-in-depth alongside
    // the downstream owner check).
    assertNotProxyMode(c);
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));

    // [CR-2026-05-19-H1] Only the account owner can access the billing portal.
    assertOwnerProfile(
      c,
      'Only the account owner can access the billing portal.',
    );

    const v2 = isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED);
    const subscription = v2
      ? await getSubscriptionByAccountIdV2(db, account.id)
      : await getSubscriptionByAccountId(db, account.id);
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

    return c.json(portalResponseSchema.parse({ portalUrl: portalSession.url }));
  })

  // Fast KV-backed subscription status (for header display)
  .get('/subscription/status', async (c) => {
    const db = c.get('db');
    // [CUT-B1 §2.2a] v2 pre-graph: a graphless owner (clerkIdentity set, no
    // account/graph yet) has no subscription. The pre-graph allowlist routes
    // this GET here to return free-tier defaults — NOT a 401 — so a
    // pre-onboarding header/app-load fetch does not trip the client's
    // 401→sign-out loop. Mirrors GET /v1/profiles' pre-graph branch.
    if (
      isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED) &&
      !c.get('account') &&
      c.get('clerkIdentity')
    ) {
      const preGraphFreeTier = getTierConfig('free');
      return c.json(
        subscriptionStatusResponseSchema.parse({
          status: {
            tier: 'free',
            effectiveAccessTier: 'free',
            billingAccess: 'current',
            status: 'trial',
            monthlyLimit: preGraphFreeTier.monthlyQuota,
            usedThisMonth: 0,
            dailyLimit: preGraphFreeTier.dailyLimit,
            usedToday: 0,
          },
        }),
      );
    }
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));

    // [BUG-825] Mirror the owner gate on GET /subscription (line 100). Without
    // this, a non-owner child profile (mode=family, isOwner=false) can read
    // tier, effectiveAccessTier, billingAccess, status, monthlyLimit,
    // usedThisMonth, dailyLimit, usedToday from the parent's account — the
    // exact account-level billing-state leak BUG-644 added owner-gating for
    // on /subscription. AGENTS.md billing rules forbid this class of leak.
    assertOwnerProfile(
      c,
      'Only the account owner can view subscription status.',
    );

    const kv = c.env.SUBSCRIPTION_KV;
    const freeTier = getTierConfig('free');
    const v2 = isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED);

    // Try KV first (fast path).
    // [BUG-97 / A1-MED] Wrap KV read in try/catch -- KV outages must not 500.
    // Per AGENTS.md "Silent recovery without escalation is banned": fall
    // through to the DB path but emit Sentry + structured log on KV failure
    // so we can detect cache outages, not just observe slow latency.
    if (kv) {
      try {
        const cached = await readSubscriptionStatus(kv, account.id);
        const cachedEffectiveAccessTier =
          cached?.effectiveAccessTier ?? cached?.tier;
        if (
          cached &&
          cachedEffectiveAccessTier &&
          getTierConfig(cachedEffectiveAccessTier).quotaModel === 'shared-pool'
        ) {
          return c.json(
            subscriptionStatusResponseSchema.parse({
              status: {
                tier: cached.tier,
                effectiveAccessTier: cachedEffectiveAccessTier,
                billingAccess: cached.billingAccess ?? 'current',
                status: cached.status,
                monthlyLimit: cached.monthlyLimit,
                usedThisMonth: cached.usedThisMonth,
                dailyLimit: cached.dailyLimit,
                usedToday: cached.usedToday,
              },
            }),
          );
        }
      } catch (err) {
        logger.error(
          '[billing] readSubscriptionStatus KV read failed -- falling back to DB',
          {
            accountId: account.id,
            error: err instanceof Error ? err.message : String(err),
          },
        );
        captureException(err, {
          extra: {
            context: 'billing.subscriptionStatus.kvRead',
            accountId: account.id,
          },
        });
        // Fall through to DB fetch below.
      }
    }

    // Fallback to DB
    const subscription = v2
      ? await getSubscriptionByAccountIdV2(db, account.id)
      : await getSubscriptionByAccountId(db, account.id);
    if (!subscription) {
      return c.json(
        subscriptionStatusResponseSchema.parse({
          status: {
            tier: 'free',
            effectiveAccessTier: 'free',
            billingAccess: 'current',
            status: 'trial',
            monthlyLimit: freeTier.monthlyQuota,
            usedThisMonth: 0,
            dailyLimit: freeTier.dailyLimit,
            usedToday: 0,
          },
        }),
      );
    }

    const access = v2
      ? await getEffectiveAccessForSubscriptionV2(db, subscription.id)
      : await getEffectiveAccessForSubscription(db, subscription.id);
    const effectiveAccessTier =
      access?.effectiveAccessTier ?? subscription.tier;
    const quotaModel = getTierConfig(effectiveAccessTier).quotaModel;
    const activeProfileId = c.get('profileId');
    if (quotaModel === 'per-profile' && !activeProfileId) {
      return apiError(
        c,
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Profile required for per-profile quota status.',
      );
    }
    const profileQuota =
      quotaModel === 'per-profile' && activeProfileId
        ? v2
          ? await getOrProvisionProfileQuotaUsageV2(
              db,
              subscription.id,
              activeProfileId,
              { tier: effectiveAccessTier },
            )
          : await getOrProvisionProfileQuotaUsage(
              db,
              subscription.id,
              activeProfileId,
              { tier: effectiveAccessTier },
            )
        : null;
    const quota = profileQuota
      ? null
      : v2
        ? await getQuotaPoolV2(db, subscription.id)
        : await getQuotaPool(db, subscription.id);

    return c.json(
      subscriptionStatusResponseSchema.parse({
        status: {
          tier: subscription.tier,
          effectiveAccessTier,
          billingAccess: access?.billingAccess ?? 'current',
          status: subscription.status,
          monthlyLimit:
            profileQuota?.monthlyLimit ??
            quota?.monthlyLimit ??
            freeTier.monthlyQuota,
          usedThisMonth:
            profileQuota?.usedThisMonth ?? quota?.usedThisMonth ?? 0,
          dailyLimit: profileQuota?.dailyLimit ?? quota?.dailyLimit ?? null,
          usedToday: profileQuota?.usedToday ?? quota?.usedToday ?? 0,
        },
      }),
    );
  })

  // Get family members and pool status
  .get('/subscription/family', async (c) => {
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));

    // [BUG-645] isOwner gate parity with /family/add and /family/remove.
    // Without this, a non-owner child active on the parent's account could
    // read family pool status (tier/monthlyLimit/usedThisMonth/profileCount)
    // and the full members list — sibling identities and account-level
    // billing data. Sibling write routes already gate; the read route did not.
    assertOwnerProfile(
      c,
      'Only the family owner can view family subscription details.',
    );

    const v2 = isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED);
    const subscription = v2
      ? await getSubscriptionByAccountIdV2(db, account.id)
      : await getSubscriptionByAccountId(db, account.id);
    if (!subscription) {
      return notFound(c, 'No subscription found');
    }

    const poolStatus = v2
      ? await getFamilyPoolStatusV2(db, subscription.id)
      : await getFamilyPoolStatus(db, subscription.id);
    if (!poolStatus) {
      return notFound(c, 'No quota pool found');
    }

    const members = v2
      ? await listFamilyMembersV2(db, subscription.id)
      : await listFamilyMembers(db, subscription.id);

    return c.json(
      familyResponseSchema.parse({
        family: {
          ...poolStatus,
          members,
        },
      }),
    );
  })

  // Add a profile to the family subscription
  .post(
    '/subscription/family/add',
    zValidator('json', familyAddProfileSchema),
    async (c) => {
      // [WI-137 / DS-048] Owner-profile authorization.
      assertNotProxyMode(c);
      const { profileId } = c.req.valid('json');
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));

      // [BUG-94 / A1-HIGH] isOwner gate parity with /family/remove. Without
      // this, a non-owner child active on the parent's account could add
      // arbitrary profiles to the family subscription while only the parent
      // (owner) can remove them -- asymmetric and exploitable.
      assertOwnerProfile(
        c,
        'Only the family owner can add a profile to the family subscription.',
      );

      const v2 = isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED);
      const subscription = v2
        ? await getSubscriptionByAccountIdV2(db, account.id)
        : await getSubscriptionByAccountId(db, account.id);
      if (!subscription) {
        return notFound(c, 'No subscription found');
      }

      const result = v2
        ? await addProfileToSubscriptionV2(db, subscription.id, profileId)
        : await addProfileToSubscription(db, subscription.id, profileId);

      if (!result) {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Cannot add profile. Subscription tier does not support additional profiles or profile limit reached.',
        );
      }

      return c.json(
        familyAddResponseSchema.parse({
          message: 'Profile added to family subscription',
          profileCount: result.profileCount,
        }),
      );
    },
  )

  // Remove a same-account child profile from the family subscription.
  // Cross-account detachment stays disabled until invite/claim exists.
  .post(
    '/subscription/family/remove',
    zValidator('json', familyRemoveProfileSchema),
    async (c) => {
      // [WI-137 / DS-048] Owner-profile authorization.
      assertNotProxyMode(c);
      const { profileId } = c.req.valid('json');
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));

      assertOwnerProfile(
        c,
        'Only the family owner can remove a profile from the family subscription.',
      );

      const v2 = isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED);
      const subscription = v2
        ? await getSubscriptionByAccountIdV2(db, account.id)
        : await getSubscriptionByAccountId(db, account.id);
      if (!subscription) {
        return notFound(c, 'No subscription found');
      }

      let result: { removedProfileId: string } | null;
      try {
        result = v2
          ? await removeProfileFromSubscriptionV2(
              db,
              subscription.id,
              profileId,
            )
          : await removeProfileFromSubscription(db, subscription.id, profileId);
      } catch (err) {
        // Both the legacy and v2 not-implemented errors carry the same name; the
        // v2 path throws its own class, so accept either.
        if (
          err instanceof ProfileRemovalNotImplementedError ||
          err instanceof ProfileRemovalNotImplementedErrorV2
        ) {
          return apiError(
            c,
            422,
            ERROR_CODES.CONFLICT,
            'Cross-account profile removal requires an invite/claim flow.',
          );
        }
        throw err;
      }

      if (!result) {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Cannot remove profile. Profile not found, not in this family, or is the subscription owner.',
        );
      }

      return c.json(
        familyRemoveResponseSchema.parse({
          message: 'Profile removed from family subscription',
          removedProfileId: result.removedProfileId,
        }),
      );
    },
  )

  // Join BYOK waitlist
  .post('/byok-waitlist', zValidator('json', byokWaitlistSchema), async (c) => {
    // [WI-137 / DS-048] Owner-profile authorization for waitlist signup.
    assertNotProxyMode(c);
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));
    // Use the authenticated account's email -- never trust caller-supplied email
    const email = account.email;

    await addToByokWaitlist(db, email);

    return c.json(
      byokWaitlistResponseSchema.parse({
        message: 'Added to BYOK waitlist',
        email,
      }),
      201,
    );
  })

  // ---------------------------------------------------------------------------
  // Stripe Checkout landing pages [UX-DE-M10]
  // Stripe redirects to these after checkout. They are public (no auth needed
  // here -- Stripe appends session_id which is opaque) and render a minimal
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
  <title>Subscription confirmed -- MentoMate</title>
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
</html>`,
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
  <title>Checkout cancelled -- MentoMate</title>
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
</html>`,
    );
  });
