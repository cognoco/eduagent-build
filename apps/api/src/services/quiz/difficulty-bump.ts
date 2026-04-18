const REQUIRED_PERFECT_STREAK = 3;
const MAX_AGE_DAYS = 14;

interface CompletedRound {
  score: number | null;
  total: number;
  completedAt: Date | null;
}

export function shouldApplyDifficultyBump(
  recentRounds: CompletedRound[]
): boolean {
  if (recentRounds.length < REQUIRED_PERFECT_STREAK) return false;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

  const last3 = recentRounds.slice(0, REQUIRED_PERFECT_STREAK);

  return last3.every((round) => {
    if (round.score == null || round.completedAt == null) return false;
    if (round.completedAt < cutoff) return false;
    return round.score === round.total;
  });
}
