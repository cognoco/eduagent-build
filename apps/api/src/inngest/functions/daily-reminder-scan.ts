// @inngest-admin: cross-profile
//
// This function is intentionally cross-profile. It scans all profiles with
// active streaks whose local time is ~9 AM to fan out daily reminder notifications.
// Profile-scoping rules in AGENTS.md ("Reads must use createScopedRepository")
// do NOT apply here — this is system-wide work running outside any single
// profile's request context.
//
// If you add raw drizzle queries to this file, ensure they cannot leak
// data between profiles in user-visible output (notifications,
// recommendations). When in doubt, scope by profileId at the leaf even
// when scanning broadly.

// ---------------------------------------------------------------------------
// Daily Reminder Scan — Hourly cron that finds profiles with active streaks
// at their local ~9 AM, then fans out per-profile events for daily nudges.
// ---------------------------------------------------------------------------

import { sql, eq, gt, and, notExists, isNull } from 'drizzle-orm';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  streaks,
  notificationPreferences,
  notificationLog,
  membership,
  organization,
  person,
} from '@eduagent/database';
import { consentGateSatisfiedSql } from '../../services/identity-v2/consent-status-v2';

export const dailyReminderScan = inngest.createFunction(
  { id: 'daily-reminder-scan', name: 'Daily reminder scan (hourly)' },
  { cron: '0 * * * *' }, // Hourly — filters by local 9 AM
  async ({ step }) => {
    // Step 1: Find profiles with active streaks at their local morning
    const eligible = await step.run('find-streak-profiles', async () => {
      const db = getStepDatabase();

      // [CUT-B2] v2 scan: profiles×accounts → person×membership×organization;
      // timezone from organization; the consent CONSENTED-EXISTS-OR-no-rows
      // filter from the shared consentGateSatisfiedSql (current-row windowed).
      const results = await db
        .select({
          profileId: person.id,
          currentStreak: streaks.currentStreak,
        })
        .from(person)
        .innerJoin(membership, eq(membership.personId, person.id))
        .innerJoin(organization, eq(organization.id, membership.organizationId))
        .innerJoin(
          streaks,
          and(eq(streaks.profileId, person.id), gt(streaks.currentStreak, 0)),
        )
        .innerJoin(
          notificationPreferences,
          and(
            eq(notificationPreferences.profileId, person.id),
            eq(notificationPreferences.pushEnabled, true),
            eq(notificationPreferences.dailyReminders, true),
          ),
        )
        .where(
          and(
            isNull(person.archivedAt),
            consentGateSatisfiedSql(sql`${person.id}`),
            sql`(NOW() AT TIME ZONE COALESCE(${organization.timezone}, 'UTC'))::time >= TIME '08:30'
                AND (NOW() AT TIME ZONE COALESCE(${organization.timezone}, 'UTC'))::time < TIME '09:30'`,
            notExists(
              db
                .select({ _: sql`1` })
                .from(notificationLog)
                .where(
                  and(
                    eq(notificationLog.profileId, person.id),
                    eq(notificationLog.type, 'daily_reminder'),
                    sql`${notificationLog.sentAt} >= (NOW() AT TIME ZONE COALESCE(${organization.timezone}, 'UTC'))::date`,
                  ),
                ),
            ),
          ),
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
