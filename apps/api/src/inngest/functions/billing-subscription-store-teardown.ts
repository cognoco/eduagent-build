import { summarizeRawPayload } from '@eduagent/schemas';
import { inngest } from '../client';
import {
  getStepRevenueCatRestApiKey,
  getStepStripeSecretKey,
} from '../helpers';
import { subscriptionStoreTeardownRequestedDataSchema } from '../events/subscription-store-teardown';
import { teardownSubscriptionStoresForErasure } from '../../services/billing/store-teardown';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

export const billingSubscriptionStoreTeardown = inngest.createFunction(
  {
    id: 'billing-subscription-store-teardown',
    name: 'Cancel subscription stores after account erasure',
    retries: 5,
    idempotency: 'event.data.accountId',
    concurrency: { key: 'event.data.accountId', limit: 1 },
    onFailure: async ({
      event,
      error,
    }: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
    }) => {
      const accountId =
        (event.data.event?.data as { accountId?: string } | undefined)
          ?.accountId ?? null;

      captureException(
        error instanceof Error
          ? error
          : new Error(
              `billing-subscription-store-teardown: all retries exhausted${
                accountId ? ` for account ${accountId}` : ''
              }`,
            ),
        {
          extra: {
            surface: 'billing-subscription-store-teardown.terminal_failure',
            accountId,
            runId: event.data.run_id ?? null,
          },
        },
      );

      logger.error('billing.store_teardown.terminal_failure', {
        accountId,
        runId: event.data.run_id ?? null,
        errorName: error instanceof Error ? error.name : typeof error,
      });

      return { status: 'terminal_failure' as const, accountId };
    },
  },
  { event: 'app/billing.subscription_store_teardown_requested' },
  async ({ event, step }) => {
    const parsed = subscriptionStoreTeardownRequestedDataSchema.safeParse(
      event.data,
    );
    if (!parsed.success) {
      const err = new Error(
        `billing.subscription_store_teardown_requested: invalid payload — ${parsed.error.message}`,
      );
      captureException(err, {
        extra: {
          surface: 'billing-subscription-store-teardown.invalid_payload',
          rawData: summarizeRawPayload(event.data),
        },
      });
      logger.error('billing.store_teardown.invalid_payload', {
        issues: parsed.error.issues,
      });
      return { status: 'invalid_payload' as const, accountId: null };
    }

    const { accountId, subscriptions } = parsed.data;
    const needsStripe = subscriptions.some(
      (target) => target.stripe.subscriptionId !== null,
    );
    const needsRevenueCat = subscriptions.some(
      (target) => target.revenueCat.originalAppUserId !== null,
    );

    const results = await step.run('teardown-subscription-stores', async () => {
      return teardownSubscriptionStoresForErasure({
        subscriptions,
        stripeSecretKey: needsStripe ? getStepStripeSecretKey() : undefined,
        revenueCatRestApiKey: needsRevenueCat
          ? getStepRevenueCatRestApiKey()
          : undefined,
      });
    });

    return {
      status: 'completed' as const,
      accountId,
      subscriptionsProcessed: results.length,
      results,
    };
  },
);
