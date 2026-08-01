// @inngest-admin: cross-profile (provider teardown plus an unscoped terminal-failure outbox write)
import {
  billingSubscriptionStoreTeardownFailedEventSchema,
  classifyTerminalFailureError,
  type BillingSubscriptionStoreTeardownFailedEvent,
  subscriptionStoreTeardownRequestedDataSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';
import { inngest } from '../client';
import {
  getStepDatabase,
  getStepRevenueCatRestApiKey,
  getStepStripeSecretKey,
} from '../helpers';
import { teardownSubscriptionStoresForErasure } from '../../services/billing/store-teardown';
import { createLogger } from '../../services/logger';
import { safeSendConfirmed } from '../../services/safe-non-core';
import { captureException, captureMessage } from '../../services/sentry';
import {
  deleteTerminalDeletionFailure,
  persistTerminalDeletionFailure,
} from '../../services/terminal-deletion-failure-outbox';

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
      const runId = event.data.run_id ?? null;
      const errorName = classifyTerminalFailureError(error);

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
            runId,
          },
        },
      );

      logger.error('billing.store_teardown.terminal_failure', {
        accountId,
        runId,
        errorName,
      });

      const signalId = `deletion-terminal-failure:billing-subscription-store-teardown:${runId ?? accountId ?? 'unknown'}`;
      const occurredAt = new Date();
      const failureEvent: BillingSubscriptionStoreTeardownFailedEvent =
        billingSubscriptionStoreTeardownFailedEventSchema.parse({
          accountId,
          runId,
          errorName,
          timestamp: occurredAt.toISOString(),
        });
      const db = getStepDatabase();
      await persistTerminalDeletionFailure(db, {
        signalId,
        eventName: 'app/billing.subscription_store_teardown.failed',
        accountId,
        runId,
        errorName,
        occurredAt,
      });
      const confirmed = await safeSendConfirmed(
        () =>
          inngest.send({
            id: signalId,
            // orphan-allow: observability-only dead-letter signal consumed by
            // launch-health alerting and the Inngest dashboard.
            name: 'app/billing.subscription_store_teardown.failed',
            data: failureEvent,
          }),
        'billing-subscription-store-teardown.terminal_failure',
        { accountId, runId },
      );
      if (confirmed) {
        await deleteTerminalDeletionFailure(db, signalId);
      }

      return { status: 'terminal_failure' as const, accountId };
    },
  },
  { event: 'app/billing.subscription_store_teardown_requested' },
  async ({ event, runId, step }) => {
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

    const summarizeProvider = (
      provider: 'stripe' | 'revenueCat',
    ): 'done' | 'already_absent' | 'not_applicable' | 'mixed' => {
      const statuses = new Set(
        results.map((result) => result[provider].status),
      );
      return statuses.size === 1
        ? ([...statuses][0] ?? 'not_applicable')
        : 'mixed';
    };
    const stripe = summarizeProvider('stripe');
    const revenueCat = summarizeProvider('revenueCat');

    // [WI-2390] This is the final external leg of whole-account erasure. Keep
    // its success proof outside Postgres so PITR cannot erase the evidence or
    // make a restored account look as though provider teardown never happened.
    await step.run('record-store-teardown-completion', async () => {
      const completion = {
        event: 'billing.store_teardown.completed',
        accountId,
        runId,
        subscriptionsProcessed: results.length,
        stripe,
        revenueCat,
      };
      logger.info('billing.store_teardown.completed', completion);

      try {
        captureMessage('billing.store_teardown.completed', {
          level: 'info',
          tags: {
            surface: 'billing.store_teardown.completed',
            stripe,
            revenueCat,
          },
          extra: {
            accountId,
            runId,
            subscriptionsProcessed: results.length,
          },
        });
      } catch (error) {
        // The structured log above remains the durable proof; observability
        // transport failure must not re-run completed provider deletions.
        logger.warn('billing.store_teardown.completion_sentry_failed', {
          accountId,
          runId,
          errorName: error instanceof Error ? error.name : typeof error,
        });
      }

      return completion;
    });

    return {
      status: 'completed' as const,
      accountId,
      subscriptionsProcessed: results.length,
      results,
    };
  },
);
