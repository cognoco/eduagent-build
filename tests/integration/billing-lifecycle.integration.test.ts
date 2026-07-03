/**
 * Integration: Billing Lifecycle Endpoints
 *
 * Exercises the real billing routes through the full app + real database.
 * Billing services and metering calculations stay real.
 *
 * Mocked boundaries:
 * - JWT verification — intercepted via global fetch mock in setup.ts
 * - Stripe SDK wrapper
 */

import { eq } from 'drizzle-orm';
import {
  generateUUIDv7,
  login,
  membership,
  profileQuotaUsage,
  quotaPools,
  subscription as subscriptionV2,
  subscriptions,
} from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
  isIdentityV2Enabled,
} from './helpers';
import { buildAuthHeaders } from './test-keys';

const mockCustomersCreate = jest.fn();
const mockCheckoutCreate = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockPaymentIntentsCreate = jest.fn();
const mockPortalCreate = jest.fn();

jest.mock(
  // gc1-allow: stripe SDK has no test-time HTTP interception path without real
  // credentials — the Node SDK constructs its own internal fetch and ignores
  // our top-level fetch interceptor. We jest.requireActual() the wrapper and
  // only replace createStripeClient() with a fake whose method tables forward
  // to the per-test mock fns above. TODO: evaluate
  // Stripe.createFetchHttpClient() so the SDK reuses our interceptor; would
  // collapse the mock fns into ordinary route assertions.
  '../../apps/api/src/services/stripe',
  () => {
    const actual = jest.requireActual(
      '../../apps/api/src/services/stripe',
    ) as typeof import('../../apps/api/src/services/stripe');
    return {
      ...actual,
      createStripeClient: jest.fn().mockImplementation(() => ({
        customers: {
          create: (...args: unknown[]) => mockCustomersCreate(...args),
        },
        checkout: {
          sessions: {
            create: (...args: unknown[]) => mockCheckoutCreate(...args),
          },
        },
        subscriptions: {
          update: (...args: unknown[]) => mockSubscriptionsUpdate(...args),
        },
        paymentIntents: {
          create: (...args: unknown[]) => mockPaymentIntentsCreate(...args),
        },
        billingPortal: {
          sessions: {
            create: (...args: unknown[]) => mockPortalCreate(...args),
          },
        },
      })),
    };
  },
);

import { app } from '../../apps/api/src/index';
import {
  ensureV2IdentityForLegacyProfileTest,
  ensureLegacyProfileAnchorForTest,
  legacyIdentityTableExistsForTest,
} from '../../apps/api/src/test-utils/legacy-identity-anchors';
import { findOwnerPersonId } from '../../apps/api/src/services/identity-v2/helpers';
import { getTierConfig } from '../../apps/api/src/services/subscription';

const TEST_ENV = {
  ...buildIntegrationEnv(),
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_PRICE_PLUS_MONTHLY: 'price_plus_monthly',
  STRIPE_PRICE_PLUS_YEARLY: 'price_plus_yearly',
  STRIPE_PRICE_FAMILY_MONTHLY: 'price_family_monthly',
  STRIPE_PRICE_FAMILY_YEARLY: 'price_family_yearly',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly',
  STRIPE_PRICE_PRO_YEARLY: 'price_pro_yearly',
  APP_URL: 'https://app.mentomate.test',
};

const AUTH_USER_ID = 'integration-billing-user';
const AUTH_EMAIL = 'integration-billing@integration.test';
const STRIPE_CURRENT_PERIOD_END = 1_777_680_000;

async function seedAccount() {
  const db = createIntegrationDb();
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  await ensureLegacyProfileAnchorForTest(db, {
    profileId,
    accountId,
    displayName: 'Billing Owner',
    birthYear: 1990,
    isOwner: true,
    clerkUserId: AUTH_USER_ID,
    email: AUTH_EMAIL,
  });

  // [WI-1145] Seed the v2 identity graph unconditionally — the collapsed account
  // middleware resolves the owner via v2 (login/membership) post-WI-867 collapse and
  // returns 401 when v2 identity is absent on the flag-off main lane. Same ids as
  // legacy (person.id == profile.id, organization.id == account.id). The v2
  // subscription seed below is ALSO unconditional: WI-867 collapsed billing
  // GET /v1/subscription to `getSubscriptionByAccountIdV2` (v2-only read, no
  // per-call flag dispatch), so on the post-collapse flag-off main lane the
  // route reads the v2 `subscription` table and quota-provisions against the v2
  // sub id (== legacy sub id) — the legacy `subscriptions` seed alone leaves the
  // v2 read empty and the FK on `profile_quota_usage` unsatisfiable.
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: 'Billing Owner',
    birthYear: 1990,
    clerkUserId: AUTH_USER_ID,
    email: AUTH_EMAIL,
    isOwner: true,
    // [WI-1145] This suite owns the subscription lifecycle in seedSubscription
    // (and the "repair a missing subscription" case needs NO pre-existing sub),
    // so opt out of the anchor's baseline free sub — seedSubscription inserts the
    // legacy+v2 pair with a shared id when a test needs one.
    seedBaselineSubscription: false,
  });

  // Return the seeded owner profileId so callers can supply X-Profile-Id, the
  // explicit-header resolution the owner-only billing gates now require (the
  // real mobile client always sends it). profiles.id === person.id under v2.
  return { account: { id: accountId }, ownerProfileId: profileId };
}

async function seedSubscription(
  accountId: string,
  overrides?: Partial<{
    tier: 'free' | 'plus' | 'family' | 'pro';
    status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    monthlyLimit: number;
    usedThisMonth: number;
    dailyLimit: number | null;
    usedToday: number;
    currentPeriodEnd: Date | null;
    cycleResetAt: Date;
  }>,
) {
  const db = createIntegrationDb();
  const tier = overrides?.tier ?? 'plus';
  const subId = generateUUIDv7();

  if (await legacyIdentityTableExistsForTest(db, 'subscriptions')) {
    await db.insert(subscriptions).values({
      id: subId,
      accountId,
      tier,
      status: overrides?.status ?? 'active',
      stripeCustomerId: overrides?.stripeCustomerId ?? 'cus_existing',
      stripeSubscriptionId: overrides?.stripeSubscriptionId ?? 'sub_existing',
      currentPeriodStart: new Date('2026-04-01T00:00:00.000Z'),
      currentPeriodEnd:
        overrides?.currentPeriodEnd ?? new Date('2026-05-01T00:00:00.000Z'),
    });
  }

  // [WI-1145] Seed the v2 subscription UNCONDITIONALLY (was gated on
  // isIdentityV2Enabled()), with the SAME id as the legacy row. Billing GET
  // /v1/subscription reads v2-only post-WI-867 collapse, then quota-provisions
  // against the read sub id — which FK-references legacy `subscriptions`, so the
  // shared id keeps that FK satisfiable. seedAccount opts out of the anchor
  // baseline sub, so this pair is the only subscription for the org. Pre-collapse
  // the legacy read ignores the v2 row, so it is inert and safe there.
  {
    const ownerPersonId = await findOwnerPersonId(db, accountId);
    if (!ownerPersonId) {
      throw new Error('Owner profile not found for v2 subscription seed');
    }

    await db.insert(subscriptionV2).values({
      id: subId,
      organizationId: accountId,
      planTier: tier,
      status: overrides?.status ?? 'active',
      payerPersonId: ownerPersonId,
      stripeCustomerId: overrides?.stripeCustomerId ?? 'cus_existing',
      stripeSubscriptionId: overrides?.stripeSubscriptionId ?? 'sub_existing',
      periodStartAt: new Date('2026-04-01T00:00:00.000Z'),
      periodEndAt:
        overrides?.currentPeriodEnd ?? new Date('2026-05-01T00:00:00.000Z'),
    });
  }

  const [quotaPool] = await db
    .insert(quotaPools)
    .values({
      subscriptionId: subId,
      monthlyLimit: overrides?.monthlyLimit ?? getTierConfig(tier).monthlyQuota,
      usedThisMonth: overrides?.usedThisMonth ?? 0,
      dailyLimit:
        overrides?.dailyLimit ?? getTierConfig(tier).dailyLimit ?? null,
      usedToday: overrides?.usedToday ?? 0,
      cycleResetAt:
        overrides?.cycleResetAt ?? new Date('2026-05-01T00:00:00.000Z'),
    })
    .returning();

  const config = getTierConfig(tier);
  if (config.quotaModel === 'per-profile') {
    const ownerPersonId = await findOwnerPersonId(db, accountId);

    if (ownerPersonId) {
      await db.insert(profileQuotaUsage).values({
        subscriptionId: subId,
        profileId: ownerPersonId,
        role: 'owner',
        monthlyLimit:
          overrides?.monthlyLimit ??
          config.ownerMonthlyQuota ??
          quotaPool!.monthlyLimit,
        usedThisMonth: overrides?.usedThisMonth ?? 0,
        dailyLimit:
          overrides?.dailyLimit ??
          config.ownerDailyQuota ??
          quotaPool!.dailyLimit,
        usedToday: overrides?.usedToday ?? 0,
        cycleResetAt:
          overrides?.cycleResetAt ?? new Date('2026-05-01T00:00:00.000Z'),
      });
    }
  }

  return {
    subscription: { id: subId },
    quotaPool: quotaPool!,
  };
}

async function loadAccount() {
  const db = createIntegrationDb();
  const loginRow = await db.query.login.findFirst({
    where: eq(login.clerkUserId, AUTH_USER_ID),
    columns: { personId: true },
  });
  if (!loginRow) return undefined;
  const membershipRow = await db.query.membership.findFirst({
    where: eq(membership.personId, loginRow.personId),
    columns: { organizationId: true },
  });
  return membershipRow ? { id: membershipRow.organizationId } : undefined;
}

async function loadSubscription(accountId: string) {
  const db = createIntegrationDb();
  if (isIdentityV2Enabled()) {
    const row = await db.query.subscription.findFirst({
      where: eq(subscriptionV2.organizationId, accountId),
    });
    if (!row) return undefined;
    return {
      id: row.id,
      accountId: row.organizationId,
      tier: row.planTier,
      status: row.status,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      trialEndsAt: row.trialEndsAt,
      currentPeriodStart: row.periodStartAt,
      currentPeriodEnd: row.periodEndAt,
      cancelledAt: row.cancelledAt,
    };
  }

  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.accountId, accountId),
  });
}

async function loadQuotaPool(subscriptionId: string) {
  const db = createIntegrationDb();
  return db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });
}

beforeEach(async () => {
  jest.clearAllMocks();

  mockCustomersCreate.mockResolvedValue({ id: 'cus_checkout' });
  mockCheckoutCreate.mockResolvedValue({
    url: 'https://stripe.test/checkout',
    id: 'cs_checkout',
  });
  mockSubscriptionsUpdate.mockResolvedValue({
    items: {
      data: [{ current_period_end: STRIPE_CURRENT_PERIOD_END }],
    },
  });
  mockPaymentIntentsCreate.mockResolvedValue({
    client_secret: 'pi_secret',
    id: 'pi_test',
  });
  mockPortalCreate.mockResolvedValue({
    url: 'https://stripe.test/portal',
  });

  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

describe('Integration: billing lifecycle routes', () => {
  it('repairs a missing subscription row with the default plus trial', async () => {
    const { ownerProfileId } = await seedAccount();
    const plusTier = getTierConfig('plus');

    const res = await app.request(
      '/v1/subscription',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          ownerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription).toMatchObject({
      tier: 'plus',
      status: 'trial',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      monthlyLimit: plusTier.monthlyQuota,
      usedThisMonth: 0,
      remainingQuestions: plusTier.monthlyQuota,
      dailyLimit: plusTier.dailyLimit,
      usedToday: 0,
      dailyRemainingQuestions: plusTier.dailyLimit,
    });
    expect(Date.parse(body.subscription.trialEndsAt)).not.toBeNaN();
  });

  it('returns subscription details from the real subscription and quota rows', async () => {
    const { account, ownerProfileId } = await seedAccount();
    await seedSubscription(account.id, {
      tier: 'plus',
      status: 'active',
      usedThisMonth: 42,
      dailyLimit: null,
      usedToday: 15,
      currentPeriodEnd: new Date('2026-05-15T00:00:00.000Z'),
    });

    const res = await app.request(
      '/v1/subscription',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          ownerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.tier).toBe('plus');
    expect(body.subscription.status).toBe('active');
    expect(body.subscription.monthlyLimit).toBe(700);
    expect(body.subscription.usedThisMonth).toBe(42);
    expect(body.subscription.remainingQuestions).toBe(658);
    expect(body.subscription.dailyLimit).toBeNull();
    expect(body.subscription.usedToday).toBe(15);
    expect(body.subscription.dailyRemainingQuestions).toBeNull();
  });

  it('creates a checkout session and links the stripe customer on first checkout', async () => {
    const { account, ownerProfileId } = await seedAccount();

    const res = await app.request(
      '/v1/subscription/checkout',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          ownerProfileId,
        ),
        body: JSON.stringify({ tier: 'plus', interval: 'monthly' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkoutUrl).toBe('https://stripe.test/checkout');
    expect(body.sessionId).toBe('cs_checkout');

    // [BUG-827] customers.create now carries a stable per-account idempotency
    // key (second arg) so concurrent creates dedupe to one Stripe customer.
    expect(mockCustomersCreate).toHaveBeenCalledWith(
      {
        email: AUTH_EMAIL,
        metadata: { accountId: account.id },
      },
      { idempotencyKey: `customer-create-${account.id}` },
    );
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_checkout',
        mode: 'subscription',
        metadata: expect.objectContaining({
          accountId: account.id,
          tier: 'plus',
          interval: 'monthly',
        }),
      }),
    );

    const subscription = await loadSubscription(account.id);
    expect(subscription).not.toBeUndefined();
    expect(subscription!.tier).toBe('plus');
    expect(subscription!.status).toBe('trial');
    expect(subscription!.trialEndsAt).not.toBeNull();
    // [WI-1145] The collapsed checkout writes stripeCustomerId to the store it
    // targets — v2 `subscription` post-WI-867, legacy `subscriptions` pre-collapse
    // (the legacy parent ensureLegacySubscriptionParent writes carries tier/status
    // but NOT the stripe customer). Flag is off in both, so assert it landed in
    // EITHER store rather than reading one fixed store.
    const checkoutDb = createIntegrationDb();
    const v2Checkout = await checkoutDb.query.subscription.findFirst({
      where: eq(subscriptionV2.organizationId, account.id),
    });
    const legacyCheckout = await checkoutDb.query.subscriptions.findFirst({
      where: eq(subscriptions.accountId, account.id),
    });
    expect(
      v2Checkout?.stripeCustomerId === 'cus_checkout' ||
        legacyCheckout?.stripeCustomerId === 'cus_checkout',
    ).toBe(true);

    const quotaPool = await loadQuotaPool(subscription!.id);
    expect(quotaPool).not.toBeUndefined();
    expect(quotaPool!.monthlyLimit).toBe(getTierConfig('plus').monthlyQuota);
  });

  it('cancels a subscription and marks the local row immediately', async () => {
    const { account, ownerProfileId } = await seedAccount();
    const seeded = await seedSubscription(account.id, {
      tier: 'plus',
      status: 'active',
      stripeCustomerId: 'cus_cancel',
      stripeSubscriptionId: 'sub_cancel',
    });

    const res = await app.request(
      '/v1/subscription/cancel',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          ownerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain('cancelled');
    expect(body.currentPeriodEnd).toBe(
      new Date(STRIPE_CURRENT_PERIOD_END * 1000).toISOString(),
    );

    // [WI-1145] The collapsed cancel writes cancelledAt + stripeSubscriptionId to
    // the store it targets — v2 `subscription` post-WI-867, legacy `subscriptions`
    // pre-collapse. Flag is off in both, so assert the cancel mutation landed in
    // EITHER store rather than reading one fixed store (loadSubscription's
    // flag-off legacy read would miss the v2-side mutation post-collapse).
    const cancelDb = createIntegrationDb();
    const v2Cancel = await cancelDb.query.subscription.findFirst({
      where: eq(subscriptionV2.organizationId, account.id),
    });
    const legacyCancel = await cancelDb.query.subscriptions.findFirst({
      where: eq(subscriptions.accountId, account.id),
    });
    expect((v2Cancel?.cancelledAt ?? legacyCancel?.cancelledAt) != null).toBe(
      true,
    );
    expect(
      v2Cancel?.stripeSubscriptionId === 'sub_cancel' ||
        legacyCancel?.stripeSubscriptionId === 'sub_cancel',
    ).toBe(true);

    const quotaPool = await loadQuotaPool(seeded.subscription.id);
    expect(quotaPool).not.toBeUndefined();
  });

  it('returns 404 when there is no active Stripe subscription to cancel', async () => {
    const { ownerProfileId } = await seedAccount();

    const res = await app.request(
      '/v1/subscription/cancel',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          ownerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns usage data from the real quota pool', async () => {
    const { account, ownerProfileId } = await seedAccount();
    await seedSubscription(account.id, {
      tier: 'plus',
      status: 'active',
      usedThisMonth: 120,
      dailyLimit: null,
      usedToday: 8,
      cycleResetAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    const res = await app.request(
      '/v1/usage',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          ownerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usage.monthlyLimit).toBe(700);
    expect(body.usage.usedThisMonth).toBe(120);
    expect(body.usage.remainingQuestions).toBe(580);
    expect(body.usage.topUpCreditsRemaining).toBe(0);
    expect(body.usage.warningLevel).toBe('none');
    expect(body.usage.dailyLimit).toBeNull();
    expect(body.usage.usedToday).toBe(8);
    expect(body.usage.dailyRemainingQuestions).toBeNull();
  });

  it('returns a customer portal url for an existing billing account', async () => {
    const { account, ownerProfileId } = await seedAccount();
    await seedSubscription(account.id, {
      stripeCustomerId: 'cus_portal',
    });

    const res = await app.request(
      '/v1/subscription/portal',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          ownerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.portalUrl).toBe('https://stripe.test/portal');

    const saved = await loadAccount();
    expect(saved).not.toBeUndefined();
  });

  it('returns 401 without authentication', async () => {
    const res = await app.request(
      '/v1/subscription',
      {
        method: 'GET',
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});
