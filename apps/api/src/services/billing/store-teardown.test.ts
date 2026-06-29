import {
  cancelStripeSubscriptionForErasure,
  deleteRevenueCatCustomerForErasure,
  teardownSubscriptionStoresForErasure,
} from './store-teardown';

describe('subscription store teardown for erasure', () => {
  it('cancels Stripe and deletes the RevenueCat customer through injected provider seams', async () => {
    const stripeCancel = jest.fn().mockResolvedValue({ id: 'sub_123' });
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    const result = await teardownSubscriptionStoresForErasure({
      subscriptions: [
        {
          subscriptionId: 'subrow-1',
          stripe: { subscriptionId: 'sub_123' },
          revenueCat: { originalAppUserId: 'rc_original_123' },
        },
      ],
      stripeSecretKey: 'sk_test_123',
      revenueCatRestApiKey: 'rc_secret_123',
      stripeClient: { subscriptions: { cancel: stripeCancel } },
      fetchImpl,
    });

    expect(stripeCancel).toHaveBeenCalledWith('sub_123');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.revenuecat.com/v1/subscribers/rc_original_123',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer rc_secret_123',
        }),
      }),
    );
    expect(result).toEqual([
      {
        subscriptionId: 'subrow-1',
        stripe: { status: 'done' },
        revenueCat: { status: 'done' },
      },
    ]);
  });

  it('treats subscriptions without provider identifiers as no-ops', async () => {
    const result = await teardownSubscriptionStoresForErasure({
      subscriptions: [
        {
          subscriptionId: 'subrow-1',
          stripe: { subscriptionId: null },
          revenueCat: { originalAppUserId: null },
        },
      ],
    });

    expect(result).toEqual([
      {
        subscriptionId: 'subrow-1',
        stripe: { status: 'not_applicable' },
        revenueCat: { status: 'not_applicable' },
      },
    ]);
  });

  it('treats an already-canceled Stripe subscription as an idempotent success', async () => {
    const stripeCancel = jest.fn().mockRejectedValue(
      Object.assign(new Error('This subscription is already canceled.'), {
        code: 'subscription_already_canceled',
      }),
    );

    const result = await cancelStripeSubscriptionForErasure({
      stripeSubscriptionId: 'sub_123',
      stripeClient: { subscriptions: { cancel: stripeCancel } },
    });

    expect(result).toEqual({ status: 'already_absent' });
  });

  it('[WI-885] treats a 404 from RevenueCat as an idempotent success (GDPR retry safety)', async () => {
    // The teardown worker has 5 retries on a GDPR erasure path: a second
    // attempt after the customer is already deleted must NOT escalate. 404 →
    // already_absent is the RC-side idempotency guard, mirroring the Stripe
    // subscription_already_canceled case above.
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));

    const result = await deleteRevenueCatCustomerForErasure({
      appUserId: 'rc_original_123',
      revenueCatRestApiKey: 'rc_secret_123',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.revenuecat.com/v1/subscribers/rc_original_123',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(result).toEqual({ status: 'already_absent' });
  });
});
