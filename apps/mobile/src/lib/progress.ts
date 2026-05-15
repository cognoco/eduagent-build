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
