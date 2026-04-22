// ---------------------------------------------------------------------------
// Recall Nudge — Hourly cron that finds profiles with fading topics at their
// local ~8 AM, then fans out per-profile events for independent delivery.
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
            eq(notificationPreferences.pushEnabled, true)
          )
        )
        .where(
          and(
            // Consent: at least one CONSENTED record, or no consent records at all (adults).
            // Uses EXISTS/NOT EXISTS instead of LEFT JOIN to avoid row multiplication
            // when a profile has multiple consent_states rows (different consentType).
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
            // Timezone bucketing: local time within 07:30–08:30 (single 1h window)
            // Prevents duplicate nudges across hourly cron runs while still
            // covering half-hour timezone offsets (UTC+5:30, etc.)
            sql`(NOW() AT TIME ZONE COALESCE(${accounts.timezone}, 'UTC'))::time >= TIME '07:30'
                AND (NOW() AT TIME ZONE COALESCE(${accounts.timezone}, 'UTC'))::time < TIME '08:30'`,
            // Dedup guard: skip profiles that already received a recall_nudge today.
            // Prevents double fan-out if Inngest retries the step or the cron
            // fires a second run while a previous one is still in progress.
            notExists(
              db
                .select({ _: sql`1` })
                .from(notificationLog)
                .where(
                  and(
                    eq(notificationLog.profileId, profiles.id),
                    eq(notificationLog.type, 'recall_nudge'),
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
