// @inngest-admin: cross-profile (system failure observer writes the unscoped terminal-deletion outbox)
import {
  accountDeletionTeardownFailedEventSchema,
  billingSubscriptionStoreTeardownFailedEventSchema,
  terminalFailureErrorNameSchema,
} from '@eduagent/schemas';
import { captureException } from '../../services/sentry';
import {
  deleteTerminalDeletionFailure,
  persistTerminalDeletionFailure,
} from '../../services/terminal-deletion-failure-outbox';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';

const FUNCTION_ID = 'inngest-function-failed-observe';

type FunctionFailedData = {
  function_id?: unknown;
  run_id?: unknown;
  error?: {
    name?: unknown;
  };
  event?: { data?: { accountId?: unknown } };
};

function boundedString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, 200)
    : fallback;
}

function boundedTerminalErrorName(value: unknown) {
  const parsed = terminalFailureErrorNameSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return typeof value === 'string' ? 'Error' : 'NonError';
}

export const inngestFunctionFailedObserve = inngest.createFunction(
  {
    id: FUNCTION_ID,
    name: 'Observe terminal Inngest function failures',
    retries: 5,
  },
  { event: 'inngest/function.failed' },
  async ({ event, step }) => {
    const data = event.data as FunctionFailedData;
    const functionId = boundedString(data?.function_id, 'unknown');

    if (functionId === FUNCTION_ID) {
      return { status: 'skipped' as const, reason: 'self_failure' as const };
    }

    captureException(new Error('Inngest function failed after retries'), {
      tags: {
        surface: 'inngest-fleet',
        signal: 'function-failed',
        functionId,
      },
      extra: {
        runId: boundedString(data?.run_id, 'unknown'),
        errorName: boundedString(data?.error?.name, 'unknown'),
      },
    });

    if (functionId === 'scheduled-account-deletion') {
      const runId =
        typeof data.run_id === 'string' && data.run_id.length > 0
          ? data.run_id
          : null;
      const accountId =
        typeof data.event?.data?.accountId === 'string' &&
        data.event.data.accountId.length > 0
          ? data.event.data.accountId
          : null;
      const occurredAt = new Date(event.ts ?? Date.now());
      const failureEvent = accountDeletionTeardownFailedEventSchema.parse({
        accountId,
        runId,
        errorName: boundedTerminalErrorName(data.error?.name),
        timestamp: occurredAt.toISOString(),
      });
      const signalId = `deletion-terminal-failure:${functionId}:${runId ?? accountId ?? 'unknown'}`;

      await step.run('persist-terminal-deletion-failure', async () => {
        await persistTerminalDeletionFailure(getStepDatabase(), {
          signalId,
          eventName: 'app/account.deletion_teardown.failed',
          accountId,
          runId,
          errorName: failureEvent.errorName,
          occurredAt,
        });
      });

      // orphan-allow: observability-only dead-letter signal consumed by
      // launch-health alerting and the Inngest dashboard.
      await step.sendEvent('replay-terminal-deletion-failure', {
        id: signalId,
        name: 'app/account.deletion_teardown.failed',
        data: failureEvent,
      });
      await step.run('ack-terminal-deletion-failure', async () => {
        await deleteTerminalDeletionFailure(getStepDatabase(), signalId);
      });

      return { status: 'replayed' as const, functionId };
    }

    if (functionId === 'billing-subscription-store-teardown') {
      const runId =
        typeof data.run_id === 'string' && data.run_id.length > 0
          ? data.run_id
          : null;
      const accountId =
        typeof data.event?.data?.accountId === 'string' &&
        data.event.data.accountId.length > 0
          ? data.event.data.accountId
          : null;
      const occurredAt = new Date(event.ts ?? Date.now());
      const failureEvent =
        billingSubscriptionStoreTeardownFailedEventSchema.parse({
          accountId,
          runId,
          errorName: boundedTerminalErrorName(data.error?.name),
          timestamp: occurredAt.toISOString(),
        });
      const signalId = `deletion-terminal-failure:${functionId}:${runId ?? accountId ?? 'unknown'}`;

      await step.run('persist-terminal-deletion-failure', async () => {
        await persistTerminalDeletionFailure(getStepDatabase(), {
          signalId,
          eventName: 'app/billing.subscription_store_teardown.failed',
          accountId,
          runId,
          errorName: failureEvent.errorName,
          occurredAt,
        });
      });

      // orphan-allow: observability-only dead-letter signal consumed by
      // launch-health alerting and the Inngest dashboard.
      await step.sendEvent('replay-terminal-deletion-failure', {
        id: signalId,
        name: 'app/billing.subscription_store_teardown.failed',
        data: failureEvent,
      });
      await step.run('ack-terminal-deletion-failure', async () => {
        await deleteTerminalDeletionFailure(getStepDatabase(), signalId);
      });

      return { status: 'replayed' as const, functionId };
    }

    return { status: 'captured' as const, functionId };
  },
);
