import { inngest } from '../client';
import { createLogger } from '../../services/logger';

const logger = createLogger();

export const orphanPersistFailed = inngest.createFunction(
  { id: 'orphan-persist-failed', name: 'Orphan persist failed (counter)' },
  { event: 'app/orphan.persist.failed' },
  async ({ event }) => {
    logger.warn('orphan.persist.failed', event.data);
    return { recorded: true };
  }
);
