// @inngest-admin: cross-profile
import { inngest } from '../client';
import { getStepDatabase, getStepMentorNoticeEnabled } from '../helpers';
import { fadeStaleMentorNotices } from '../../services/mentor-notices';

export const mentorNoticeFade = inngest.createFunction(
  { id: 'mentor-notice-fade', name: 'Fade inactive mentor notices' },
  { cron: '45 3 * * *' },
  async ({ step }) => {
    const enabled = await step.run('check-feature-flag', () =>
      getStepMentorNoticeEnabled(),
    );
    if (!enabled) return { faded: 0 };
    return step.run('fade-stale-notices', async () => ({
      faded: await fadeStaleMentorNotices(
        getStepDatabase(),
        new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
      ),
    }));
  },
);
