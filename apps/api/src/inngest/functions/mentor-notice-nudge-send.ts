// @inngest-admin: event-profile (profileId from event scopes all notice reads and writes)
import { inngest } from '../client';
import {
  getStepDatabase,
  getStepMentorNoticeEnabled,
  getStepMentorNoticePushPostMvpEnabled,
} from '../helpers';
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
    // [WI-2573] Post-MVP push containment (MMT-ADR-0036 §3.1). First step, so
    // an event already sitting in the queue from before the containment — a
    // replay of the pre-existing fan-out — reserves no slot, writes no
    // notification_log row, and reaches no Expo send. It returns a terminal
    // skipped result instead of throwing, so there is no retry fan-out either.
    const pushBoundaryOpen = await step.run(
      'check-post-mvp-push-boundary',
      () => getStepMentorNoticePushPostMvpEnabled(),
    );
    if (!pushBoundaryOpen) {
      return { status: 'skipped', reason: 'push_post_mvp' };
    }

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
