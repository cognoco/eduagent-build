// @inngest-admin: cross-profile (aggregate-only billing health scan)

import { inngest } from '../client';
import { getStepDatabase, getStepEnvironment } from '../helpers';
import { captureMessage } from '../../services/sentry';
import {
  buildPastDueLaunchHealthSignals,
  countPastDueLaunchHealth,
} from '../../services/past-due-launch-health';

export const pastDueLaunchHealth = inngest.createFunction(
  {
    id: 'past-due-launch-health',
    name: 'Past-due subscription launch-health scan',
  },
  { cron: '15 * * * *' },
  async ({ step }) =>
    step.run('count-and-emit-past-due-health', async () => {
      const observedAt = new Date();
      const counts = await countPastDueLaunchHealth(
        getStepDatabase(),
        observedAt,
      );
      const signals = buildPastDueLaunchHealthSignals({
        ...counts,
        environment: getStepEnvironment(),
        observedAt: observedAt.toISOString(),
      });

      for (const signal of signals) {
        captureMessage(signal.message, {
          level: signal.level,
          tags: signal.tags,
          extra: signal.extra,
        });
      }

      return {
        status: 'completed' as const,
        ...counts,
        emittedSignals: signals.length,
      };
    }),
);
