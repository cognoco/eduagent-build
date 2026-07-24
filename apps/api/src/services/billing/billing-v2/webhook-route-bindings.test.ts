import { Hono } from 'hono';
import type { AppVariables } from '../../../types/hono';

import { revenuecatWebhookRoute } from '../../../routes/revenuecat-webhook';
import { stripeWebhookRoute } from '../../../routes/stripe-webhook';
import * as stripeService from '../../stripe';
import * as dispatch from './dispatch';
import type {
  RevenuecatWebhookHandlers,
  StripeWebhookHandlers,
} from './dispatch';

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
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('Stripe route consumes handleSubscriptionEvent from its real selector bundle', async () => {
    const handlers = {
      handleSubscriptionEvent: jest.fn().mockResolvedValue(undefined),
      handleSubscriptionDeleted: jest.fn().mockResolvedValue(undefined),
      handleCheckoutCompleted: jest.fn().mockResolvedValue(undefined),
      handlePaymentFailed: jest.fn().mockResolvedValue(undefined),
      handlePaymentSucceeded: jest.fn().mockResolvedValue(undefined),
    } satisfies StripeWebhookHandlers;
    const selectorSpy = jest
      .spyOn(dispatch, 'getStripeWebhookHandlers')
      .mockReturnValue(handlers);
    jest.spyOn(stripeService, 'verifyWebhookSignature').mockResolvedValue({
      id: 'evt_subscription_updated',
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000),
      data: { object: {} },
    } as Awaited<ReturnType<typeof stripeService.verifyWebhookSignature>>);

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
    expect(selectorSpy).toHaveBeenCalledTimes(1);
    expect(handlers.handleSubscriptionEvent).toHaveBeenCalledTimes(1);
  });

  it('RevenueCat route consumes selected account, idempotency, provisioning, and event handlers', async () => {
    const handlers = {
      resolveAccountId: jest.fn().mockResolvedValue('org-1'),
      isRevenuecatEventProcessed: jest.fn().mockResolvedValue(false),
      ensureFreeSubscription: jest.fn().mockResolvedValue(undefined),
      handleInitialPurchase: jest.fn().mockResolvedValue(undefined),
      handleRenewal: jest.fn().mockResolvedValue(undefined),
      handleCancellation: jest.fn().mockResolvedValue(undefined),
      handleExpiration: jest.fn().mockResolvedValue(undefined),
      handleBillingIssue: jest.fn().mockResolvedValue(undefined),
      handleSubscriberAlias: jest.fn().mockResolvedValue(undefined),
      handleProductChange: jest.fn().mockResolvedValue(undefined),
      handleNonRenewingPurchase: jest.fn().mockResolvedValue(null),
      handleUncancellation: jest.fn().mockResolvedValue(undefined),
    } satisfies RevenuecatWebhookHandlers;
    const selectorSpy = jest
      .spyOn(dispatch, 'getRevenuecatWebhookHandlers')
      .mockReturnValue(handlers);

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

    expect(selectorSpy).toHaveBeenCalledTimes(1);
    expect(handlers.resolveAccountId).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(handlers.isRevenuecatEventProcessed).toHaveBeenCalledTimes(1);
    expect(handlers.ensureFreeSubscription).toHaveBeenCalledTimes(1);
    expect(handlers.handleInitialPurchase).toHaveBeenCalledTimes(1);
  });
});
