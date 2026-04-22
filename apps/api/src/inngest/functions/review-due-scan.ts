// ---------------------------------------------------------------------------
// Review Due Scan — Cron that finds profiles with overdue retention cards
// and fans out per-profile events for independent notification delivery.
// ---------------------------------------------------------------------------

import { sql, eq, lt, and, or, exists, notExists } from 'drizzle-orm';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  profiles,
  accounts,
  retentionCards,
  notificationPreferences,
  notificationLog,
  consentStates,
} from '@eduagent/database';

export const reviewDueScan = inngest.createFunction(
  { id: 'review-due-scan', name: 'Review due scan (every 2h)' },
  { cron: '0 */2 * * *' }, // Every 2 hours
  async ({ step }) => {
    // Step 1: Find profiles with overdue retention cards
    const eligible = await step.run('find-overdue-profiles', async () => {
      const db = getStepDatabase();

      const results = await db
        .select({
          profileId: profiles.id,
          overdueCount: sql<number>`count(${retentionCards.id})::int`,
          topTopicIds: sql<
            string[]
          >`(array_agg(${retentionCards.topicId} ORDER BY ${retentionCards.nextReviewAt} ASC))[1:3]`,
        })
        .from(profiles)
        .innerJoin(accounts, eq(profiles.accountId, accounts.id))
        .innerJoin(
          retentionCards,
          and(
            eq(retentionCards.profileId, profiles.id),
            lt(retentionCards.nextReviewAt, sql`NOW()`)
          )
        )
        .innerJoin(
          notificationPreferences,
          and(
            eq(notificationPreferences.profileId, profiles.id),
            eq(notificationPreferences.pushEnabled, true),
            eq(notificationPreferences.reviewReminders, true)
          )
        )
        .where(
          and(
            // Consent: CONSENTED record exists, or no consent records at all (adults)
            or(
              exists(
                db
                  .select({ _: sql`1` })
                  .from(consentStates)
                  .where(
                    and(
                      eq(consentStates.profileId, profiles.id),
                      eq(consentStates.status, 'CONSENTED')
                    )
                  )
              ),
              notExists(
                db
                  .select({ _: sql`1` })
                  .from(consentStates)
                  .where(eq(consentStates.profileId, profiles.id))
              )
            ),
            // Dedup: skip profiles that already received a review_reminder today
            // (using account timezone for date boundary to handle DST correctly)
            notExists(
              db
                .select({ _: sql`1` })
                .from(notificationLog)
                .where(
                  and(
                    eq(notificationLog.profileId, profiles.id),
                    eq(notificationLog.type, 'review_reminder'),
                    sql`${notificationLog.sentAt} >= (NOW() AT TIME ZONE COALESCE(${accounts.timezone}, 'UTC'))::date`
                  )
                )
            )
          )
        )
        .groupBy(profiles.id);

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
        }))
      );
      sentEvents += chunk.length;
    }

    return {
      status: 'completed',
      eligibleCount: eligible.length,
      sentEvents,
    };
  }
);
