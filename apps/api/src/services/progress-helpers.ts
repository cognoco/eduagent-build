// Shared helpers for date formatting and progress snapshot math.
// Used by dashboard, weekly-progress-push, and weekly-report services.

import type { ProgressMetrics } from '@eduagent/schemas';

/** Format a Date as an ISO date string (YYYY-MM-DD). */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Return a new Date shifted backwards by `days` UTC days. */
export function subtractDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

/** Sum `topicsExplored` across all subjects in a progress snapshot. */
export function sumTopicsExplored(metrics: ProgressMetrics): number {
  return metrics.subjects.reduce(
    (sum, subject) => sum + (subject.topicsExplored ?? 0),
    0
  );
}
