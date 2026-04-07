// ---------------------------------------------------------------------------
// Recall Nudge — Hourly cron that finds profiles with fading topics at their
// local ~8 AM, then fans out per-profile events for independent delivery.
// ---------------------------------------------------------------------------

import { sql, eq, lt, and, or, isNull } from 'drizzle-orm';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  profiles,
  accounts,
  retentionCards,
  notificationPreferences,
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
        .leftJoin(consentStates, eq(consentStates.profileId, profiles.id))
        .where(
          and(
            // Consent: CONSENTED or no consent record (adults)
            or(eq(consentStates.status, 'CONSENTED'), isNull(consentStates.id)),
            // Timezone bucketing: local hour ≈ 8 AM (7-9 window)
            // Handles half-hour offsets (UTC+5:30, etc.) and defaults to UTC
            sql`EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(${accounts.timezone}, 'UTC'))) BETWEEN 7 AND 9`
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
