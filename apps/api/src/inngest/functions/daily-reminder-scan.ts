// ---------------------------------------------------------------------------
// Daily Reminder Scan — Hourly cron that finds profiles with active streaks
// at their local ~9 AM, then fans out per-profile events for daily nudges.
// ---------------------------------------------------------------------------

import { sql, eq, gt, and, or, exists, notExists } from 'drizzle-orm';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  profiles,
  accounts,
  streaks,
  notificationPreferences,
  notificationLog,
  consentStates,
} from '@eduagent/database';

export const dailyReminderScan = inngest.createFunction(
  { id: 'daily-reminder-scan', name: 'Daily reminder scan (hourly)' },
  { cron: '0 * * * *' }, // Hourly — filters by local 9 AM
  async ({ step }) => {
    // Step 1: Find profiles with active streaks at their local morning
    const eligible = await step.run('find-streak-profiles', async () => {
      const db = getStepDatabase();

      const results = await db
        .select({
          profileId: profiles.id,
          currentStreak: streaks.currentStreak,
        })
        .from(profiles)
        .innerJoin(accounts, eq(profiles.accountId, accounts.id))
        .innerJoin(
          streaks,
          and(eq(streaks.profileId, profiles.id), gt(streaks.currentStreak, 0))
        )
        .innerJoin(
          notificationPreferences,
          and(
            eq(notificationPreferences.profileId, profiles.id),
            eq(notificationPreferences.pushEnabled, true),
            eq(notificationPreferences.dailyReminders, true)
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
            // Timezone bucketing: local time within 08:30–09:30
            // One hour after the recall-nudge window to avoid notification clustering
            sql`(NOW() AT TIME ZONE COALESCE(${accounts.timezone}, 'UTC'))::time >= TIME '08:30'
                AND (NOW() AT TIME ZONE COALESCE(${accounts.timezone}, 'UTC'))::time < TIME '09:30'`,
            // Dedup: skip profiles that already received a daily_reminder today
            notExists(
              sql`SELECT 1 FROM ${notificationLog} nl
                  WHERE nl.profile_id = ${profiles.id}
                    AND nl.type = 'daily_reminder'
                    AND nl.sent_at >= (NOW() AT TIME ZONE COALESCE(${accounts.timezone}, 'UTC'))::date`
            )
          )
        );

      return results.map((r) => ({
        profileId: r.profileId,
        streakDays: r.currentStreak,
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
          name: 'app/daily-reminder.send' as const,
          data: {
            profileId: profile.profileId,
            streakDays: profile.streakDays,
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
