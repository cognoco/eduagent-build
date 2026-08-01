// @inngest-admin: cross-profile (cron drains the unscoped terminal-deletion outbox)
import {
  accountDeletionTeardownFailedEventSchema,
  billingSubscriptionStoreTeardownFailedEventSchema,
} from '@eduagent/schemas';
import {
  deleteTerminalDeletionFailures,
  listTerminalDeletionFailures,
} from '../../services/terminal-deletion-failure-outbox';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';

const RECOVERY_BATCH_SIZE = 100;

export const terminalDeletionFailureRecovery = inngest.createFunction(
  {
    id: 'terminal-deletion-failure-recovery',
    name: 'Recover terminal deletion failure signals',
    retries: 5,
  },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    const pending = await step.run(
      'load-terminal-deletion-failures',
      async () =>
        listTerminalDeletionFailures(getStepDatabase(), RECOVERY_BATCH_SIZE),
    );

    if (pending.length === 0) return { replayed: 0 };

    const events = pending.map((record) => {
      const data = {
        accountId: record.accountId,
        runId: record.runId,
        errorName: record.errorName,
        timestamp: new Date(record.occurredAt).toISOString(),
      };

      if (record.eventName === 'app/account.deletion_teardown.failed') {
        return {
          id: record.signalId,
          name: record.eventName,
          data: accountDeletionTeardownFailedEventSchema.parse(data),
        };
      }

      return {
        id: record.signalId,
        name: record.eventName,
        data: billingSubscriptionStoreTeardownFailedEventSchema.parse(data),
      };
    });

    await step.sendEvent('replay-terminal-deletion-failures', events);
    await step.run('ack-terminal-deletion-failures', async () => {
      await deleteTerminalDeletionFailures(
        getStepDatabase(),
        pending.map((record) => record.signalId),
      );
    });

    return { replayed: pending.length };
  },
);
