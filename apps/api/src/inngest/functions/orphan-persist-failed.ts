import { orphanPersistFailedEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

export const orphanPersistFailed = inngest.createFunction(
  { id: 'orphan-persist-failed', name: 'Orphan persist failed (counter)' },
  { event: 'app/orphan.persist.failed' },
  async ({ event }) => {
    const parsed = orphanPersistFailedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn('orphan.persist.failed: invalid payload', {
        issues: parsed.error.issues,
      });
      return { recorded: false };
    }
    captureException(new Error('orphan persist failed'), {
      profileId: parsed.data.profileId,
      extra: {
        draftId: parsed.data.draftId,
        route: parsed.data.route,
        reason: parsed.data.reason,
      },
    });
    return { recorded: true };
  }
);
