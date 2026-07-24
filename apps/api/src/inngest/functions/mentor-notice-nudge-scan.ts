// @inngest-admin: cross-profile
import { inngest } from '../client';
import {
  getStepDatabase,
  getStepMentorNoticeEnabled,
  getStepMentorNoticePushPostMvpEnabled,
} from '../helpers';
import { findEligibleMentorNoticeNudges } from '../../services/mentor-notices';

export const mentorNoticeNudgeScan = inngest.createFunction(
  { id: 'mentor-notice-nudge-scan', name: 'Mentor notice nudge scan' },
  { cron: '15 * * * *' },
  async ({ step }) => {
    // [WI-2573] Post-MVP push containment (MMT-ADR-0036 §3.1). Runs before the
    // in-app flag check and before any database access, so with the boundary
    // off this cron scans nothing and fans out nothing. Returns cleanly rather
    // than throwing — a throw would produce provider retry fan-out.
    const pushBoundaryOpen = await step.run(
      'check-post-mvp-push-boundary',
      () => getStepMentorNoticePushPostMvpEnabled(),
    );
    if (!pushBoundaryOpen) {
      return { eligibleCount: 0, sentEvents: 0, reason: 'push_post_mvp' };
    }

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
