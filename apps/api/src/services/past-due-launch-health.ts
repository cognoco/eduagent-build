import { eq, sql } from 'drizzle-orm';
import { subscription, type Database } from '@eduagent/database';

export interface PastDueLaunchHealthSignal {
  message: 'billing.past_due_aged' | 'billing.past_due_grace_exceeded';
  level: 'warning' | 'error';
  tags: {
    surface: 'billing';
    signal: 'past-due-aged' | 'past-due-grace-exceeded';
    environment: string;
  };
  extra: {
    count: number;
    observed_at: string;
    age_threshold_hours?: 24;
  };
}

interface SignalInput {
  environment: string;
  agedPastDueCount: number;
  graceExceededCount: number;
  observedAt: string;
}

export function buildPastDueLaunchHealthSignals(
  input: SignalInput,
): PastDueLaunchHealthSignal[] {
  const signals: PastDueLaunchHealthSignal[] = [];

  if (input.agedPastDueCount > 0) {
    signals.push({
      message: 'billing.past_due_aged',
      level: 'warning',
      tags: {
        surface: 'billing',
        signal: 'past-due-aged',
        environment: input.environment,
      },
      extra: {
        count: input.agedPastDueCount,
        age_threshold_hours: 24,
        observed_at: input.observedAt,
      },
    });
  }

  if (input.graceExceededCount > 0) {
    signals.push({
      message: 'billing.past_due_grace_exceeded',
      level: 'error',
      tags: {
        surface: 'billing',
        signal: 'past-due-grace-exceeded',
        environment: input.environment,
      },
      extra: {
        count: input.graceExceededCount,
        observed_at: input.observedAt,
      },
    });
  }

  return signals;
}

export async function countPastDueLaunchHealth(
  db: Database,
  observedAt: Date,
): Promise<{ agedPastDueCount: number; graceExceededCount: number }> {
  const agedCutoff = new Date(observedAt.getTime() - 24 * 60 * 60 * 1000);
  const [result] = await db
    .select({
      // updatedAt is the canonical row's only status-transition timestamp.
      // A provider event that leaves the row past_due refreshes it, correctly
      // restarting the "remained past due" clock.
      agedPastDueCount: sql<number>`count(*) filter (
        where ${subscription.updatedAt} <= ${agedCutoff}
      )::int`,
      // periodEndAt carries a provider-declared grace deadline when one exists.
      // Null means "no declared deadline", not "deadline already exceeded".
      graceExceededCount: sql<number>`count(*) filter (
        where ${subscription.periodEndAt} is not null
          and ${subscription.periodEndAt} <= ${observedAt}
      )::int`,
    })
    .from(subscription)
    .where(eq(subscription.status, 'past_due'));

  return {
    agedPastDueCount: result?.agedPastDueCount ?? 0,
    graceExceededCount: result?.graceExceededCount ?? 0,
  };
}
