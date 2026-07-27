// @inngest-admin: cross-profile
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  fadeStaleMentorNotices,
  mentorNoticeInactivityCutoff,
} from '../../services/mentor-notices';

export const mentorNoticeFade = inngest.createFunction(
  { id: 'mentor-notice-fade', name: 'Fade inactive mentor notices' },
  { cron: '45 3 * * *' },
  async ({ step }) => {
    // [WI-2627] Fade runs REGARDLESS of the rollout flag. It previously
    // short-circuited to `{ faded: 0 }` while the flag was off, which made the
    // flag-off window a period in which notices aged but were never retired —
    // so a re-enable surfaced records that had been inactive for months and
    // would have been faded had the feature stayed on. Fading is retirement of
    // stale learner-private records, not a feature surface: it emits nothing to
    // any client, and running it while off is what makes "re-enable reveals
    // only currently-eligible records" true rather than aspirational.
    return step.run('fade-stale-notices', async () => ({
      faded: await fadeStaleMentorNotices(
        getStepDatabase(),
        mentorNoticeInactivityCutoff(new Date()),
      ),
    }));
  },
);
