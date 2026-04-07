// ---------------------------------------------------------------------------
// Daily Learning Plan Service
// Builds a prioritized list of today's actions for the home screen coaching
// card. Runs parallel queries to keep latency low.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import { profiles, accounts } from '@eduagent/database';
import type { Database } from '@eduagent/database';
import type { DailyPlan, DailyPlanItem } from '@eduagent/schemas';
import { getProfileOverdueCount } from './retention-data';
import { getContinueSuggestion } from './progress';
import { getStreakData } from './streaks';
import { resolveProfileRole, type ProfileRole } from './profile';

export async function getDailyPlan(
  db: Database,
  profileId: string
): Promise<DailyPlan> {
  // Timezone lives on accounts, not profiles — join to retrieve it
  const [profileRow] = await db
    .select({ timezone: accounts.timezone })
    .from(profiles)
    .innerJoin(accounts, eq(profiles.accountId, accounts.id))
    .where(eq(profiles.id, profileId))
    .limit(1);

  const timezone = profileRow?.timezone ?? null;

  // Run all queries in parallel to minimise latency
  const [overdue, suggestion, streak, role] = await Promise.all([
    getProfileOverdueCount(db, profileId),
    getContinueSuggestion(db, profileId),
    getStreakData(db, profileId),
    resolveProfileRole(db, profileId),
  ]);

  const items: DailyPlanItem[] = [];

  // Priority 1: Fading topics are most urgent — surface first
  if (overdue.overdueCount > 0) {
    items.push({
      type: 'review',
      title: `${overdue.overdueCount} review${
        overdue.overdueCount > 1 ? 's' : ''
      } due`,
      subtitle: `About ${overdue.overdueCount * 2} minutes`,
      estimatedMinutes: overdue.overdueCount * 2,
      route: '/(learner)/topic/recall-test',
    });
  }

  // Priority 2: Continue the in-progress topic
  if (suggestion) {
    items.push({
      type: 'continue',
      title: suggestion.topicTitle,
      subtitle: `Continue in ${suggestion.subjectName}`,
      route: '/(learner)/session',
      topicId: suggestion.topicId,
      subjectId: suggestion.subjectId,
    });
  }

  // Priority 3: Streak motivation (only shown when streak is active)
  if (streak.currentStreak > 0) {
    items.push({
      type: 'streak',
      title: `${streak.currentStreak} day streak`,
      subtitle: streak.isOnGracePeriod
        ? `${streak.graceDaysRemaining} day${
            streak.graceDaysRemaining === 1 ? '' : 's'
          } left to keep it`
        : 'Keep it going!',
      route: '/(learner)/home',
    });
  }

  return {
    greeting: getGreeting(role, timezone),
    items: items.slice(0, 4),
    streakDays: streak.currentStreak,
  };
}

/**
 * Returns a time-of-day-aware greeting based on the profile's stored timezone.
 * Falls back to UTC when no timezone is set.
 */
function getGreeting(role: ProfileRole, timezone: string | null): string {
  let hour: number;
  try {
    // Use the profile's timezone so "Good morning" reflects their local time
    const localTime = timezone
      ? new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
      : new Date();
    hour = localTime.getHours();
  } catch {
    // Invalid timezone string — fall back to UTC
    hour = new Date().getUTCHours();
  }

  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  if (role === 'guardian') {
    return `Good ${timeOfDay}`;
  }

  const greetings: Record<string, [string, string]> = {
    morning: ["Let's get started", 'Ready for today?'],
    afternoon: ['Welcome back', 'Good to see you'],
    evening: ['Evening session?', 'One more round?'],
  };
  const options = greetings[timeOfDay]!;
  return options[Math.floor(Math.random() * options.length)]!;
}
