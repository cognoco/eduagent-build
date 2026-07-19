// @inngest-admin: cross-profile
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  membership,
  mentorNotices,
  notificationPreferences,
  organization,
  person,
} from '@eduagent/database';

import { inngest } from '../client';
import { getStepDatabase, getStepMentorNoticeEnabled } from '../helpers';
import { consentGateSatisfiedSql } from '../../services/identity-v2/consent-status-v2';

export const mentorNoticeNudgeScan = inngest.createFunction(
  { id: 'mentor-notice-nudge-scan', name: 'Mentor notice nudge scan' },
  { cron: '15 * * * *' },
  async ({ step }) => {
    const enabled = await step.run('check-feature-flag', () =>
      getStepMentorNoticeEnabled(),
    );
    if (!enabled) return { eligibleCount: 0, sentEvents: 0 };

    const eligible = await step.run('find-eligible-notices', async () => {
      const db = getStepDatabase();
      return db
        .select({
          noticeId: mentorNotices.id,
          profileId: mentorNotices.profileId,
        })
        .from(mentorNotices)
        .innerJoin(person, eq(person.id, mentorNotices.profileId))
        .innerJoin(membership, eq(membership.personId, person.id))
        .innerJoin(organization, eq(organization.id, membership.organizationId))
        .innerJoin(
          notificationPreferences,
          and(
            eq(notificationPreferences.profileId, person.id),
            eq(notificationPreferences.pushEnabled, true),
            eq(notificationPreferences.reviewReminders, true),
          ),
        )
        .where(
          and(
            isNull(person.archivedAt),
            eq(mentorNotices.status, 'open'),
            eq(mentorNotices.nudgeStatus, 'pending'),
            consentGateSatisfiedSql(sql`${person.id}`),
            sql`(now() at time zone coalesce(${organization.timezone}, 'UTC'))::time >= time '16:00'`,
            sql`(now() at time zone coalesce(${organization.timezone}, 'UTC'))::time < time '17:00'`,
            sql`((now() at time zone coalesce(${organization.timezone}, 'UTC')) - interval '4 hours')::date = (((${mentorNotices.createdAt} at time zone coalesce(${organization.timezone}, 'UTC')) - interval '4 hours')::date + 1)`,
          ),
        )
        .limit(500);
    });
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
