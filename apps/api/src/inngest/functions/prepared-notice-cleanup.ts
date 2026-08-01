// @inngest-admin: cross-profile
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { deleteStalePreparedNotices } from '../../services/notices';
import { createLogger } from '../../services/logger';

const logger = createLogger();

export const preparedNoticeCleanup = inngest.createFunction(
  {
    id: 'prepared-notice-cleanup',
    name: 'Delete stale unready pending notices',
    retries: 5,
  },
  { cron: '45 5 * * *' },
  async ({ step }) => {
    const deleted = await step.run('delete-stale-prepared-notices', () =>
      deleteStalePreparedNotices(getStepDatabase()),
    );
    logger.info('prepared_notice_cleanup.completed', { deleted });
    return { status: 'completed' as const, deleted };
  },
);
