// @inngest-admin: cross-profile
import { inngest } from '../client';
import { getStepDatabase, getStepMentorNoticeEnabled } from '../helpers';
import { findEligibleMentorNoticeNudges } from '../../services/mentor-notices';

export const mentorNoticeNudgeScan = inngest.createFunction(
  { id: 'mentor-notice-nudge-scan', name: 'Mentor notice nudge scan' },
  { cron: '15 * * * *' },
  async ({ step }) => {
    const enabled = await step.run('check-feature-flag', () =>
      getStepMentorNoticeEnabled(),
    );
    if (!enabled) return { eligibleCount: 0, sentEvents: 0 };

    const eligible = await step.run('find-eligible-notices', () =>
      findEligibleMentorNoticeNudges(getStepDatabase()),
    );
    if (eligible.length === 0) return { eligibleCount: 0, sentEvents: 0 };

    await step.sendEvent(
      'fan-out-mentor-notice-nudges',
      eligible.map((notice) => ({
        id: `mentor-notice-nudge-${notice.noticeId}`,
        name: 'app/mentor-notice.nudge',
        data: notice,
      })),
    );
    return { eligibleCount: eligible.length, sentEvents: eligible.length };
  },
);
