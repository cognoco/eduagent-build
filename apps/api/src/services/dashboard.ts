// ---------------------------------------------------------------------------
// Parent Dashboard Data — Story 4.11
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

export interface DashboardInput {
  childProfileId: string;
  displayName: string;
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  totalTimeThisWeekMinutes: number;
  totalTimeLastWeekMinutes: number;
  subjectRetentionData: Array<{
    name: string;
    status: 'strong' | 'fading' | 'weak';
  }>;
  guidedCount: number;
  totalProblemCount: number;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Generates a one-sentence summary for a child's progress.
 *
 * Example: "Alex: Math — 5 problems, 3 guided. Science fading. 4 sessions this week (up from 2 last week)."
 */
export function generateChildSummary(input: DashboardInput): string {
  const parts: string[] = [];

  // Subject details
  const subjectParts: string[] = [];
  for (const subject of input.subjectRetentionData) {
    if (subject.status === 'fading' || subject.status === 'weak') {
      subjectParts.push(`${subject.name} ${subject.status}`);
    }
  }

  // Problem stats
  if (input.totalProblemCount > 0) {
    parts.push(
      `${input.totalProblemCount} problems, ${input.guidedCount} guided`
    );
  }

  // Fading/weak subjects
  if (subjectParts.length > 0) {
    parts.push(subjectParts.join(', '));
  }

  // Session trend
  const trend = calculateTrend(input.sessionsThisWeek, input.sessionsLastWeek);
  const trendArrow =
    trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192';
  const trendWord =
    trend === 'up'
      ? `up from ${input.sessionsLastWeek}`
      : trend === 'down'
      ? `down from ${input.sessionsLastWeek}`
      : 'same as';

  parts.push(
    `${input.sessionsThisWeek} sessions this week (${trendArrow} ${trendWord} last week)`
  );

  return `${input.displayName}: ${parts.join('. ')}.`;
}

/**
 * Calculates the trend between current and previous values.
 */
export function calculateTrend(
  current: number,
  previous: number
): 'up' | 'down' | 'stable' {
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'stable';
}

/**
 * Calculates the guided-vs-immediate ratio.
 *
 * Returns 0-1 ratio where 1 means all problems were guided.
 * Returns 0 if totalCount is 0.
 */
export function calculateGuidedRatio(guided: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(1, Math.max(0, guided / total));
}
