import { inngest } from '../client';
import { getStepDatabase, getStepMentorNoticeEnabled } from '../helpers';
import {
  getLearningDayStart,
  getProfileTimeZone,
  reserveMentorNoticeNudge,
  sendReservedMentorNoticeNudge,
} from '../../services/mentor-notices';

export const mentorNoticeNudgeSend = inngest.createFunction(
  {
    id: 'mentor-notice-nudge-send',
    name: 'Mentor notice nudge send',
    retries: 0,
    idempotency: 'event.id',
  },
  { event: 'app/mentor-notice.nudge' },
  async ({ event, step }) => {
    const enabled = await step.run('check-feature-flag', () =>
      getStepMentorNoticeEnabled(),
    );
    if (!enabled) return { status: 'skipped', reason: 'feature_disabled' };

    const reserved = await step.run('reserve-notification-slot', async () => {
      const db = getStepDatabase();
      const timezone = await getProfileTimeZone(db, event.data.profileId);
      const now = new Date();
      return reserveMentorNoticeNudge(db, {
        ...event.data,
        now,
        localDayStart: getLearningDayStart(now, timezone),
      });
    });
    if (!reserved) return { status: 'skipped', reason: 'not_eligible' };

    return step.run('send-reserved-nudge', async () => {
      const result = await sendReservedMentorNoticeNudge(
        getStepDatabase(),
        event.data,
      );
      return result.sent
        ? { status: 'sent', ticketId: result.ticketId }
        : { status: 'skipped', reason: result.reason };
    });
  },
);
