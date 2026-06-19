// @inngest-admin: cross-profile
//
// This function is intentionally cross-profile. It scans all profiles with
// overdue retention cards every 2 hours to fan out review-due notifications.
// Profile-scoping rules in AGENTS.md ("Reads must use createScopedRepository")
// do NOT apply here — this is system-wide work running outside any single
// profile's request context.
//
// If you add raw drizzle queries to this file, ensure they cannot leak
// data between profiles in user-visible output (notifications,
// recommendations). When in doubt, scope by profileId at the leaf even
// when scanning broadly.

// ---------------------------------------------------------------------------
// Review Due Scan — Cron that finds profiles with overdue retention cards
// and fans out per-profile events for independent notification delivery.
// ---------------------------------------------------------------------------

import {
  sql,
  eq,
  lt,
  and,
  notExists,
  isNull,
  ne,
} from 'drizzle-orm';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  retentionCards,
  curriculumTopics,
  curriculumBooks,
  curricula,
  subjects,
  notificationPreferences,
  notificationLog,
  membership,
  organization,
  person,
} from '@eduagent/database';
import { consentGateSatisfiedSql } from '../../services/identity-v2/consent-status-v2';

export const reviewDueScan = inngest.createFunction(
  { id: 'review-due-scan', name: 'Review due scan (every 2h)' },
  { cron: '0 */2 * * *' }, // Every 2 hours
  async ({ step }) => {
    // Step 1: Find profiles with overdue retention cards
    const eligible = await step.run('find-overdue-profiles', async () => {
      const db = getStepDatabase();

      // [CUT-B2] v2 scan: profiles×accounts → person×membership×organization;
      // learning-table joins unchanged (profileId = person.id); the consent
      // gate from the shared current-row-windowed predicate; timezone from org.
      const results = await db
          .select({
            profileId: person.id,
            overdueCount: sql<number>`count(${retentionCards.id})::int`,
            topTopicIds: sql<
              string[]
            >`(array_agg(${retentionCards.topicId} ORDER BY ${retentionCards.nextReviewAt} ASC))[1:3]`,
          })
          .from(person)
          .innerJoin(membership, eq(membership.personId, person.id))
          .innerJoin(
            organization,
            eq(organization.id, membership.organizationId),
          )
          .innerJoin(
            retentionCards,
            and(
              eq(retentionCards.profileId, person.id),
              lt(retentionCards.nextReviewAt, sql`NOW()`),
            ),
          )
          .innerJoin(
            curriculumTopics,
            eq(curriculumTopics.id, retentionCards.topicId),
          )
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, curriculumTopics.bookId),
          )
          .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
          .innerJoin(
            subjects,
            and(
              eq(subjects.id, curriculumBooks.subjectId),
              eq(subjects.id, curricula.subjectId),
              eq(subjects.profileId, person.id),
              ne(subjects.status, 'archived'),
            ),
          )
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
              consentGateSatisfiedSql(sql`${person.id}`),
              notExists(
                db
                  .select({ _: sql`1` })
                  .from(notificationLog)
                  .where(
                    and(
                      eq(notificationLog.profileId, person.id),
                      eq(notificationLog.type, 'review_reminder'),
                      sql`${notificationLog.sentAt} >= (NOW() AT TIME ZONE COALESCE(${organization.timezone}, 'UTC'))::date`,
                    ),
                  ),
              ),
            ),
          )
          .groupBy(person.id);
      return results.map((r) => ({
        profileId: r.profileId,
        overdueCount: r.overdueCount,
        topTopicIds: r.topTopicIds ?? [],
      }));
    });

    if (eligible.length === 0) {
      return { status: 'completed', eligibleCount: 0, sentEvents: 0 };
    }

    // Step 2: Fan out — one event per eligible profile
    const BATCH_SIZE = 500;
    let sentEvents = 0;
    for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
      const chunk = eligible.slice(i, i + BATCH_SIZE);
      await step.sendEvent(
        `fan-out-${i}`,
        chunk.map((profile) => ({
          name: 'app/retention.review-due' as const,
          data: {
            profileId: profile.profileId,
            overdueCount: profile.overdueCount,
            topTopicIds: profile.topTopicIds,
          },
        })),
      );
      sentEvents += chunk.length;
    }

    return {
      status: 'completed',
      eligibleCount: eligible.length,
      sentEvents,
    };
  },
);
