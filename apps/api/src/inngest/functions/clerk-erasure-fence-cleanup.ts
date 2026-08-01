// @inngest-admin: cross-profile
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { deleteExpiredClerkErasureFences } from '../../services/identity-v2/deletion-v2';
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
    const deleted = await step.run('delete-expired-clerk-erasure-fences', () =>
      deleteExpiredClerkErasureFences(getStepDatabase()),
    );
    logger.info('clerk_erasure_fence_cleanup.completed', { deleted });
    return { status: 'completed' as const, deleted };
  },
);
