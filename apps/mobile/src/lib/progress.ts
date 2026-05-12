export function formatWeekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatMonthLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildGrowthData(
  history:
    | {
        dataPoints: Array<{
          date: string;
          topicsMastered: number;
          vocabularyTotal: number;
        }>;
      }
    | null
    | undefined,
) {
  const points = history?.dataPoints ?? [];

  return points.slice(-8).map((point, index) => {
    const previous = points[index - 1];
    return {
      label: formatWeekLabel(point.date),
      value: Math.max(
        0,
        point.topicsMastered - (previous?.topicsMastered ?? 0),
      ),
      secondaryValue:
        point.vocabularyTotal > 0
          ? Math.max(
              0,
              point.vocabularyTotal - (previous?.vocabularyTotal ?? 0),
            )
          : undefined,
    };
  });
}

export const STALE_PROFILE_HEURISTIC = {
  maxFreshSessionCount: 2,
  staleAfterDays: 14,
} as const;

export function isProfileStale(input: {
  sessionCount: number;
  lastSessionAt: string | null;
  now?: Date;
}): boolean {
  if (input.sessionCount === 0) return true;
  if (input.sessionCount > STALE_PROFILE_HEURISTIC.maxFreshSessionCount) {
    return false;
  }
  if (!input.lastSessionAt) return true;

  const lastSessionAt = new Date(input.lastSessionAt);
  if (Number.isNaN(lastSessionAt.getTime())) return true;

  const now = input.now ?? new Date();
  const ageDays =
    (now.getTime() - lastSessionAt.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays > STALE_PROFILE_HEURISTIC.staleAfterDays;
}
