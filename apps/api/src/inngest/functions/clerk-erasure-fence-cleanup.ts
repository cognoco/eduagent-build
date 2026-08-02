// @inngest-admin: cross-profile
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  CLERK_ERASURE_FENCE_CLEANUP_BATCH_SIZE,
  deleteExpiredClerkErasureFences,
} from '../../services/identity-v2/deletion-v2';
import { createLogger } from '../../services/logger';

const logger = createLogger();

export const clerkErasureFenceCleanup = inngest.createFunction(
  {
    id: 'clerk-erasure-fence-cleanup',
    name: 'Delete expired Clerk erasure fences',
    retries: 5,
  },
  { cron: '30 5 * * *' },
  async ({ step }) => {
    let deleted = 0;
    for (let batch = 0; ; batch += 1) {
      const batchDeleted = await step.run(
        `delete-expired-clerk-erasure-fences-${batch}`,
        () => deleteExpiredClerkErasureFences(getStepDatabase()),
      );
      deleted += batchDeleted;
      if (batchDeleted < CLERK_ERASURE_FENCE_CLEANUP_BATCH_SIZE) break;
    }
    logger.info('clerk_erasure_fence_cleanup.completed', { deleted });
    return { status: 'completed' as const, deleted };
  },
);
