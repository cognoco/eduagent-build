import { Hono } from 'hono';
import type { AppVariables } from '../../../types/hono';

const mockStripeHandler = jest.fn().mockResolvedValue(undefined);
const mockRevenuecatHandlers = {
  resolveAccountId: jest.fn().mockResolvedValue('org-1'),
  isRevenuecatEventProcessed: jest.fn().mockResolvedValue(false),
  ensureFreeSubscription: jest.fn().mockResolvedValue(undefined),
  handleInitialPurchase: jest.fn().mockResolvedValue(undefined),
};

jest.mock('./index', () => {
  const actual = jest.requireActual('./index') as typeof import('./index');
  return {
    ...actual,
    handleSubscriptionEventV2: mockStripeHandler,
    resolveAccountIdV2: mockRevenuecatHandlers.resolveAccountId,
    isRevenuecatEventProcessedV2:
      mockRevenuecatHandlers.isRevenuecatEventProcessed,
    ensureFreeSubscriptionV2: mockRevenuecatHandlers.ensureFreeSubscription,
    handleInitialPurchaseV2: mockRevenuecatHandlers.handleInitialPurchase,
  };
});

jest.mock('../../stripe', () => {
  const actual = jest.requireActual(
    '../../stripe',
  ) as typeof import('../../stripe');
  return {
    ...actual,
    verifyWebhookSignature: jest.fn(),
  };
});

const { getRevenuecatWebhookHandlers, getStripeWebhookHandlers } =
  require('./dispatch') as typeof import('./dispatch');

import { revenuecatWebhookRoute } from '../../../routes/revenuecat-webhook';
import { stripeWebhookRoute } from '../../../routes/stripe-webhook';
import { verifyWebhookSignature } from '../../stripe';

const stripeApp = new Hono<{ Variables: AppVariables }>()
  .use('*', async (c, next) => {
    c.set('db', {} as AppVariables['db']);
    await next();
  })
  .route('/', stripeWebhookRoute);

const revenuecatApp = new Hono<{ Variables: AppVariables }>()
  .use('*', async (c, next) => {
    c.set('db', {} as AppVariables['db']);
    await next();
  })
  .route('/', revenuecatWebhookRoute);

describe('billing-v2 production webhook route bindings [WI-2619]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStripeHandler.mockResolvedValue(undefined);
    mockRevenuecatHandlers.resolveAccountId.mockResolvedValue('org-1');
    mockRevenuecatHandlers.isRevenuecatEventProcessed.mockResolvedValue(false);
    mockRevenuecatHandlers.ensureFreeSubscription.mockResolvedValue(undefined);
    mockRevenuecatHandlers.handleInitialPurchase.mockResolvedValue(undefined);
  });

  it('Stripe route consumes handleSubscriptionEvent from its real selector bundle', async () => {
    (verifyWebhookSignature as jest.Mock).mockResolvedValue({
      id: 'evt_subscription_updated',
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000),
      data: { object: {} },
    });

    const response = await stripeApp.request(
      '/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'valid' },
        body: '{}',
      },
      { STRIPE_WEBHOOK_SECRET: 'whsec_test' },
    );

    expect(response.status).toBe(200);
    expect(getStripeWebhookHandlers().handleSubscriptionEvent).toBe(
      mockStripeHandler,
    );
    expect(mockStripeHandler).toHaveBeenCalledTimes(1);
  });

  it('RevenueCat route consumes selected account, idempotency, provisioning, and event handlers', async () => {
    const response = await revenuecatApp.request(
      '/revenuecat/webhook',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer rc_webhook_test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_version: '1.0',
          event: {
            id: 'evt_initial_purchase',
            type: 'INITIAL_PURCHASE',
            app_user_id: 'clerk_user_123',
            original_app_user_id: 'clerk_user_123',
            product_id: 'com.eduagent.plus.monthly',
            entitlement_ids: ['pro'],
            period_type: 'NORMAL',
            purchased_at_ms: Date.now(),
            expiration_at_ms: Date.now() + 86_400_000,
            store: 'APP_STORE',
            environment: 'PRODUCTION',
            is_family_share: false,
          },
        }),
      },
      { REVENUECAT_WEBHOOK_SECRET: 'rc_webhook_test' },
    );

    expect(response.status).toBe(200);
    expect(getRevenuecatWebhookHandlers()).toMatchObject({
      resolveAccountId: mockRevenuecatHandlers.resolveAccountId,
      isRevenuecatEventProcessed:
        mockRevenuecatHandlers.isRevenuecatEventProcessed,
      ensureFreeSubscription: mockRevenuecatHandlers.ensureFreeSubscription,
      handleInitialPurchase: mockRevenuecatHandlers.handleInitialPurchase,
    });
    expect(mockRevenuecatHandlers.resolveAccountId).toHaveBeenCalledTimes(1);
    expect(
      mockRevenuecatHandlers.isRevenuecatEventProcessed,
    ).toHaveBeenCalledTimes(1);
    expect(mockRevenuecatHandlers.ensureFreeSubscription).toHaveBeenCalledTimes(
      1,
    );
    expect(mockRevenuecatHandlers.handleInitialPurchase).toHaveBeenCalledTimes(
      1,
    );
  });
});
