// ---------------------------------------------------------------------------
// XP Tracking — Story 4.5
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

export interface XpEvent {
  profileId: string;
  topicId: string;
  subjectId: string;
  amount: number;
  status: 'pending' | 'verified' | 'decayed';
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Calculates XP for a topic based on mastery score and verification depth.
 *
 * Base XP: 100 * masteryScore
 * Depth bonus: recall = 1x, explain = 1.5x, transfer = 2x
 * Result is rounded to the nearest integer.
 */
export function calculateTopicXp(
  masteryScore: number,
  verificationDepth: 'recall' | 'explain' | 'transfer'
): number {
  const baseXp = 100 * masteryScore;

  const depthMultiplier: Record<string, number> = {
    recall: 1,
    explain: 1.5,
    transfer: 2,
  };

  return Math.round(baseXp * depthMultiplier[verificationDepth]);
}

/**
 * Verifies pending XP — returns the verified amount (same as pending).
 */
export function verifyXp(pendingAmount: number): number {
  return pendingAmount;
}

/**
 * Decays XP proportionally based on mastery drop.
 *
 * The decay is proportional: currentAmount * masteryDrop
 * Result is subtracted from currentAmount, never goes below 0.
 */
export function decayXp(currentAmount: number, masteryDrop: number): number {
  const decayAmount = currentAmount * masteryDrop;
  return Math.max(0, Math.round(currentAmount - decayAmount));
}
