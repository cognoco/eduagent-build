// @inngest-admin: cross-profile
//
// This function is intentionally cross-profile. It scans all profiles with
// overdue retention cards whose local time is ~8 AM to fan out recall nudge
// notifications. Profile-scoping rules in AGENTS.md ("Reads must use
// createScopedRepository") do NOT apply here — this is system-wide work
// running outside any single profile's request context.
//
// If you add raw drizzle queries to this file, ensure they cannot leak
// data between profiles in user-visible output (notifications,
// recommendations). When in doubt, scope by profileId at the leaf even
// when scanning broadly.

// ---------------------------------------------------------------------------
// Recall Nudge — Hourly cron that finds profiles with fading topics at their
// local ~8 AM, then fans out per-profile events for independent delivery.
// ---------------------------------------------------------------------------

import { sql, eq, lt, and, notExists, isNull, ne } from 'drizzle-orm';
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

export const recallNudge = inngest.createFunction(
  { id: 'recall-nudge', name: 'Smart recall nudge (hourly)' },
  { cron: '0 * * * *' }, // Every hour — filters by local 8 AM
  async ({ step }) => {
    // Step 1: Find profiles whose local time is ~8 AM and have overdue cards
    const eligible = await step.run('find-eligible-profiles', async () => {
      const db = getStepDatabase();

      // Query profiles where:
      // 1. Account timezone maps to local hour 7-9 (±1h window around 8 AM)
      // 2. Has retention cards with nextReviewAt in the past
      // 3. Push notifications are enabled
      // 4. Consent is granted or not required (adult with no consent record)

      // [CUT-B2] v2 scan: profiles×accounts → person×membership×organization;
      // learning joins unchanged; consent gate from the shared windowed
      // predicate; timezone from organization.
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
        .innerJoin(organization, eq(organization.id, membership.organizationId))
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
          ),
        )
        .where(
          and(
            isNull(person.archivedAt),
            consentGateSatisfiedSql(sql`${person.id}`),
            sql`(NOW() AT TIME ZONE COALESCE(${organization.timezone}, 'UTC'))::time >= TIME '07:30'
                  AND (NOW() AT TIME ZONE COALESCE(${organization.timezone}, 'UTC'))::time < TIME '08:30'`,
            notExists(
              db
                .select({ _: sql`1` })
                .from(notificationLog)
                .where(
                  and(
                    eq(notificationLog.profileId, person.id),
                    eq(notificationLog.type, 'recall_nudge'),
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

    // Step 2: Fan out — one event per eligible profile for independent retries.
    // Batch in chunks of 500 to stay within Inngest sendEvent limits.
    const BATCH_SIZE = 500;
    let sentEvents = 0;
    for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
      const chunk = eligible.slice(i, i + BATCH_SIZE);
      await step.sendEvent(
        `fan-out-${i}`,
        chunk.map((profile) => ({
          name: 'app/recall-nudge.send' as const,
          data: {
            profileId: profile.profileId,
            fadingCount: profile.overdueCount,
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
