import { createStripeClient } from '../stripe';
import { createLogger } from '../logger';
import { captureException } from '../sentry';

const logger = createLogger();
const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1';

type StripeClientLike = {
  subscriptions: {
    cancel(subscriptionId: string): Promise<unknown>;
  };
};

export type StoreTeardownTarget = {
  subscriptionId: string;
  stripe: {
    subscriptionId: string | null;
  };
  revenueCat: {
    originalAppUserId: string | null;
  };
};

export type ProviderTeardownOutcome =
  | { status: 'not_applicable' }
  | { status: 'done' }
  | { status: 'already_absent' };

export type SubscriptionStoreTeardownResult = {
  subscriptionId: string;
  stripe: ProviderTeardownOutcome;
  revenueCat: ProviderTeardownOutcome;
};

function isNotFoundProviderError(error: unknown): boolean {
  const maybe = error as {
    statusCode?: unknown;
    status?: unknown;
    code?: unknown;
    message?: unknown;
  };
  return (
    maybe.statusCode === 404 ||
    maybe.status === 404 ||
    maybe.code === 'resource_missing' ||
    maybe.code === 'subscription_already_canceled' ||
    (typeof maybe.message === 'string' &&
      /subscription.+already.+cancel/i.test(maybe.message))
  );
}

export async function cancelStripeSubscriptionForErasure({
  stripeSubscriptionId,
  stripeSecretKey,
  stripeClient,
}: {
  stripeSubscriptionId: string;
  stripeSecretKey?: string;
  stripeClient?: StripeClientLike;
}): Promise<ProviderTeardownOutcome> {
  const client =
    stripeClient ??
    (stripeSecretKey ? createStripeClient(stripeSecretKey) : undefined);
  if (!client) {
    const err = new Error(
      '[store-teardown] STRIPE_SECRET_KEY unavailable — cannot cancel Stripe subscription during erasure',
    );
    captureException(err, {
      extra: {
        surface: 'billing.store_teardown.stripe',
        reason: 'missing_secret',
        stripeSubscriptionId,
      },
    });
    throw err;
  }

  try {
    await client.subscriptions.cancel(stripeSubscriptionId);
    logger.info('billing.store_teardown.stripe.cancelled', {
      stripeSubscriptionId,
    });
    return { status: 'done' };
  } catch (error) {
    if (isNotFoundProviderError(error)) {
      logger.info('billing.store_teardown.stripe.already_absent', {
        stripeSubscriptionId,
      });
      return { status: 'already_absent' };
    }
    captureException(error, {
      extra: {
        surface: 'billing.store_teardown.stripe',
        reason: 'provider_error',
        stripeSubscriptionId,
      },
    });
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function deleteRevenueCatCustomerForErasure({
  appUserId,
  revenueCatRestApiKey,
  fetchImpl = fetch,
}: {
  appUserId: string;
  revenueCatRestApiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProviderTeardownOutcome> {
  if (!revenueCatRestApiKey) {
    const err = new Error(
      '[store-teardown] REVENUECAT_REST_API_KEY unavailable — cannot delete RevenueCat customer during erasure',
    );
    captureException(err, {
      extra: {
        surface: 'billing.store_teardown.revenuecat',
        reason: 'missing_secret',
        appUserId,
      },
    });
    throw err;
  }

  let res: Response;
  try {
    res = await fetchImpl(
      `${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${revenueCatRestApiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    captureException(error, {
      extra: {
        surface: 'billing.store_teardown.revenuecat',
        reason: 'network_error',
        appUserId,
      },
    });
    throw error instanceof Error ? error : new Error(String(error));
  }

  if (res.status === 404) {
    logger.info('billing.store_teardown.revenuecat.already_absent', {
      appUserId,
    });
    return { status: 'already_absent' };
  }

  if (!res.ok) {
    const err = new Error(
      `[store-teardown] RevenueCat customer delete failed with status ${res.status}`,
    );
    captureException(err, {
      extra: {
        surface: 'billing.store_teardown.revenuecat',
        reason: `http_${res.status}`,
        appUserId,
      },
    });
    throw err;
  }

  logger.info('billing.store_teardown.revenuecat.deleted', {
    appUserId,
  });
  return { status: 'done' };
}

export async function teardownSubscriptionStoresForErasure({
  subscriptions,
  stripeSecretKey,
  revenueCatRestApiKey,
  stripeClient,
  fetchImpl = fetch,
}: {
  subscriptions: StoreTeardownTarget[];
  stripeSecretKey?: string;
  revenueCatRestApiKey?: string;
  stripeClient?: StripeClientLike;
  fetchImpl?: typeof fetch;
}): Promise<SubscriptionStoreTeardownResult[]> {
  const results: SubscriptionStoreTeardownResult[] = [];

  for (const target of subscriptions) {
    const stripe =
      target.stripe.subscriptionId === null
        ? ({ status: 'not_applicable' } as const)
        : await cancelStripeSubscriptionForErasure({
            stripeSubscriptionId: target.stripe.subscriptionId,
            stripeSecretKey,
            stripeClient,
          });

    const revenueCat =
      target.revenueCat.originalAppUserId === null
        ? ({ status: 'not_applicable' } as const)
        : await deleteRevenueCatCustomerForErasure({
            appUserId: target.revenueCat.originalAppUserId,
            revenueCatRestApiKey,
            fetchImpl,
          });

    results.push({
      subscriptionId: target.subscriptionId,
      stripe,
      revenueCat,
    });
  }

  return results;
}
